import express from 'express';
import { USER_ROLES } from '../../../enums/user';
import auth from '../../middlewares/auth';
import { SubscriptionController } from './subscription.controller';
import { manualSyncSubscriptions } from './reactive';
import catchAsync from '../../../shared/catchAsync';

const router = express.Router();

router.post(
  '/create-checkout-session',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  SubscriptionController.createCheckoutSession,
);

router.get(
  '/status',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  SubscriptionController.getStatus,
);

// FIX: do NOT gate cancel behind requireActiveSubscription — a past_due user
// (isActive=false) must still be able to cancel. The service throws if there is
// genuinely no subscription. (validateRequest removed too: cancel body is just
// an optional { immediately }, validated in the service.)
router.post(
  '/cancel',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  SubscriptionController.cancelSubscription,
);

// Admin-only manual reconciliation.
router.post(
  '/sync',
  auth(USER_ROLES.ADMIN),
  catchAsync(async (_req, res) => {
    const result = await manualSyncSubscriptions();
    res.status(200).json(result);
  }),
);

export const SubscriptionRoutes = router;
