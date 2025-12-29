import mongoose from 'mongoose';
import { TErrorSource, TGenericErrorResponse } from '../interface';

const handleValidationError = (
  err: mongoose.Error.ValidationError,
): TGenericErrorResponse => {
  const errorSources: TErrorSource = Object.values(err.errors).map(
    (val: mongoose.Error.ValidatorError | mongoose.Error.CastError) => {
      return {
        path: val?.path,
        message: val?.message,
      };
    },
  );

  const status_code = 400;

  return {
    status_code,
    message: 'validation error',
    errorSources,
  };
};

export default handleValidationError;
