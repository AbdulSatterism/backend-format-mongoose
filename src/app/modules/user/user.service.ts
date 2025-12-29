/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
import statusCodes from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import { USER_ROLES } from '../../../enums/user';
import { emailHelper } from '../../../helpers/emailHelper';
import { emailTemplate } from '../../../shared/emailTemplate';
import generateOTP from '../../../util/generateOTP';

import { IUser } from './user.interface';
import { User } from './user.model';
import unlinkFile from '../../../shared/unlinkFile';
import AppError from '../../errors/AppError';

const createUserFromDb = async (payload: IUser) => {
  payload.role = USER_ROLES.USER;
  const result = await User.create(payload);

  if (!result) {
    throw new AppError(statusCodes.BAD_REQUEST, 'Failed to create user');
  }

  const otp = generateOTP();
  const emailValues = {
    name: result.name || 'User',
    otp,
    email: result.email,
  };

  const accountEmailTemplate = emailTemplate.createAccount(emailValues);
  emailHelper.sendEmail(accountEmailTemplate);

  // Update user with authentication details
  const authentication = {
    one_time_code: otp,
    expire_at: new Date(Date.now() + 20 * 60000),
  };
  const updatedUser = await User.findOneAndUpdate(
    { _id: result._id },
    { $set: { authentication } },
  );
  if (!updatedUser) {
    throw new AppError(statusCodes.NOT_FOUND, 'User not found for update');
  }

  return result;
};

const getAllUsers = async (query: Record<string, unknown>) => {
  const { page, limit } = query;
  const pages = parseInt(page as string) || 1;
  const size = parseInt(limit as string) || 10;
  const skip = (pages - 1) * size;

  const [result, total_data] = await Promise.all([
    User.find().sort({ created_at: -1 }).skip(skip).limit(size).lean(),
    User.countDocuments(),
  ]);

  const total_data_page = Math.ceil(total_data / size);

  return {
    data: result,
    meta: {
      page: pages,
      limit: size,
      total_data_page,
      total_data,
    },
  };
};

const getUserProfileFromDB = async (
  user: JwtPayload,
): Promise<Partial<IUser>> => {
  const { id } = user;
  const isExistUser = await User.findById(id);
  if (!isExistUser) {
    throw new AppError(statusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  return isExistUser;
};

const updateProfileToDB = async (
  user: JwtPayload,
  payload: Partial<IUser>,
): Promise<Partial<IUser | null>> => {
  const { id } = user;
  const isExistUser = await User.isExistUserById(id);

  if (!isExistUser) {
    throw new AppError(statusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  if (!isExistUser) {
    throw new AppError(statusCodes.NOT_FOUND, 'Blog not found');
  }

  if (isExistUser.is_deleted) {
    throw new AppError(
      statusCodes.BAD_REQUEST,
      'Your account has been deleted',
    );
  }

  if (!isExistUser.verified) {
    throw new AppError(
      statusCodes.BAD_REQUEST,
      'Please verify your account first',
    );
  }

  if (payload.image && isExistUser.image) {
    unlinkFile(isExistUser.image);
  }

  const updateDoc = await User.findOneAndUpdate({ _id: id }, payload, {
    new: true,
  });

  return updateDoc;
};

const getSingleUser = async (id: string): Promise<IUser | null> => {
  const result = await User.findById(id);
  return result;
};

// search user by phone
const searchUserByPhone = async (searchTerm: string, userId: string) => {
  let result;

  if (searchTerm) {
    result = await User.find({
      phone: { $regex: searchTerm, $options: 'i' },
      _id: { $ne: userId },
    });
  } else {
    result = await User.find({ _id: { $ne: userId } }).limit(10);
  }

  return result;
};

export const UserService = {
  createUserFromDb,
  getUserProfileFromDB,
  updateProfileToDB,
  getSingleUser,
  searchUserByPhone,
  getAllUsers,
};
