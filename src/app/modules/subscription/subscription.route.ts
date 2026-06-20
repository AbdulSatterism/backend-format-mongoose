import express from 'express';
import { USER_ROLES } from '../../../enums/user';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionValidation } from './subscription.validation';

const router = express.Router();

/**
 * NOTE: the Stripe webhook (POST /subscriptions/webhook) is intentionally NOT
 * defined here. It needs the RAW request body, so it is mounted directly in
 * app.ts BEFORE express.json(). See patches/app.ts.
 */

router.post(
  '/create-checkout-session',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  validateRequest(SubscriptionValidation.createCheckoutSessionSchema),
  SubscriptionController.createCheckoutSession,
);

router.get(
  '/status',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  SubscriptionController.getStatus,
);

router.post(
  '/cancel',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  validateRequest(SubscriptionValidation.cancelSubscriptionSchema),
  SubscriptionController.cancelSubscription,
);

export const SubscriptionRoutes = router;