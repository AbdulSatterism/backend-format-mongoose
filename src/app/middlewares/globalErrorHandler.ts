/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-expressions */
import { ErrorRequestHandler } from 'express';
import config from '../../config';
import { ZodError } from 'zod';
import { TErrorSource } from '../interface';
import handleZodError from '../errors/handleZodError';
import handleValidationError from '../errors/handleValidationError';
import handleCastError from '../errors/handleCastError';
import handleDuplicateError from '../errors/handleDuplicateError';
import AppError from '../errors/AppError';
import { errorLogger } from '../../shared/logger';
import chalk from 'chalk';

const globalErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next,
) => {
  config.node_env === 'development'
    ? errorLogger.error(chalk.red('🚨 globalErrorHandler ~~ ', err))
    : errorLogger.error(chalk.red('🚨 globalErrorHandler ~~ ', err));

  let status_code = 500;
  let message = 'something went wrong';

  let errorSources: TErrorSource = [
    {
      path: '',
      message: 'something went wrong!!',
    },
  ];

  if (err instanceof ZodError) {
    const simplifiedError = handleZodError(err);
    status_code = simplifiedError?.status_code;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err.name === 'ValidationError') {
    const simplifiedError = handleValidationError(err);
    status_code = simplifiedError?.status_code;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err.name === 'CastError') {
    const simplifiedError = handleCastError(err);
    status_code = simplifiedError?.status_code;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err.code === 11000) {
    const simplifiedError = handleDuplicateError(err);
    status_code = simplifiedError?.status_code;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err instanceof AppError) {
    status_code = err?.status_code;
    message = err?.message;
    errorSources = [
      {
        path: '',
        message: err?.message,
      },
    ];
  } else if (err instanceof Error) {
    message = err?.message;
    errorSources = [
      {
        path: '',
        message: err?.message,
      },
    ];
  }

  return res.status(status_code).json({
    success: false,
    message,
    errorSources,
    stack: config.node_env === 'development' ? err?.stack : null,
  });
};

export default globalErrorHandler;
