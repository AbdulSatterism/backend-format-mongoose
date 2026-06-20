import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../errors/ApiError';
// adjust path to your User model
import { User } from '../user/user.model';

/**
 * Gate any route behind an ACTIVE subscription.
 *
 * Must run AFTER auth() (which sets req.user.id). We trust only the DB isActive
 * flag, which is written exclusively from verified Stripe webhooks — never from
 * anything the client sends.
 *
 * Usage:
 *   router.get(
 *     '/premium',
 *     auth(USER_ROLES.USER, USER_ROLES.ADMIN),
 *     requireActiveSubscription,
 *     SomeController.handler,
 *   );
 */
const requireActiveSubscription = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const decoded = req.user as unknown as { id: string };
    if (!decoded?.id) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
    }

    const user = await User.findById(decoded.id).select('subscription');
    if (user?.subscription?.isActive !== true) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'Active subscription required',
      );
    }

    next();
  } catch (err) {
    next(err);
  }
};

export default requireActiveSubscription;