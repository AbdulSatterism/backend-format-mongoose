/* eslint-disable @typescript-eslint/no-explicit-any */
import bcrypt from 'bcrypt';
import { model, Schema } from 'mongoose';
import config from '../../../config';
import { IUser, UserModal } from './user.interface';
import AppError from '../../errors/AppError';
import statusCodes from 'http-status-codes';

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
    google_id: {
      type: String,
    },
    facebook_id: {
      type: String,
    },
    apple_id: {
      type: String,
    },

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
        is_reset_password: {
          type: Boolean,
          default: false,
        },
        one_time_code: {
          type: Number,
          default: null,
        },
        expire_at: {
          type: Date,
          default: null,
        },
      },
      select: 0,
    },

    stripe_customer_id: {
      type: String,
      index: true,
    },

    subscription: {
      type: {
        stripeCustomerId: {
          type: String,
          required: true,
        },
        stripeSubscriptionId: {
          type: String,
          required: true,
        },
        stripePriceId: {
          type: String,
          required: true,
        },
        status: {
          type: String,
          enum: ['active', 'inactive', 'past_due', 'canceled'],
          default: 'inactive',
        },
        currentPeriodStart: {
          type: Date,
          default: Date.now,
        },
        currentPeriodEnd: {
          type: Date,
          required: true,
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
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

// Add index for subscription lookups
userSchema.index({ 'subscription.isActive': 1 });
userSchema.index({ 'subscription.stripeSubscriptionId': 1 });

//exist user check
userSchema.statics.isExistUserById = async (id: string) => {
  const isExist = await User.findById(id);
  return isExist;
};

userSchema.statics.isExistUserByEmail = async (email: string) => {
  const isExist = await User.findOne({ email });
  return isExist;
};

//account check
userSchema.statics.isAccountCreated = async (id: string) => {
  const isUserExist: any = await User.findById(id);
  return isUserExist.accountInformation.status;
};

//is match password
userSchema.statics.isMatchPassword = async (
  password: string,
  hashPassword: string,
): Promise<boolean> => {
  return await bcrypt.compare(password, hashPassword);
};

//check user on creation and email changes
userSchema.pre('save', async function (next) {
  // Check email uniqueness (exclude current user if updating)
  if (this.isModified('email')) {
    const isExist = await User.findOne({ email: this.email });
    if (isExist && String(isExist._id) !== String(this._id)) {
      throw new AppError(statusCodes.BAD_REQUEST, 'Email already used');
    }
  }

  // Only hash password if it's being modified
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(
      this.password,
      Number(config.bcrypt_salt_rounds),
    );
  }

  next();
});

export const User = model<IUser, UserModal>('User', userSchema);
