import { z } from 'zod';

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(4, 'Password must have at least 4 characters')
      .max(32, 'Password must have at most 32 characters'),
  }),
});

const updateUserProfileSchema = z.object({
  body: z.object({
    name: z.string().optional(),
  }),
});

export const UserValidation = {
  createUserSchema,
  updateUserProfileSchema,
};
