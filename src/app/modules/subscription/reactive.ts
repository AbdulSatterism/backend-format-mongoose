/**
 * SUBSCRIPTION AUTO-RENEWAL & MONITORING
 *
 * This module handles:
 * 1. Middleware to check if user has active subscription
 * 2. Scheduled monitoring to detect payment failures
 * 3. Safety net for webhook failures
 *
 * HOW AUTO-RENEWAL WORKS:
 * - Stripe handles monthly charging automatically
 * - Webhooks keep DB in sync with Stripe state
 * - This monitoring ensures we catch issues webhooks might miss
 */

import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import cron from 'node-cron';
import { User } from '../user/user.model';
import AppError from '../../errors/AppError';
import { SubscriptionService } from './subscription.services';
import { logger } from '../../../shared/logger';

/**
 * MIDDLEWARE: Require Active Subscription
 * Protect routes that require a paid subscription
 */
export const requireActiveSubscription = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.id;
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

/**
 * MONITORING: Check for failed payments and syncing issues
 * Runs every 6 hours to detect:
 * - Subscriptions past_due for too long (auto-cleanup)
 * - Subscriptions that should be renewed but aren't
 * - Webhooks that might have failed
 *
 * This is a SAFETY NET - primary sync happens via webhooks
 */
const monitorSubscriptions = async () => {
  try {
    logger.info(
      '[Subscription Monitor] Starting subscription monitoring cycle',
    );

    // Find all active subscriptions
    const activeSubscriptions = await User.find({
      'subscription.isActive': true,
      is_deleted: false,
    }).select('_id subscription email');

    let synced = 0;
    let errors = 0;
    let cleaned = 0;

    for (const user of activeSubscriptions) {
      try {
        if (!user.subscription?.stripeSubscriptionId) {
          logger.warn(
            `[Subscription Monitor] User ${user._id} has isActive=true but no stripeSubscriptionId`,
          );
          continue;
        }

        // Retrieve current subscription state from Stripe
        const stripeSubscription =
          await SubscriptionService.retrieveSubscription(
            user.subscription.stripeSubscriptionId,
          );

        // Check if local state matches Stripe state
        if (!stripeSubscription.current_period_end) {
          logger.error(
            `[Subscription Monitor] Missing current_period_end for subscription ${user.subscription.stripeSubscriptionId}, user ${user._id}`,
          );
          errors++;
          continue;
        }

        const currentPeriodEnd = new Date(
          stripeSubscription.current_period_end * 1000,
        );
        const localPeriodEnd = user.subscription.currentPeriodEnd;

        if (!localPeriodEnd) {
          logger.error(
            `[Subscription Monitor] Missing localPeriodEnd for user ${user._id}, syncing from Stripe`,
          );
          await SubscriptionService.syncSubscriptionToDb(stripeSubscription);
          synced++;
          continue;
        }

        // If Stripe thinks this is not active, sync to reflect that
        if (
          stripeSubscription.status === 'canceled' &&
          user.subscription.isActive
        ) {
          logger.warn(
            `[Subscription Monitor] Detected canceled subscription for user ${user._id}, cleaning up`,
          );
          await SubscriptionService.patchSubscription(String(user._id), {
            status: 'canceled',
            isActive: false,
            canceledAt: new Date(),
          });
          cleaned++;
        }
        // If currentPeriodEnd changed, update it (monthly renewal)
        else if (
          Math.abs(currentPeriodEnd.getTime() - localPeriodEnd.getTime()) >
          60000
        ) {
          logger.info(
            `[Subscription Monitor] Period end updated for user ${user._id}, syncing`,
          );
          await SubscriptionService.syncSubscriptionToDb(stripeSubscription);
          synced++;
        }
        // If status is past_due for too long (>7 days), mark for cleanup
        else if (
          stripeSubscription.status === 'past_due' &&
          user.subscription.status === 'past_due'
        ) {
          const daysSinceFailed = Math.floor(
            (Date.now() - (user.subscription.lastSyncedAt?.getTime() || 0)) /
              (1000 * 60 * 60 * 24),
          );
          if (daysSinceFailed > 7) {
            logger.warn(
              `[Subscription Monitor] Subscription past_due for ${daysSinceFailed} days, user ${user._id}`,
            );
            // Optionally send email notification here
          }
        }
      } catch (err) {
        logger.error(
          `[Subscription Monitor] Error processing subscription for user ${user._id}`,
          err,
        );
        errors++;
      }
    }

    logger.info(
      `[Subscription Monitor] Cycle complete. Synced: ${synced}, Cleaned: ${cleaned}, Errors: ${errors}`,
    );
  } catch (err) {
    logger.error('[Subscription Monitor] Fatal error in monitoring cycle', err);
  }
};

//  * INITIALIZE MONITORING
//  * Schedule the monitoring job to run every 6 hours
//  * Format: "0 */6 * * *" = At minute 0, every 6 hours

export const initSubscriptionMonitoring = () => {
  try {
    const scheduleExpression =
      process.env.SUBSCRIPTION_MONITOR_SCHEDULE || '0 */6 * * *';
    const job = cron.schedule(scheduleExpression, monitorSubscriptions);

    logger.info(
      `[Subscription Monitor] Initialized with schedule: ${scheduleExpression}`,
    );

    // Run once on startup after 30 seconds delay to let DB connect
    setTimeout(() => {
      logger.info('[Subscription Monitor] Running initial check');
      monitorSubscriptions().catch(err =>
        logger.error('[Subscription Monitor] Initial check failed', err),
      );
    }, 30000);

    return job;
  } catch (err) {
    logger.error('[Subscription Monitor] Failed to initialize monitoring', err);
    throw err;
  }
};

/**
 * MANUAL SYNC ENDPOINT (Optional - for testing)
 * Can be called manually to force a sync without waiting for cron
 * Usage: POST /api/v1/subscriptions/sync (admin only)
 */
export const manualSyncSubscriptions = async () => {
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
