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
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

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

//check user
userSchema.pre('save', async function (next) {
  //check user
  const isExist = await User.findOne({ email: this.email });
  if (isExist) {
    throw new AppError(statusCodes.BAD_REQUEST, 'Email already used');
  }

  //password hash
  this.password = await bcrypt.hash(
    this.password,
    Number(config.bcrypt_salt_rounds),
  );
  next();
});

export const User = model<IUser, UserModal>('User', userSchema);
