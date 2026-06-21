/* eslint-disable @typescript-eslint/no-explicit-any */
import bcrypt from 'bcrypt';
import { model, Schema } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import config from '../../../config';
import { IUser, UserModal } from './user.interface';

import AppError from '../../errors/AppError';
import { subscriptionSchema } from '../subscription/subscription.interface';

const userSchema = new Schema<IUser, UserModal>(
  {
    name: {
      type: String,
      required: false,
      default: '',
    },
    email: {
      type: String,
      required: false,
      lowercase: true,
    },
    password: {
      type: String,
      required: false,
      select: 0,
    },
    google_id: { type: String },
    facebook_id: { type: String },
    apple_id: { type: String },

    role: {
      type: String,
      default: 'USER',
    },
    image: {
      type: String,
      default: '',
    },
    gender: {
      type: String,
      required: false,
      enum: ['MALE', 'FEMALE', 'OTHERS'],
    },

    is_deleted: {
      type: Boolean,
      default: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },

    authentication: {
      type: {
        is_reset_password: { type: Boolean, default: false },
        one_time_code: { type: Number, default: null },
        expire_at: { type: Date, default: null },
      },
      select: 0,
    },

    // Persisted as soon as we create a Stripe customer (before any subscription).
    stripe_customer_id: {
      type: String,
      index: true,
    },

    // Single source of truth for the embedded subscription shape.
    subscription: {
      type: subscriptionSchema,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

/* ----------------------------- indexes ----------------------------------- */
// NOTE: stripe_customer_id is already indexed inline above, and Mongoose would
// warn on a duplicate — so we only add the two that aren't declared elsewhere.
userSchema.index({ 'subscription.isActive': 1 });
userSchema.index({ 'subscription.stripeSubscriptionId': 1 });
userSchema.index({ 'subscription.stripeCustomerId': 1 });
// Used by the reconciliation monitor.
userSchema.index({
  'subscription.currentPeriodEnd': 1,
  'subscription.isActive': 1,
});

/* ----------------------------- statics ----------------------------------- */
userSchema.statics.isExistUserById = async (id: string) => {
  return User.findById(id);
};

userSchema.statics.isExistUserByEmail = async (email: string) => {
  return User.findOne({ email });
};

userSchema.statics.isAccountCreated = async (id: string) => {
  const user: any = await User.findById(id);
  // Guarded with optional chaining so a missing field can't crash the call.
  // (`accountInformation` is not a field on this schema — confirm what this
  // should actually return for your app.)
  return user?.accountInformation?.status;
};

userSchema.statics.isMatchPassword = async (
  password: string,
  hashPassword: string,
): Promise<boolean> => {
  return bcrypt.compare(password, hashPassword);
};

userSchema.pre('save', async function () {
  if (this.isModified('email')) {
    const isExist = await User.findOne({ email: this.email });
    if (isExist && String(isExist._id) !== String(this._id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Email already used');
    }
  }

  if (this.isModified('password')) {
    this.password = await bcrypt.hash(
      this.password,
      Number(config.bcrypt_salt_rounds),
    );
  }
});

export const User = model<IUser, UserModal>('User', userSchema);
