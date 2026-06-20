import { z } from 'zod';

/**
 * validateRequest() in this boilerplate validates the wrapped request object,
 * so schemas are shaped as { body: ... }. Adjust if your validateRequest differs.
 */
const createCheckoutSessionSchema = z.object({
  body: z.object({
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  }),
});

const cancelSubscriptionSchema = z.object({
  body: z.object({
    immediately: z.boolean().optional(),
  }),
});

export const SubscriptionValidation = {
  createCheckoutSessionSchema,
  cancelSubscriptionSchema,
};