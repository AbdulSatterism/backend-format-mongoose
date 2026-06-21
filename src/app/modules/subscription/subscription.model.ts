import { model, Schema } from 'mongoose';

export interface ISubscriptionModel {
  userId: string; // Reference to User ID
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: 'active' | 'inactive' | 'past_due' | 'canceled';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt?: Date;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
  lastSyncedAt: Date;
  failedAttempts: number;
  lastErrorMessage?: string;
  created_at: Date;
  updated_at: Date;
}

const SubscriptionSchema = new Schema<ISubscriptionModel>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    stripeCustomerId: {
      type: String,
      required: true,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripePriceId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'past_due', 'canceled'],
      default: 'inactive',
      index: true,
    },
    currentPeriodStart: {
      type: Date,
      default: Date.now,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    canceledAt: {
      type: Date,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    failedAttempts: {
      type: Number,
      default: 0,
    },
    lastErrorMessage: {
      type: String,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

// Index for finding expiring subscriptions
SubscriptionSchema.index({ currentPeriodEnd: 1, isActive: 1 });
SubscriptionSchema.index({ userId: 1, isActive: 1 });

export const Subscription = model<ISubscriptionModel>(
  'Subscription',
  SubscriptionSchema,
);
