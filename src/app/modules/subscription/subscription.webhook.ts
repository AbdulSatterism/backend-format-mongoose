import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe } from './stripe';
import config from '../../../config';
import { SubscriptionService } from './subscription.services';
import { logger } from '../../../shared/logger';

/**
 * In-memory dedup cache. Single-process only. For multi-instance deploys use
 * Redis with a TTL (SET event:<id> NX EX 86400).
 */
const processedEvents = new Set<string>();

const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    logger.warn('[Subscription] Webhook: missing stripe-signature header');
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event: Stripe.Event;
  try {
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

  if (processedEvents.has(event.id)) {
    logger.info(
      `[Subscription] Webhook: duplicate event ${event.id}, skipping`,
    );
    res.status(200).json({ received: true });
    return;
  }

  try {
    logger.info(
      `[Subscription] Webhook: processing ${event.type} (${event.id})`,
    );
    await processEvent(event);

    // Mark processed ONLY after success, so a 500 -> Stripe retry isn't skipped.
    processedEvents.add(event.id);
    setTimeout(
      () => processedEvents.delete(event.id),
      24 * 60 * 60 * 1000,
    ).unref?.();

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error(
      `[Subscription] Webhook handler error (${event.type}, ${event.id}):`,
      err,
    );
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
        const sub = await SubscriptionService.retrieveSubscription(subId);
        await SubscriptionService.syncSubscriptionToDb(sub);
        logger.info(`[Subscription] Webhook: checkout completed for ${subId}`);
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await SubscriptionService.syncSubscriptionToDb(
        sub as Stripe.Response<Stripe.Subscription>,
      );
      logger.info(
        `[Subscription] Webhook: subscription ${event.type} ${sub.id} (${sub.status})`,
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Response<Stripe.Subscription>;
      const user = await SubscriptionService.syncSubscriptionToDb(sub);
      if (user) {
        await SubscriptionService.patchSubscription(String(user._id), {
          status: 'canceled',
          isActive: false,
          canceledAt: new Date(),
        });
        logger.info(
          `[Subscription] Webhook: subscription deleted ${sub.id} for user ${user._id}`,
        );
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = SubscriptionService.getSubscriptionIdFromInvoice(invoice);
      if (subId) {
        const sub = await SubscriptionService.retrieveSubscription(subId);
        const user = await SubscriptionService.syncSubscriptionToDb(
          sub as Stripe.Response<Stripe.Subscription>,
        );
        // Successful charge clears any failure state.
        if (user) {
          await SubscriptionService.patchSubscription(String(user._id), {
            failedAttempts: 0,
            lastErrorMessage: undefined,
          });
        }
        logger.info(`[Subscription] Webhook: invoice paid for ${subId}`);
      }
      break;
    }

    case 'invoice.payment_failed':
    case 'invoice.payment_action_required': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = SubscriptionService.getSubscriptionIdFromInvoice(invoice);
      if (subId) {
        const sub = await SubscriptionService.retrieveSubscription(subId);
        // Sync first (preserves the counter), then bump it by one.
        const user = await SubscriptionService.syncSubscriptionToDb(
          sub as Stripe.Response<Stripe.Subscription>,
        );
        if (user) {
          await SubscriptionService.incrementFailedAttempts(
            String(user._id),
            event.type === 'invoice.payment_failed'
              ? 'Payment failed'
              : 'Payment action required',
          );
        }
      }
      break;
    }

    default:
      logger.debug(`[Subscription] Webhook: ignoring ${event.type}`);
      break;
  }
}

export const StripeWebhookController = { handleWebhook };
