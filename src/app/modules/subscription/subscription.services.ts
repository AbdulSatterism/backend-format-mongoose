import Stripe from 'stripe';
import { StatusCodes } from 'http-status-codes';

import { stripe, STRIPE_PRICE_ID, APP_URL } from '../../../config/stripe';
import ApiError from '../../../errors/ApiError';
// NOTE: adjust this import to wherever your User model lives.
import { User } from '../user/user.model';
import type { IUser } from '../user/user.interface';
import type { ISubscription, SubscriptionStatus } from './subscription.interface';

/* -------------------------------------------------------------------------- */
/* Helpers (Stripe Basil-API aware)                                           */
/* -------------------------------------------------------------------------- */

/** Map Stripe's status enum to our normalized status. */
const mapStripeStatus = (
  s: Stripe.Subscription.Status,
): SubscriptionStatus => {
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
const computeIsActive = (s: Stripe.Subscription.Status): boolean =>
  s === 'active' || s === 'trialing';

/**
 * Read current period end. As of the Basil API (2025-03-31) this moved from the
 * Subscription object to each subscription ITEM. Read item-level first, fall
 * back to the legacy top-level field so it works on any pinned version.
 */
const getCurrentPeriodEnd = (sub: Stripe.Subscription): Date => {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  const legacyEnd = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const unix = itemEnd ?? legacyEnd;
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

/**
 * Return the user's Stripe customer id, creating one (and persisting it on the
 * user) if needed. We stamp metadata.userId so webhooks can always resolve back.
 */
const getOrCreateCustomer = async (user: IUser & { _id: unknown }): Promise<string> => {
  const existing =
    user.stripe_customer_id || user.subscription?.stripeCustomerId;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: String(user._id) },
  });

  await User.findByIdAndUpdate(user._id, {
    $set: { stripe_customer_id: customer.id },
  });

  return customer.id;
};

/* -------------------------------------------------------------------------- */
/* Checkout                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Create a Checkout Session in `subscription` mode for the single $99/mo plan.
 * Payment methods are NOT hardcoded, so Cards + Apple Pay + Google Pay all show
 * based on what you enable in Dashboard -> Settings -> Payment methods.
 */
const createCheckoutSession = async (
  userId: string,
  payload: { successUrl?: string; cancelUrl?: string } = {},
): Promise<{ url: string; sessionId: string }> => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');

  if (user.subscription?.isActive) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'You already have an active subscription',
    );
  }

  const customerId = await getOrCreateCustomer(user as IUser & { _id: unknown });

  const successUrl =
    payload.successUrl ||
    `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = payload.cancelUrl || `${APP_URL}/billing/cancel`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: String(user._id),
      subscription_data: { metadata: { userId: String(user._id) } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    // Idempotency: a double-click won't create two checkout sessions.
    { idempotencyKey: `checkout:${String(user._id)}:${STRIPE_PRICE_ID}` },
  );

  if (!session.url) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Stripe did not return a Checkout URL',
    );
  }
  return { url: session.url, sessionId: session.id };
};

/* -------------------------------------------------------------------------- */
/* Status + cancel                                                            */
/* -------------------------------------------------------------------------- */

const getStatus = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');

  const sub = user.subscription;
  return {
    status: sub?.status ?? 'inactive',
    isActive: sub?.isActive ?? false,
    currentPeriodEnd: sub?.currentPeriodEnd
      ? sub.currentPeriodEnd.toISOString()
      : null,
    stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
  };
};

/**
 * Cancel at period end by default (customer keeps the access they paid for);
 * the final customer.subscription.deleted webhook flips isActive=false when the
 * period actually ends. Pass immediately=true to cancel now.
 */
const cancel = async (userId: string, immediately = false) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');

  const subId = user.subscription?.stripeSubscriptionId;
  if (!subId) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'No subscription to cancel');
  }

  const subscription = immediately
    ? await stripe.subscriptions.cancel(subId)
    : await stripe.subscriptions.update(subId, { cancel_at_period_end: true });

  // Reflect the change immediately; the webhook is still the authoritative confirm.
  await syncSubscriptionToDb(subscription);

  return {
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    status: subscription.status,
  };
};

/* -------------------------------------------------------------------------- */
/* Source of truth: sync                                                      */
/* -------------------------------------------------------------------------- */

/** Resolve the owning user from a subscription via metadata or stored ids. */
const resolveUserFromSubscription = async (subscription: Stripe.Subscription) => {
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
 * Write the canonical Stripe subscription into our DB. Every subscription
 * webhook + the cancel endpoint funnels through here. Returns the updated user,
 * or null if no matching user was found.
 */
const syncSubscriptionToDb = async (subscription: Stripe.Subscription) => {
  const user = await resolveUserFromSubscription(subscription);
  if (!user) {
    // eslint-disable-next-line no-console
    console.warn(
      `[stripe] syncSubscriptionToDb: no user for sub ${subscription.id}`,
    );
    return null;
  }

  const record: ISubscription = {
    stripeCustomerId: customerIdOf(subscription.customer),
    stripeSubscriptionId: subscription.id,
    status: mapStripeStatus(subscription.status),
    currentPeriodEnd: getCurrentPeriodEnd(subscription),
    isActive: computeIsActive(subscription.status),
  };

  return User.findByIdAndUpdate(
    user._id,
    { $set: { subscription: record } },
    { new: true },
  );
};

/** Patch only specific subscription fields (used by webhook edge cases). */
const patchSubscription = async (
  userId: string,
  patch: Partial<ISubscription>,
) => {
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) set[`subscription.${k}`] = v;
  return User.findByIdAndUpdate(userId, { $set: set }, { new: true });
};

const retrieveSubscription = (id: string) => stripe.subscriptions.retrieve(id);

export const SubscriptionService = {
  // commands
  createCheckoutSession,
  getStatus,
  cancel,
  // webhook-facing
  syncSubscriptionToDb,
  patchSubscription,
  retrieveSubscription,
  // helpers (exported for the webhook handler + tests)
  getSubscriptionIdFromInvoice,
};