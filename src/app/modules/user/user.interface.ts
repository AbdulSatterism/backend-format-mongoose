/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
import { User as PrismaUser } from '@prisma/client';

export type IUser = PrismaUser;

export type IUserCreate = {
  name: string;
  email: string;
  phone: string;
  password: string;
  googleId?: string;
  facebookId?: string;
  appleId?: string;
  role?: 'ADMIN' | 'USER';
  gender?: 'MALE' | 'FEMALE' | 'OTHERS';
  image?: string;
  age?: number;
  payment?: boolean;
  subscription?: boolean;
  isDeleted?: boolean;
  verified?: boolean;
  authIsResetPassword?: boolean;
  authOneTimeCode?: number;
  authExpireAt?: Date;
};

export type IUserUpdate = Partial<IUserCreate>;
