/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
import { Model } from 'mongoose';
import { ISubscription } from '../subscription/subscription.interface';

export type IUser = {
  name?: string;
  email: string;
  password: string;
  google_id?: string;
  facebook_id?: string;
  apple_id?: string;
  role?: 'ADMIN' | 'USER';
  gender?: 'MALE' | 'FEMALE' | 'OTHERS';
  image?: string;
  is_deleted?: boolean;
  authentication?: {
    is_reset_password: boolean;
    one_time_code: number;
    expire_at: Date;
  };
  verified: boolean;
    stripe_customer_id?: string;

  subscription?: ISubscription;

};




export type UserModal = {
  isExistUserById(id: string): any;
  isExistUserByEmail(email: string): any;
  isAccountCreated(id: string): any;
  isMatchPassword(password: string, hashPassword: string): boolean;
} & Model<IUser>;
