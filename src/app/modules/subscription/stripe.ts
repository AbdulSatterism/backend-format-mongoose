import Stripe from 'stripe';

/**
 * Stripe initialization.
 *
 * If you have a central `config` object (src/config/index.ts), move these reads
 * there and import from it instead. Kept self-contained here so it drops in.
 *
 * We intentionally do NOT pass an explicit `apiVersion`: each stripe-node release
 * is pinned to the API version its TypeScript types were generated against, so
 * letting the SDK use its own version guarantees types match runtime and the
 * code compiles. Set your webhook endpoint (Dashboard/Workbench) to that same
 * version so payload shapes line up.
 */
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
export const APP_URL = process.env.APP_URL || 'http://localhost:3000';