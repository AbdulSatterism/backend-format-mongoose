import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

// NOTE: adjust these import paths to your project's shared utilities.
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { SubscriptionService } from './subscription.service';

/**
 * `auth()` middleware in this boilerplate attaches the decoded JWT to req.user,
 * which contains `id`. We read it here and pass primitives into the service.
 */
const getUserId = (req: Request): string => {
  const user = req.user as unknown as { id: string };
  return user.id;
};

const createCheckoutSession = catchAsync(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const result = await SubscriptionService.createCheckoutSession(userId, {
    successUrl: req.body?.successUrl,
    cancelUrl: req.body?.cancelUrl,
  });

  sendResponse(res, {
    success: true,
    status_code: StatusCodes.CREATED,
    message: 'Checkout session created successfully',
    data: result,
  });
});

const getStatus = catchAsync(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const result = await SubscriptionService.getStatus(userId);

  sendResponse(res, {
    success: true,
    status_code: StatusCodes.OK,
    message: 'Subscription status retrieved successfully',
    data: result,
  });
});

const cancelSubscription = catchAsync(async (req: Request, res: Response) => {
  const userId = getUserId(req);
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