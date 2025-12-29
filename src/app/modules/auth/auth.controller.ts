import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { AuthService } from './auth.service';
import config from '../../../config';
import AppError from '../../errors/AppError';
import statusCodes from 'http-status-codes';

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const { ...verifyData } = req.body;
  const result = await AuthService.verifyEmailToDB(verifyData);

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: result.message,
    data: result.data,
  });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const { ...loginData } = req.body;
  const result = await AuthService.loginUserFromDB(loginData);

  res.cookie('refresh_token', result.refresh_token, {
    secure: config.node_env === 'production',
    httpOnly: true,
  });

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'User login successfully',
    data: result,
  });
});

const forgetPassword = catchAsync(async (req: Request, res: Response) => {
  const email = req.body.email;
  const result = await AuthService.forgetPasswordToDB(email);

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'Please check your email, we send a OTP!',
    data: result,
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    throw new AppError(
      statusCodes.UNAUTHORIZED,
      'Authorization header is missing or invalid',
    );
  }

  const token = authorizationHeader.split(' ')[1];
  const { ...resetData } = req.body;

  const result = await AuthService.resetPasswordToDB(token, resetData);

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'Password reset successfully',
    data: result,
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;

  const { ...passwordData } = req.body;
  await AuthService.changePasswordToDB(user, passwordData);

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'Password changed successfully',
  });
});

const deleteAccount = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const result = await AuthService.deleteAccountToDB(user);

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'Account Deleted successfully',
    data: result,
  });
});

const newaccess_token = catchAsync(async (req: Request, res: Response) => {
  const { token } = req.body;
  const result = await AuthService.newaccess_tokenToUser(token);

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'Generate Access Token successfully',
    data: result,
  });
});

const resendVerificationEmail = catchAsync(
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const result = await AuthService.resendVerificationEmailToDB(email);

    sendResponse(res, {
      success: true,
      status_code: statusCodes.OK,
      message: 'Generate OTP and send successfully',
      data: result,
    });
  },
);

const googleLogin = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.googleLogin(req.body);

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'User login successfully',
    data: result,
  });
});

const facebookLogin = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.facebookLogin(req.body);

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'User login successfully',
    data: result,
  });
});

const appleLogin = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.appleLogin(req.body);

  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'User login successfully via Apple',
    data: result,
  });
});

const accessToken = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies.refresh_token;

  const result = await AuthService.accessToken(token);
  sendResponse(res, {
    success: true,
    status_code: statusCodes.OK,
    message: 'new token provided',
    data: result,
  });
});

export const AuthController = {
  verifyEmail,
  loginUser,
  forgetPassword,
  resetPassword,
  changePassword,
  deleteAccount,
  newaccess_token,
  resendVerificationEmail,
  googleLogin,
  facebookLogin,
  appleLogin,
  accessToken,
};
