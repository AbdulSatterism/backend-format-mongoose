/* eslint-disable @typescript-eslint/no-explicit-any */
import bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';

// Helper functions that were in the Mongoose model
export const UserHelpers = {
  isExistUserById: async (id: string) => {
    return await prisma.user.findUnique({
      where: { id },
    });
  },

  isExistUserByEmail: async (email: string) => {
    return await prisma.user.findUnique({
      where: { email },
    });
  },

  isMatchPassword: async (
    password: string,
    hashPassword: string,
  ): Promise<boolean> => {
    return await bcrypt.compare(password, hashPassword);
  },
};
