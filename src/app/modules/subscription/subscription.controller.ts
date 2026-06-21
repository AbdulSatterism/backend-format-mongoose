import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import { SubscriptionService } from './subscription.services';
import sendResponse from '../../../shared/sendResponse';

const createCheckoutSession = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const result = await SubscriptionService.createCheckoutSession(userId);

  sendResponse(res, {
    success: true,
    status_code: StatusCodes.CREATED,
    message: 'Checkout session created successfully',
    data: result,
  });
});

const getStatus = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const result = await SubscriptionService.getStatus(userId);

  sendResponse(res, {
    success: true,
    status_code: StatusCodes.OK,
    message: 'Subscription status retrieved successfully',
    data: result,
  });
});

const cancelSubscription = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const immediately = Boolean(req.body?.immediately);
  const result = await SubscriptionService.cancel(userId, immediately);

  sendResponse(res, {
    success: true,
    status_code: StatusCodes.OK,
    message: immediately
      ? 'Subscription canceled immediately'
      : 'Subscription will cancel at the end of the current period',
    data: result,
  });
});

export const SubscriptionController = {
  createCheckoutSession,
  getStatus,
  cancelSubscription,
};
