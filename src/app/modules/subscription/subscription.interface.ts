import { Schema } from 'mongoose';

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

export const subscriptionSchema = new Schema<ISubscription>(
  {
    stripeCustomerId: { type: String, required: true },
    stripeSubscriptionId: { type: String, required: true },
    stripePriceId: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'inactive', 'past_due', 'canceled'],
      default: 'inactive',
    },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date },
    canceledAt: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },
    lastSyncedAt: { type: Date, default: Date.now },
    failedAttempts: { type: Number, default: 0 },
    lastErrorMessage: { type: String },
  },
  { _id: false },
);
