/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import statusCodes from 'http-status-codes';
import { Secret } from 'jsonwebtoken';
import config from '../../config';
import { jwtHelper } from '../../helpers/jwtHelper';
import AppError from '../errors/AppError';

const auth = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extracting token from authorization header
      const tokenWithBearer = req.headers.authorization;
      if (!tokenWithBearer || !tokenWithBearer.startsWith('Bearer ')) {
        throw new AppError(statusCodes.UNAUTHORIZED, 'You are not authorized');
      }

      // Get the token
      const token = tokenWithBearer.split(' ')[1];

      // Verify the token using the jwtHelper
      let decodedUser;
      try {
        decodedUser = jwtHelper.verifyToken(
          token,
          config.jwt.jwt_secret as Secret,
        );
      } catch (error) {
        if ((error as any).name === 'TokenExpiredError') {
          throw new AppError(statusCodes.UNAUTHORIZED, 'Token has expired');
        }
        throw error;
      }

      req.user = decodedUser;

      if (roles.length && !roles.includes(decodedUser.role)) {
        throw new AppError(
          statusCodes.FORBIDDEN,
          "You don't have permission to access this API",
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default auth;
