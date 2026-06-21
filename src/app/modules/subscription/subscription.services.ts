import Stripe from 'stripe';
import { StatusCodes } from 'http-status-codes';

import { User } from '../user/user.model';
import type { IUser } from '../user/user.interface';
import type {
  ISubscription,
  SubscriptionStatus,
} from './subscription.interface';
import AppError from '../../errors/AppError';
import { stripe, APP_URL } from './stripe';
import config from '../../../config';
import { logger } from '../../../shared/logger';

type StripeSubscription = Awaited<
  ReturnType<typeof stripe.subscriptions.retrieve>
>;
type StripeSubscriptionStatus = StripeSubscription['status'];

/** Map Stripe's status enum to our normalized status. */
const mapStripeStatus = (s: StripeSubscriptionStatus): SubscriptionStatus => {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    default: // incomplete, incomplete_expired, paused
      return 'inactive';
  }
};

/** Access is granted only while Stripe reports active/trialing. */
const computeIsActive = (s: StripeSubscriptionStatus): boolean =>
  s === 'active' || s === 'trialing';

/**
 * Read current period end. As of the Basil API (2025-03-31) this moved from the
 * Subscription object to each subscription ITEM. Read item-level first, fall
 * back to the legacy top-level field so it works on any pinned version.
 */
const getCurrentPeriodEnd = (sub: StripeSubscription): Date => {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  const legacyEnd = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const unix = itemEnd ?? legacyEnd;
  return unix ? new Date(unix * 1000) : new Date();
};

/** Get current period start (item-level, with legacy fallback). */
const getCurrentPeriodStart = (sub: StripeSubscription): Date => {
  const itemStart = sub.items?.data?.[0]?.current_period_start;
  const legacyStart = (sub as unknown as { current_period_start?: number })
    .current_period_start;
  const unix = itemStart ?? legacyStart;
  return unix ? new Date(unix * 1000) : new Date();
};

/**
 * Extract the subscription id from an Invoice. Basil moved this to
 * invoice.parent.subscription_details.subscription (legacy invoice.subscription
 * also handled), and it may be a string id or an expanded object.
 */
const getSubscriptionIdFromInvoice = (
  invoice: Stripe.Invoice,
): string | null => {
  const parent = (
    invoice as unknown as {
      parent?: {
        subscription_details?: { subscription?: string | { id: string } };
      };
    }
  ).parent;
  const fromParent = parent?.subscription_details?.subscription;
  const fromLegacy = (
    invoice as unknown as { subscription?: string | { id: string } }
  ).subscription;
  const value = fromParent ?? fromLegacy;
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
};

const customerIdOf = (
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
): string => (typeof customer === 'string' ? customer : customer.id);

/* -------------------------------------------------------------------------- */
/* Customer management                                                        */
/* -------------------------------------------------------------------------- */

const getOrCreateCustomer = async (
  user: IUser & { _id: unknown },
): Promise<string> => {
  const existing =
    user.stripe_customer_id || user.subscription?.stripeCustomerId;
  if (existing) return existing;

  try {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: String(user._id) },
    });

    await User.findByIdAndUpdate(user._id, {
      $set: { stripe_customer_id: customer.id },
    });

    logger.info(
      `[Subscription] Created Stripe customer ${customer.id} for user ${user._id}`,
    );

    return customer.id;
  } catch (error) {
    logger.error(
      `[Subscription] Failed to create Stripe customer for user ${user._id}`,
      error,
    );
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Failed to create Stripe customer',
    );
  }
};

/* -------------------------------------------------------------------------- */
/* Checkout                                                                   */
/* -------------------------------------------------------------------------- */

const createCheckoutSession = async (
  userId: string,
): Promise<{ url: string; sessionId: string }> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(StatusCodes.NOT_FOUND, 'User not found');

  if (user.subscription?.isActive) {
    logger.warn(
      `[Subscription] User ${userId} attempted to create session with active subscription`,
    );
    throw new AppError(
      StatusCodes.CONFLICT,
      'You already have an active subscription',
    );
  }

  const customerId = await getOrCreateCustomer(user);

  const successUrl = `${APP_URL}/api/v1/subscriptions/success`;
  const cancelUrl = `${APP_URL}/api/v1/subscriptions/cancel`;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: config.stripe.price_id as string, quantity: 1 }],
        client_reference_id: String(user._id),
        subscription_data: { metadata: { userId: String(user._id) } },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      {
        idempotencyKey: `checkout:${String(user._id)}:${config.stripe.price_id}`,
      },
    );

    if (!session.url) {
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Stripe did not return a Checkout URL',
      );
    }

    logger.info(
      `[Subscription] Checkout session created for user ${userId}: ${session.id}`,
    );

    return { url: session.url, sessionId: session.id };
  } catch (error) {
    logger.error(
      `[Subscription] Failed to create checkout session for user ${userId}`,
      error,
    );
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/* Status + cancel                                                            */
/* -------------------------------------------------------------------------- */

const getStatus = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(StatusCodes.NOT_FOUND, 'User not found');

  const sub = user.subscription;
  return {
    status: sub?.status ?? 'inactive',
    isActive: sub?.isActive ?? false,
    currentPeriodEnd: sub?.currentPeriodEnd
      ? sub.currentPeriodEnd.toISOString()
      : null,
    currentPeriodStart: sub?.currentPeriodStart
      ? sub.currentPeriodStart.toISOString()
      : null,
    stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    canceledAt: sub?.canceledAt ? sub.canceledAt.toISOString() : null,
  };
};

const cancel = async (userId: string, immediately = false) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(StatusCodes.NOT_FOUND, 'User not found');

  const subId = user.subscription?.stripeSubscriptionId;
  if (!subId) {
    logger.warn(
      `[Subscription] User ${userId} attempted to cancel non-existent subscription`,
    );
    throw new AppError(StatusCodes.NOT_FOUND, 'No subscription to cancel');
  }

  try {
    const subscription = immediately
      ? await stripe.subscriptions.cancel(subId)
      : await stripe.subscriptions.update(subId, {
          cancel_at_period_end: true,
        });

    await syncSubscriptionToDb(subscription);

    logger.info(
      `[Subscription] Subscription ${subId} canceled (immediately: ${immediately}) for user ${userId}`,
    );

    return {
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      status: subscription.status,
    };
  } catch (error) {
    logger.error(
      `[Subscription] Failed to cancel subscription ${subId} for user ${userId}`,
      error,
    );
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/* Source of truth: sync                                                      */
/* -------------------------------------------------------------------------- */

const resolveUserFromSubscription = async (
  subscription: StripeSubscription,
) => {
  const metaUserId = subscription.metadata?.userId;
  if (metaUserId) {
    const byMeta = await User.findById(metaUserId);
    if (byMeta) return byMeta;
  }
  const customerId = customerIdOf(subscription.customer);
  return User.findOne({
    $or: [
      { 'subscription.stripeSubscriptionId': subscription.id },
      { 'subscription.stripeCustomerId': customerId },
      { stripe_customer_id: customerId },
    ],
  });
};

/**
 * Write the canonical Stripe subscription into our DB.
 *
 * IMPORTANT: this REPLACES the whole embedded subscription sub-document. So we
 * must PRESERVE counters that live there (failedAttempts, lastErrorMessage) by
 * carrying the existing values forward — otherwise every sync would reset them
 * and incrementFailedAttempts could never climb past 1.
 */
const syncSubscriptionToDb = async (subscription: StripeSubscription) => {
  const user = await resolveUserFromSubscription(subscription);
  if (!user) {
    logger.warn(
      `[Subscription] No user found for subscription ${subscription.id}`,
    );
    return null;
  }

  const record: ISubscription = {
    stripeCustomerId: customerIdOf(subscription.customer),
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items?.data?.[0]?.price?.id || '',
    status: mapStripeStatus(subscription.status),
    currentPeriodStart: getCurrentPeriodStart(subscription),
    currentPeriodEnd: getCurrentPeriodEnd(subscription),
    canceledAt: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000)
      : undefined,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    isActive: computeIsActive(subscription.status),
    lastSyncedAt: new Date(),
    // PRESERVE the existing counter / message across a full-subdoc replace.
    failedAttempts: user.subscription?.failedAttempts ?? 0,
    lastErrorMessage: user.subscription?.lastErrorMessage,
  };

  try {
    const updated = await User.findByIdAndUpdate(
      user._id,
      { $set: { subscription: record } },
      { new: true },
    );

    logger.info(
      `[Subscription] Synced subscription ${subscription.id} for user ${user._id}. Status: ${record.status}, isActive: ${record.isActive}`,
    );

    return updated;
  } catch (error) {
    logger.error(
      `[Subscription] Failed to sync subscription ${subscription.id} for user ${user._id}`,
      error,
    );
    throw error;
  }
};

/** Patch only specific subscription fields (used by webhook edge cases). */
const patchSubscription = async (
  userId: string,
  patch: Partial<ISubscription>,
) => {
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) set[`subscription.${k}`] = v;
  set['subscription.lastSyncedAt'] = new Date();

  try {
    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: set },
      { new: true },
    );

    if (!updated) {
      logger.warn(
        `[Subscription] User ${userId} not found when attempting patch`,
      );
      return null;
    }

    logger.info(
      `[Subscription] Patched subscription for user ${userId}:`,
      patch,
    );
    return updated;
  } catch (error) {
    logger.error(
      `[Subscription] Failed to patch subscription for user ${userId}`,
      error,
    );
    throw error;
  }
};

/**
 * Increment the failed-payment counter and mark the subscription past_due.
 * Uses $inc + dotted $set so it does NOT wipe the rest of the sub-document.
 * Called from the webhook on invoice.payment_failed / payment_action_required.
 */
const incrementFailedAttempts = async (userId: string, message: string) => {
  try {
    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { 'subscription.failedAttempts': 1 },
        $set: {
          'subscription.status': 'past_due',
          'subscription.isActive': false,
          'subscription.lastErrorMessage': message,
          'subscription.lastSyncedAt': new Date(),
        },
      },
      { new: true },
    );

    logger.warn(
      `[Subscription] Incremented failedAttempts for user ${userId} (${message}). Now: ${updated?.subscription?.failedAttempts}`,
    );
    return updated;
  } catch (error) {
    logger.error(
      `[Subscription] Failed to increment failedAttempts for user ${userId}`,
      error,
    );
    throw error;
  }
};

const retrieveSubscription = (id: string) => stripe.subscriptions.retrieve(id);

export const SubscriptionService = {
  createCheckoutSession,
  getStatus,
  cancel,
  syncSubscriptionToDb,
  patchSubscription,
  incrementFailedAttempts,
  retrieveSubscription,
  getSubscriptionIdFromInvoice,
  // exposed for the reconciliation monitor:
  getCurrentPeriodEnd,
  getCurrentPeriodStart,
  mapStripeStatus,
};
