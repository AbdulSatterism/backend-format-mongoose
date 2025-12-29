import mongoose from 'mongoose';
import { TErrorSource, TGenericErrorResponse } from '../interface';

const handleCastError = (
  err: mongoose.Error.CastError,
): TGenericErrorResponse => {
  const errorSources: TErrorSource = [
    {
      path: err?.path,
      message: err?.message,
    },
  ];

  const status_code = 400;

  return {
    status_code,
    message: 'invalid id',
    errorSources,
  };
};

export default handleCastError;
