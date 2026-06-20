export type SubscriptionStatus =
  | 'active'
  | 'inactive'
  | 'past_due'
  | 'canceled';

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

export type ICancelSubscriptionPayload = { immediately?: boolean };
