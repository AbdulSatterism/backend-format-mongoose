import chalk from 'chalk';
import { User } from '../app/modules/user/user.model';
import config from '../config';
import { USER_ROLES } from '../enums/user';
import { logger } from '../shared/logger';

const superUser = {
  name: 'starter backend',
  role: USER_ROLES.ADMIN,
  email: config.admin.email,
  password: config.admin.password,
  phone: '14524578',
  verified: true,
  gender: 'MALE',
};

const seedAdmin = async () => {
  try {
    const isExistSuperAdmin = await User.findOne({ role: USER_ROLES.ADMIN });

    if (!isExistSuperAdmin) {
      await User.create(superUser);
      logger.info(chalk.green('✔ admin created successfully!'));
    } else {
      logger.info(chalk.green('⚠ admin already exists!'));
    }
  } catch (error) {
    logger.error(chalk.red('Error creating admin:'), error);
  }
};

export default seedAdmin;
