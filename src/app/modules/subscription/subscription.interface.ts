export type SubscriptionStatus =
  | 'active'
  | 'inactive'
  | 'past_due'
  | 'canceled';

export type ISubscription = {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt?: Date;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
  lastSyncedAt: Date;
  failedAttempts: number;
  lastErrorMessage?: string;
};

export type ICreateCheckoutSessionPayload = {
  successUrl?: string;
  cancelUrl?: string;
};

export type ICancelSubscriptionPayload = { immediately?: boolean };
