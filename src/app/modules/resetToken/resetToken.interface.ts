/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
import { Model, Types } from 'mongoose';

export type IResetToken = {
  user: Types.ObjectId;
  token: string;
  expire_at: Date;
};

export type ResetTokenModel = {
  isExistToken(token: string): any;
  isExpireToken(token: string): boolean;
} & Model<IResetToken>;
