/**
 * Normalized subscription status (OURS, not Stripe's raw enum).
 * Stripe has more states (incomplete, trialing, unpaid, paused...) which we map.
 */
export type SubscriptionStatus =
  | 'active'
  | 'inactive'
  | 'past_due'
  | 'canceled';

/**
 * Embedded subscription record stored on the User document.
 * (Add this to your IUser — see patches/user.interface.ts)
 */
export type ISubscription = {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  isActive: boolean;
};

export type ICreateCheckoutSessionPayload = {
  successUrl?: string;
  cancelUrl?: string;
};

export type ICancelSubscriptionPayload = {
  immediately?: boolean;
};