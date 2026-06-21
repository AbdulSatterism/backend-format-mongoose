import Stripe from 'stripe';
import config from '../../../config';
import { logger } from '../../../shared/logger';

// Initialize Stripe with config
export const stripe = new Stripe(config.stripe.secret_key as string, {
  typescript: true,
  maxNetworkRetries: 2,
  appInfo: { name: 'subscription-service', version: '1.0.0' },
});

// Determine APP_URL from environment, with fallback for development
export const APP_URL =
  process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

// Log the configured URL on startup
logger.info(`[Stripe] Configured with APP_URL: ${APP_URL}`);
