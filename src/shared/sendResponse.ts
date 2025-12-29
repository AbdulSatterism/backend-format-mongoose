import { Response } from 'express';

type IData<T> = {
  success: boolean;
  status_code: number;
  message?: string;
  payment_intent?: string | undefined;
  meta?: {
    page: number;
    limit: number;
    total_data_page: number;
    total_data: number;
  };
  data?: T;
};

const sendResponse = <T>(res: Response, data: IData<T>) => {
  const resData = {
    success: data.success,
    message: data.message,
    meta: data.meta,
    payment_intent: data.payment_intent,
    data: data.data,
  };
  res.status(data.status_code).json(resData);
};

export default sendResponse;
