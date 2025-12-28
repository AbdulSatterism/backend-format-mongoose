/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
import { ResetToken as PrismaResetToken } from '@prisma/client';

export type IResetToken = PrismaResetToken;

export type IResetTokenCreate = {
  userId: string;
  token: string;
  expireAt: Date;
};
