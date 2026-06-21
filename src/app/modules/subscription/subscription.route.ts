import express from 'express';
import { USER_ROLES } from '../../../enums/user';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionValidation } from './subscription.validation';
import { requireActiveSubscription, manualSyncSubscriptions } from './reactive';
import catchAsync from '../../../shared/catchAsync';

const router = express.Router();

// Create checkout session (no subscription required)
router.post(
  '/create-checkout-session',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  SubscriptionController.createCheckoutSession,
);

// Get subscription status (no subscription required, user just wants to check)
router.get(
  '/status',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  SubscriptionController.getStatus,
);

// Cancel subscription (must have active subscription to cancel)
router.post(
  '/cancel',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  requireActiveSubscription,
  validateRequest(SubscriptionValidation.cancelSubscriptionSchema),
  SubscriptionController.cancelSubscription,
);

// Manual sync endpoint (admin only - for testing/debugging)
router.post(
  '/sync',
  auth(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const result = await manualSyncSubscriptions();
    res.status(200).json(result);
  }),
);

export const SubscriptionRoutes = router;
