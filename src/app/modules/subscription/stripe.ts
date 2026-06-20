import Stripe from 'stripe';


//TODO: this file should improve with config service and env variables, for now it is hardcoded

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    // Fail fast at startup rather than mid-request.
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
  typescript: true,
  maxNetworkRetries: 2,
  appInfo: { name: 'subscription-service', version: '1.0.0' },
});

export const STRIPE_PRICE_ID = requireEnv('STRIPE_PRICE_ID');
export const STRIPE_WEBHOOK_SECRET = requireEnv('STRIPE_WEBHOOK_SECRET');

// Where Checkout redirects after success/cancel. Falls back if APP_URL unset.
export const APP_URL = process.env.APP_URL || 'http://localhost:5000';