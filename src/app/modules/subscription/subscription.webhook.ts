import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe } from './stripe';
import config from '../../../config';
import { SubscriptionService } from './subscription.services';
import { logger } from '../../../shared/logger';

// Simple in-memory deduplication cache (use Redis in production)
const processedEvents = new Set<string>();

/**
 * POST /api/v1/subscriptions/webhook
 *
 * Source of truth for subscription state. This handler:
 *   1. Verifies the Stripe signature against the RAW body. Invalid -> 400.
 *   2. Returns 200 fast (even for ignored events) so Stripe stops retrying.
 *   3. Returns 500 on a processing error so Stripe DOES retry (transient DB issue).
 *   4. Includes idempotency check to prevent duplicate processing.
 *
 * IMPORTANT: this route must be mounted with express.raw({ type: 'application/json' })
 * BEFORE the global express.json() in app.ts, otherwise req.body is already parsed
 * and signature verification fails. See app.ts.
 *
 * This is a plain handler (not catchAsync) on purpose — it owns its status codes.
 *
 * AUTO-RENEWAL FLOW:
 * 1. User creates subscription via checkout
 * 2. Stripe automatically charges monthly on renewal date
 * 3. Webhook triggers on payment (customer.subscription.updated)
 * 4. We sync subscription to DB, updating currentPeriodEnd
 * 5. Subscription remains active until canceled or payment fails
 */
const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    logger.warn('[Subscription] Webhook: Missing stripe-signature header');
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event: Stripe.Event;
  try {
    // req.body is a Buffer because of express.raw().
    // constructEvent expects WebhookPayload (string | Uint8Array | Buffer-like).
    // Convert the raw Buffer to Uint8Array to satisfy the types in all TS lib variants.
    event = stripe.webhooks.constructEvent(
      new Uint8Array(req.body as Buffer),
      signature as string,
      config.stripe.webhook_secret as string,
    );
  } catch (err) {
    logger.warn('[Subscription] Webhook signature verification failed:', err);
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  // Idempotency check: prevent processing same event twice
  if (processedEvents.has(event.id)) {
    logger.info(
      `[Subscription] Webhook: Duplicate event ${event.id}, skipping`,
    );
    res.status(200).json({ received: true });
    return;
  }

  processedEvents.add(event.id);
  // Clean up old events from cache after 24 hours (in production, use Redis with TTL)
  setTimeout(() => processedEvents.delete(event.id), 24 * 60 * 60 * 1000);

  try {
    logger.info(
      `[Subscription] Webhook: Processing event ${event.type} (${event.id})`,
    );
    await processEvent(event);
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error(
      `[Subscription] Webhook handler error (${event.type}, ${event.id}):`,
      err,
    );
    // Return 500 so Stripe retries on transient errors
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

async function processEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription' && session.subscription) {
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;
        try {
          const sub = await SubscriptionService.retrieveSubscription(subId);
          await SubscriptionService.syncSubscriptionToDb(sub);
          logger.info(
            `[Subscription] Webhook: Checkout completed for subscription ${subId}`,
          );
        } catch (error) {
          logger.error(
            `[Subscription] Webhook: Failed to sync subscription ${subId}`,
            error,
          );
          throw error;
        }
      }
      break;
    }

    case 'customer.subscription.created': {
      try {
        await SubscriptionService.syncSubscriptionToDb(
          event.data.object as Stripe.Response<Stripe.Subscription>,
        );
        logger.info(
          `[Subscription] Webhook: Subscription created ${event.data.object.id}`,
        );
      } catch (error) {
        logger.error(
          '[Subscription] Webhook: Failed to process subscription.created',
          error,
        );
        throw error;
      }
      break;
    }

    case 'customer.subscription.updated': {
      try {
        const sub = event.data.object as Stripe.Response<Stripe.Subscription>;
        await SubscriptionService.syncSubscriptionToDb(sub);
        logger.info(
          `[Subscription] Webhook: Subscription updated ${sub.id}, status: ${sub.status}`,
        );
      } catch (error) {
        logger.error(
          '[Subscription] Webhook: Failed to process subscription.updated',
          error,
        );
        throw error;
      }
      break;
    }

    case 'customer.subscription.deleted': {
      try {
        const sub = event.data.object as Stripe.Response<Stripe.Subscription>;
        const user = await SubscriptionService.syncSubscriptionToDb(sub);
        if (user) {
          await SubscriptionService.patchSubscription(String(user._id), {
            status: 'canceled',
            isActive: false,
            canceledAt: new Date(),
          });
          logger.info(
            `[Subscription] Webhook: Subscription deleted ${sub.id} for user ${user._id}`,
          );
        }
      } catch (error) {
        logger.error(
          '[Subscription] Webhook: Failed to process subscription.deleted',
          error,
        );
        throw error;
      }
      break;
    }

    case 'invoice.paid': {
      try {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = SubscriptionService.getSubscriptionIdFromInvoice(invoice);
        if (subId) {
          const sub = await SubscriptionService.retrieveSubscription(subId);
          await SubscriptionService.syncSubscriptionToDb(
            sub as Stripe.Response<Stripe.Subscription>,
          );
          logger.info(
            `[Subscription] Webhook: Invoice paid for subscription ${subId}`,
          );
        }
      } catch (error) {
        logger.error(
          '[Subscription] Webhook: Failed to process invoice.paid',
          error,
        );
        throw error;
      }
      break;
    }

    case 'invoice.payment_failed': {
      try {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = SubscriptionService.getSubscriptionIdFromInvoice(invoice);
        if (subId) {
          const sub = await SubscriptionService.retrieveSubscription(subId);
          const user = await SubscriptionService.syncSubscriptionToDb(
            sub as Stripe.Response<Stripe.Subscription>,
          );
          if (user) {
            await SubscriptionService.patchSubscription(String(user._id), {
              status: 'past_due',
              isActive: false,
              lastErrorMessage: 'Payment failed',
            });
            logger.warn(
              `[Subscription] Webhook: Payment failed for subscription ${subId}, user ${user._id}`,
            );
          }
        }
      } catch (error) {
        logger.error(
          '[Subscription] Webhook: Failed to process invoice.payment_failed',
          error,
        );
        throw error;
      }
      break;
    }

    case 'invoice.payment_action_required': {
      // Payment method expired or needs confirmation
      try {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = SubscriptionService.getSubscriptionIdFromInvoice(invoice);
        if (subId) {
          const sub = await SubscriptionService.retrieveSubscription(subId);
          const user = await SubscriptionService.syncSubscriptionToDb(
            sub as Stripe.Response<Stripe.Subscription>,
          );
          if (user) {
            await SubscriptionService.patchSubscription(String(user._id), {
              status: 'past_due',
              isActive: false,
              lastErrorMessage: 'Payment action required',
            });
            logger.info(
              `[Subscription] Webhook: Payment action required for subscription ${subId}`,
            );
          }
        }
      } catch (error) {
        logger.error(
          '[Subscription] Webhook: Failed to process invoice.payment_action_required',
          error,
        );
        throw error;
      }
      break;
    }

    default:
      logger.debug(`[Subscription] Webhook: Ignoring event type ${event.type}`);
      break;
  }
}

export const StripeWebhookController = { handleWebhook };
