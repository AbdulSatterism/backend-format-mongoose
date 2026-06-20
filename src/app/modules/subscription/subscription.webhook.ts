import { Request, Response } from 'express';
import Stripe from 'stripe';

import { stripe, STRIPE_WEBHOOK_SECRET } from '../../../config/stripe';
import { SubscriptionService } from './subscription.service';

/**
 * POST /api/v1/subscriptions/webhook
 *
 * Source of truth for subscription state. This handler:
 *   1. Verifies the Stripe signature against the RAW body. Invalid -> 400.
 *   2. Returns 200 fast (even for ignored events) so Stripe stops retrying.
 *   3. Returns 500 on a processing error so Stripe DOES retry (transient DB issue).
 *
 * IMPORTANT: this route must be mounted with express.raw({ type: 'application/json' })
 * BEFORE the global express.json() in app.ts, otherwise req.body is already parsed
 * and signature verification fails. See patches/app.ts.
 *
 * This is a plain handler (not catchAsync) on purpose — it owns its status codes.
 */
const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event: Stripe.Event;
  try {
    // req.body is a Buffer because of express.raw().
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature as string,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[stripe] webhook signature verification failed:', err);
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  try {
    await processEvent(event);
    res.status(200).json({ received: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[stripe] webhook handler error (${event.type}):`, err);
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
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      await SubscriptionService.syncSubscriptionToDb(
        event.data.object as Stripe.Subscription,
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const user = await SubscriptionService.syncSubscriptionToDb(sub);
      if (user) {
        await SubscriptionService.patchSubscription(String(user._id), {
          status: 'canceled',
          isActive: false,
        });
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = SubscriptionService.getSubscriptionIdFromInvoice(invoice);
      if (subId) {
        const sub = await SubscriptionService.retrieveSubscription(subId);
        await SubscriptionService.syncSubscriptionToDb(sub);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = SubscriptionService.getSubscriptionIdFromInvoice(invoice);
      if (subId) {
        const sub = await SubscriptionService.retrieveSubscription(subId);
        const user = await SubscriptionService.syncSubscriptionToDb(sub);
        if (user) {
          await SubscriptionService.patchSubscription(String(user._id), {
            status: 'past_due',
            isActive: false,
          });
        }
      }
      break;
    }

    default:
      // Acknowledged but ignored.
      break;
  }
}

export const StripeWebhookController = { handleWebhook };