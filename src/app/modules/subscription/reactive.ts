/**
 * SUBSCRIPTION AUTO-RENEWAL & MONITORING (corrected)
 *
 * 1. requireActiveSubscription middleware
 * 2. Reconciliation cron — safety net for missed/failed webhooks
 *
 * Webhooks remain the PRIMARY source of truth. This only catches drift.
 */

import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import cron, { ScheduledTask } from 'node-cron';
import { User } from '../user/user.model';
import AppError from '../../errors/AppError';
import { SubscriptionService } from './subscription.services';
import { logger } from '../../../shared/logger';

/* ----------------------------- middleware -------------------------------- */

export const requireActiveSubscription = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.id; // optional chaining — req.user may be undefined
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
    }

    const user = await User.findById(userId).select('subscription');
    if (user?.subscription?.isActive !== true) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Active subscription required to access this resource',
      );
    }
    next();
  } catch (err) {
    next(err);
  }
};

/* ----------------------------- monitoring -------------------------------- */

const PAST_DUE_GRACE_DAYS = Number(process.env.PAST_DUE_GRACE_DAYS || 7);
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const monitorSubscriptions = async (): Promise<void> => {
  logger.info('[Subscription Monitor] Starting reconciliation cycle');

  let processed = 0;
  let synced = 0;
  let cleaned = 0;
  let errors = 0;

  // Cursor: stream users instead of loading them all into memory.
  const cursor = User.find({
    'subscription.isActive': true,
    is_deleted: false,
  })
    .select('_id email subscription')
    .cursor();

  for await (const user of cursor) {
    processed++;
    try {
      const subId = user.subscription?.stripeSubscriptionId;
      if (!subId) {
        logger.warn(
          `[Subscription Monitor] User ${user._id} isActive=true but no stripeSubscriptionId — flipping off`,
        );
        await SubscriptionService.patchSubscription(String(user._id), {
          isActive: false,
          status: 'inactive',
        });
        cleaned++;
        continue;
      }

      const stripeSub = await SubscriptionService.retrieveSubscription(subId);

      // Basil-safe period end via the service helper (NOT sub.current_period_end).
      const stripePeriodEnd =
        SubscriptionService.getCurrentPeriodEnd(stripeSub);
      const localPeriodEnd = user.subscription?.currentPeriodEnd;

      // 1) Terminal states -> sync (sets canceled/inactive) + stamp canceledAt.
      if (
        stripeSub.status === 'canceled' ||
        stripeSub.status === 'incomplete_expired'
      ) {
        await SubscriptionService.syncSubscriptionToDb(stripeSub);
        await SubscriptionService.patchSubscription(String(user._id), {
          canceledAt: new Date(),
        });
        cleaned++;
        logger.info(
          `[Subscription Monitor] Reconciled terminal sub for user ${user._id} (${stripeSub.status})`,
        );
        continue;
      }

      // 2) Drift (status mismatch OR period advanced) -> resync.
      const periodDrifted =
        !localPeriodEnd ||
        Math.abs(stripePeriodEnd.getTime() - localPeriodEnd.getTime()) > 60000;
      const statusDrifted =
        SubscriptionService.mapStripeStatus(stripeSub.status) !==
        user.subscription?.status;

      if (periodDrifted || statusDrifted) {
        await SubscriptionService.syncSubscriptionToDb(stripeSub);
        synced++;
        logger.info(
          `[Subscription Monitor] Synced drift for user ${user._id} (period=${periodDrifted}, status=${statusDrifted})`,
        );
      }

      // 3) past_due beyond grace -> flag for dunning.
      if (stripeSub.status === 'past_due') {
        const ref = localPeriodEnd?.getTime() ?? Date.now();
        const daysPastDue = Math.floor((Date.now() - ref) / MS_PER_DAY);
        if (daysPastDue > PAST_DUE_GRACE_DAYS) {
          logger.warn(
            `[Subscription Monitor] User ${user._id} past_due ~${daysPastDue} days`,
          );
          // await NotificationService.sendDunningEmail(user);
        }
      }
    } catch (err) {
      errors++;
      logger.error(
        `[Subscription Monitor] Error reconciling user ${user._id}`,
        err,
      );
    }
  }

  logger.info(
    `[Subscription Monitor] Cycle complete. Processed: ${processed}, Synced: ${synced}, Cleaned: ${cleaned}, Errors: ${errors}`,
  );
};

/* ----------------------------- scheduler --------------------------------- */

/**
 * Schedule reconciliation (default every 6h).
 *
 * MULTI-INSTANCE: cron fires on every process. Set RUN_CRON=false on all but one
 * instance (or use a distributed lock) so it doesn't run N times in parallel.
 *
 * Call this AFTER your DB connection resolves in the server bootstrap, e.g.:
 *   await connectDB(); initSubscriptionMonitoring();
 */
export const initSubscriptionMonitoring = (): ScheduledTask | null => {
  if (process.env.RUN_CRON === 'false') {
    logger.info(
      '[Subscription Monitor] RUN_CRON=false — disabled on this instance',
    );
    return null;
  }

  const schedule = process.env.SUBSCRIPTION_MONITOR_SCHEDULE || '0 */6 * * *';
  const job = cron.schedule(schedule, () => {
    monitorSubscriptions().catch(err =>
      logger.error('[Subscription Monitor] Scheduled run failed', err),
    );
  });

  logger.info(`[Subscription Monitor] Initialized with schedule: ${schedule}`);

  // Kick off one run now without blocking startup.
  monitorSubscriptions().catch(err =>
    logger.error('[Subscription Monitor] Initial run failed', err),
  );

  return job;
};

/** Manual trigger (admin-only). Wired at POST /api/v1/subscriptions/sync. */
export const manualSyncSubscriptions = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  try {
    logger.info('[Subscription Monitor] Manual sync triggered');
    await monitorSubscriptions();
    return { success: true, message: 'Subscription sync completed' };
  } catch (err) {
    logger.error('[Subscription Monitor] Manual sync failed', err);
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Failed to sync subscriptions',
    );
  }
};

export default requireActiveSubscription;
