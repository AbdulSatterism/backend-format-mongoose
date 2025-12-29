/* eslint-disable no-unused-vars */

import { NextFunction, Request, Response } from 'express';
import statusCodes from 'http-status-codes';

const notFoundRoute = (
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
) => {
  return res.status(statusCodes.NOT_FOUND).json({
    success: false,
    message: 'API not found',
    error: '',
  });
};

export default notFoundRoute;
