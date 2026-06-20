import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { User } from '../user/user.model';
import AppError from '../../errors/AppError';

const requireActiveSubscription = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const decoded = req.user as unknown as { id: string };
    if (!decoded?.id) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
    }

    const user = await User.findById(decoded.id).select('subscription');
    if (user?.subscription?.isActive !== true) {
      throw new AppError(StatusCodes.FORBIDDEN, 'Active subscription required');
    }

    next();
  } catch (err) {
    next(err);
  }
};

export default requireActiveSubscription;
