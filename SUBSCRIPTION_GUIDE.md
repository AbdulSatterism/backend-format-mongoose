# Subscription System - Complete Guide

## 📋 Overview

This is a **production-ready subscription system** with monthly auto-renewal powered by **Stripe**. Once a user subscribes, they are automatically charged every month until they cancel.

---

## 🔄 AUTO-RENEWAL FLOW

### How It Works:

1. **User Initiates Subscription**
   - POST `/api/v1/subscriptions/create-checkout-session`
   - User redirected to Stripe Checkout
   - `subscription.isActive` = false (waiting for payment)

2. **Stripe Processes Payment**
   - User enters payment method in Stripe Checkout
   - Subscription created in Stripe with monthly billing cycle
   - Stripe automatically charges card on renewal date

3. **Webhook Syncs Data to DB**
   - `checkout.session.completed` → subscription created
   - `customer.subscription.updated` → monthly renewal confirmed
   - `currentPeriodEnd` updated to next renewal date
   - `subscription.isActive` = true

4. **Every Month - Auto Renewal**
   - Stripe automatically charges the card on file
   - `customer.subscription.updated` webhook fires
   - DB updated with new `currentPeriodEnd`
   - User maintains access until cancellation

5. **User Cancels**
   - POST `/api/v1/subscriptions/cancel`
   - Two options:
     - `immediately: false` → Cancel at period end (keep paid access)
     - `immediately: true` → Cancel now (lose access immediately)
   - `subscription.status` = 'canceled'
   - `subscription.isActive` = false

---

## 📁 File Structure

```
src/app/modules/subscription/
├── subscription.model.ts        # MongoDB schema with all subscription fields
├── subscription.interface.ts    # TypeScript types
├── subscription.services.ts     # Core business logic
├── subscription.controller.ts   # Route handlers
├── subscription.route.ts        # API endpoints
├── subscription.webhook.ts      # Stripe webhook processor
├── reactive.ts                  # Monitoring & middleware
└── stripe.ts                    # Stripe SDK initialization
```

---

## 🔌 API Endpoints

### 1. Create Checkout Session

```bash
POST /api/v1/subscriptions/create-checkout-session
Authorization: Bearer {token}
```

**Response:**

```json
{
  "success": true,
  "status_code": 201,
  "message": "Checkout session created successfully",
  "data": {
    "url": "https://checkout.stripe.com/...",
    "sessionId": "cs_test_..."
  }
}
```

### 2. Get Subscription Status

```bash
GET /api/v1/subscriptions/status
Authorization: Bearer {token}
```

**Response:**

```json
{
  "success": true,
  "status_code": 200,
  "message": "Subscription status retrieved successfully",
  "data": {
    "status": "active",
    "isActive": true,
    "currentPeriodStart": "2025-01-01T00:00:00.000Z",
    "currentPeriodEnd": "2025-02-01T00:00:00.000Z",
    "stripeSubscriptionId": "sub_...",
    "cancelAtPeriodEnd": false,
    "canceledAt": null
  }
}
```

### 3. Cancel Subscription

```bash
POST /api/v1/subscriptions/cancel
Authorization: Bearer {token}
Content-Type: application/json

{
  "immediately": false
}
```

**Response:**

```json
{
  "success": true,
  "status_code": 200,
  "message": "Subscription will cancel at the end of the current period",
  "data": {
    "cancelAtPeriodEnd": true,
    "status": "active"
  }
}
```

### 4. Manual Sync (Admin Only)

```bash
POST /api/v1/subscriptions/sync
Authorization: Bearer {admin_token}
```

**Manually triggers subscription monitoring cycle**

---

## 🔐 Middleware Protection

Protect routes requiring active subscription:

```typescript
import { requireActiveSubscription } from './modules/subscription/reactive';

router.get(
  '/premium-content',
  auth(USER_ROLES.USER),
  requireActiveSubscription,
  controller.getPremiumContent,
);
```

If user doesn't have active subscription, returns:

```json
{
  "success": false,
  "status_code": 403,
  "message": "Active subscription required to access this resource"
}
```

---

## 📊 Database Schema

### User Schema (Embedded Subscription)

```typescript
{
  _id: ObjectId,
  name: String,
  email: String,
  stripe_customer_id: String,

  // Embedded subscription object
  subscription: {
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    stripePriceId: String,
    status: 'active' | 'inactive' | 'past_due' | 'canceled',
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    canceledAt: Date,
    cancelAtPeriodEnd: Boolean,
    isActive: Boolean,
    lastSyncedAt: Date,
    failedAttempts: Number,
    lastErrorMessage: String
  },

  created_at: Date,
  updated_at: Date
}
```

---

## 🔔 Webhook Events Handled

| Event                             | Action                                 |
| --------------------------------- | -------------------------------------- |
| `checkout.session.completed`      | First subscription created             |
| `customer.subscription.created`   | Subscription initiated                 |
| `customer.subscription.updated`   | Monthly renewal confirmed              |
| `customer.subscription.deleted`   | Subscription canceled                  |
| `invoice.paid`                    | Payment successful (sync)              |
| `invoice.payment_failed`          | Payment failed → status = `past_due`   |
| `invoice.payment_action_required` | Additional payment confirmation needed |

---

## 🛡️ Monitoring & Safety Net

The system includes **automatic monitoring** as a safety net in case webhooks fail:

```typescript
// Runs every 6 hours (configurable via SUBSCRIPTION_MONITOR_SCHEDULE env var)
initSubscriptionMonitoring();
```

**Monitoring checks:**

- Detects subscriptions that are out of sync with Stripe
- Auto-syncs when `currentPeriodEnd` changes (monthly renewal)
- Detects canceled subscriptions and marks them accordingly
- Warns about long-standing past_due subscriptions (>7 days)
- Provides logging for debugging

---

## 🚀 Environment Variables

Add to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_ID=price_1234...

# Auto-renewal Monitoring (optional)
SUBSCRIPTION_MONITOR_SCHEDULE=0 */6 * * *    # Every 6 hours
APP_URL=https://yourdomain.com
FRONTEND_URL=https://frontend.yourdomain.com

# Webhook endpoint: {APP_URL}/api/v1/subscriptions/webhook
```

---

## 🔧 Configuration

### 1. Create Stripe Price ID

In Stripe Dashboard:

1. Go to **Products**
2. Create product (e.g., "Monthly Subscription")
3. Create price: **$99/month** (or your price)
4. Copy Price ID → `STRIPE_PRICE_ID` env var

### 2. Setup Webhook

In Stripe Dashboard:

1. Go to **Webhooks** → **Add endpoint**
2. Endpoint URL: `https://yourdomain.com/api/v1/subscriptions/webhook`
3. Events to listen:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
4. Copy Signing Secret → `STRIPE_WEBHOOK_SECRET` env var

### 3. Test Webhook Locally

```bash
# Use Stripe CLI to forward webhooks
stripe listen --forward-to localhost:5000/api/v1/subscriptions/webhook
stripe trigger customer.subscription.updated
```

---

## 📝 Logging & Debugging

All subscription events are logged with the `[Subscription]` prefix:

```
[Subscription] Created Stripe customer cus_... for user 123
[Subscription] Checkout session created: cs_...
[Subscription] Synced subscription sub_... for user 123. Status: active, isActive: true
[Subscription Monitor] Starting subscription monitoring cycle
[Subscription Webhook] Processing event customer.subscription.updated
```

Check logs in:

- `winston/success/` - Info & success logs
- `winston/error/` - Error logs

---

## ✅ Testing Scenarios

### Test 1: User Subscribes

```bash
1. POST /api/v1/subscriptions/create-checkout-session
2. Go to checkout URL
3. Use Stripe test card: 4242 4242 4242 4242
4. Complete payment
5. Check DB: subscription.isActive should be true
```

### Test 2: Monthly Renewal

```bash
1. Have active subscription
2. Run: stripe trigger customer.subscription.updated
3. Check DB: currentPeriodEnd should be updated
```

### Test 3: Cancel Subscription

```bash
1. POST /api/v1/subscriptions/cancel { "immediately": false }
2. Check: cancelAtPeriodEnd = true
3. When period ends, webhook fires: subscription.deleted
4. Check: isActive = false
```

### Test 4: Payment Failure

```bash
1. User has active subscription
2. Update card to expired: stripe trigger invoice.payment_failed
3. Check DB: status = 'past_due', isActive = false
4. User can update payment method in Stripe portal
```

---

## 🚨 Error Handling

### Common Errors

| Error                                     | Cause                          | Solution                     |
| ----------------------------------------- | ------------------------------ | ---------------------------- |
| "Active subscription required"            | User doesn't have subscription | Redirect to checkout         |
| "You already have an active subscription" | User tries to subscribe twice  | Show upgrade/manage page     |
| "Webhook signature verification failed"   | Webhook URL misconfigured      | Check endpoint URL           |
| "No user found for subscription"          | Stripe metadata missing        | Check Stripe customer object |
| "Transient DB error"                      | Webhook retry                  | System auto-retries          |

---

## 🔐 Security Best Practices

✅ **Implemented:**

- Stripe signature verification on every webhook
- Idempotency keys prevent duplicate checkout sessions
- Idempotency cache prevents duplicate webhook processing
- User metadata stored in Stripe for webhook resolution
- Status validation before granting access
- Admin-only endpoints for manual operations

⚠️ **Additional Recommendations:**

- Use Redis for distributed idempotency cache (instead of in-memory)
- Implement rate limiting on subscription endpoints
- Add email notifications for payment failures
- Audit log all subscription state changes
- Regular reconciliation with Stripe API

---

## 📚 Quick Reference

| Task                | Endpoint                   | Method |
| ------------------- | -------------------------- | ------ |
| Start subscription  | `/create-checkout-session` | POST   |
| Check status        | `/status`                  | GET    |
| Cancel subscription | `/cancel`                  | POST   |
| Manual sync         | `/sync`                    | POST   |
| Webhook receiver    | `/webhook`                 | POST   |

---

## 🎯 Production Checklist

- [ ] Environment variables configured
- [ ] Stripe API keys set (not test keys)
- [ ] Webhook endpoint verified in Stripe Dashboard
- [ ] `APP_URL` set to production domain
- [ ] Database indexed on subscription fields
- [ ] Monitoring cron schedule configured
- [ ] Error logging reviewed
- [ ] Rate limiting configured
- [ ] HTTPS enabled for webhook endpoint
- [ ] Load testing completed
- [ ] Backup strategy in place
- [ ] Monitoring alerts configured
- [ ] Payment method stored securely in Stripe (no local storage)
- [ ] User communication plan for payment failures

---

## 🤝 Support

For issues:

1. Check logs: `grep '\[Subscription\]' winston/success/*.log`
2. Test webhook: `stripe trigger customer.subscription.updated`
3. Verify Stripe configuration
4. Check network connectivity to Stripe API
5. Review error messages in response payloads

---

## 📖 Related Documentation

- [Stripe Subscriptions API](https://stripe.com/docs/billing/subscriptions)
- [Webhook Events Reference](https://stripe.com/docs/api/events)
- [Testing Webhooks](https://stripe.com/docs/webhooks/test)
