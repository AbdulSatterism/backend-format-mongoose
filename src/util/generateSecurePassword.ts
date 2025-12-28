import crypto from 'crypto';

/**
 * Generates a cryptographically secure random password for social login users
 * This password is never exposed and only used internally
 */
const generateSecurePassword = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export default generateSecurePassword;
