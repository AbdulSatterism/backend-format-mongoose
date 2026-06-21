# Subscription System - Developer Quick Reference

## 🔗 API Endpoints Summary

```bash
# Create checkout (user needs to subscribe)
POST /api/v1/subscriptions/create-checkout-session
Header: Authorization: Bearer {token}

# Get subscription status (check if user has active subscription)
GET /api/v1/subscriptions/status
Header: Authorization: Bearer {token}

# Cancel subscription (user must be authenticated)
POST /api/v1/subscriptions/cancel
Header: Authorization: Bearer {token}
Body: { "immediately": false }

# Manual sync (admin only - for testing)
POST /api/v1/subscriptions/sync
Header: Authorization: Bearer {admin_token}

# Webhook receiver (Stripe → Backend)
POST /api/v1/subscriptions/webhook
(No auth needed - signature verified)
```

---

## 🛡️ Protecting Routes with Subscription

```typescript
// Import the middleware
import { requireActiveSubscription } from '@/modules/subscription/reactive';

// Use it in your routes
router.get(
  '/premium-feature',
  auth(USER_ROLES.USER), // User must be logged in
  requireActiveSubscription, // User must have active subscription
  controller.getPremiumFeature, // Handler
);

// Or directly in controller (not recommended)
const user = await User.findById(userId);
if (!user.subscription?.isActive) {
  throw new AppError(StatusCodes.FORBIDDEN, 'Active subscription required');
}
```

---

## 🔍 Checking User Subscription Status

```typescript
// Get user with subscription
const user = await User.findById(userId);

// Check if active
if (user.subscription?.isActive) {
  console.log('User has active subscription');
  console.log('Expires on:', user.subscription.currentPeriodEnd);
} else {
  console.log('User does not have active subscription');
}

// Get full status info
const status = await SubscriptionService.getStatus(userId);
console.log(status);
// Output:
// {
//   status: 'active',
//   isActive: true,
//   currentPeriodStart: '2025-01-01T00:00:00.000Z',
//   currentPeriodEnd: '2025-02-01T00:00:00.000Z',
//   stripeSubscriptionId: 'sub_...',
//   cancelAtPeriodEnd: false,
//   canceledAt: null
// }
```

---

## 🧪 Testing Webhooks Locally

```bash
# Terminal 1: Start your app
npm run dev

# Terminal 2: Forward webhooks from Stripe CLI
stripe login
stripe listen --forward-to localhost:5000/api/v1/subscriptions/webhook

# Terminal 3: Trigger test webhooks
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed

# Check logs
tail -f winston/success/*.log
```

---

## 📝 Environment Setup

```bash
# Copy template
cp .env.example .env

# Edit .env with your values
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_ID=price_...
APP_URL=https://yourdomain.com
```

---

## 🔧 Debugging Commands

```bash
# Check recent logs
cat winston/success/$(ls -t winston/success | head -n1)

# Check error logs
cat winston/error/$(ls -t winston/error | head -n1)

# Search for subscription logs
grep '\[Subscription\]' winston/success/*.log | tail -50

# Monitor logs in real-time
tail -f winston/success/*.log | grep '\[Subscription\]'

# Check last webhook events
mongosh
use your-database
db.users.findOne(
  { 'subscription.isActive': true },
  { _id: 1, email: 1, 'subscription.lastSyncedAt': 1, 'subscription.status': 1 }
)
```

---

## 🐛 Common Issues & Solutions

### Issue: "Webhook signature verification failed"

**Cause:** Wrong webhook endpoint or secret
**Fix:**

1. Verify webhook URL in Stripe Dashboard
2. Copy correct `STRIPE_WEBHOOK_SECRET` from Stripe
3. Restart app with new env var

### Issue: "Active subscription required"

**Cause:** User doesn't have active subscription
**Fix:**

1. User must complete checkout
2. Webhook must fire and sync
3. Check DB: `user.subscription.isActive` should be true

### Issue: Subscription shows as inactive but should be active

**Cause:** Webhook didn't fire or sync failed
**Fix:**

1. Check logs for webhook errors
2. Manually trigger sync: `POST /api/v1/subscriptions/sync`
3. Monitor cycle might auto-fix (runs every 6 hours)

### Issue: Payment failed but user still has access

**Cause:** Webhook not received yet
**Fix:**

1. Wait for webhook to arrive (usually <1 second)
2. Or manually trigger sync
3. Check Stripe Dashboard to confirm failure

### Issue: User can't create second subscription

**Cause:** Already has active subscription
**Fix:**

1. Expected behavior - shows error
2. User must cancel first subscription
3. Then create new one

---

## 📊 Database Queries

```javascript
// Find all active subscriptions
db.users.find({ 'subscription.isActive': true });

// Find subscriptions expiring today
db.users.find({
  'subscription.currentPeriodEnd': {
    $gte: new Date().toISOString().split('T')[0],
    $lt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  },
});

// Find past_due subscriptions
db.users.find({ 'subscription.status': 'past_due' });

// Count active subscriptions
db.users.countDocuments({ 'subscription.isActive': true });

// Find user by Stripe customer ID
db.users.findOne({ stripe_customer_id: 'cus_...' });

// Find user by Stripe subscription ID
db.users.findOne({ 'subscription.stripeSubscriptionId': 'sub_...' });
```

---

## 🚀 Deployment Steps

```bash
# 1. Build
npm run build

# 2. Test build
npm run start

# 3. Verify environment
echo $STRIPE_SECRET_KEY  # Should show key
echo $APP_URL             # Should show domain

# 4. Update Stripe Webhook
# Go to Stripe Dashboard → Webhooks
# Update endpoint URL to: https://yourdomain.com/api/v1/subscriptions/webhook
# Copy new STRIPE_WEBHOOK_SECRET to your server

# 5. Restart application
# (Your process manager handles this)

# 6. Verify webhook is working
# In Stripe Dashboard, send test webhook
# Check logs: grep '\[Subscription\]' winston/success/*.log
```

---

## 📋 Monthly Maintenance

```bash
# Check for failed subscriptions
grep 'payment_failed\|past_due' winston/success/*.log | wc -l

# Review error logs
wc -l winston/error/*.log

# Verify monitoring ran
grep 'Subscription Monitor' winston/success/*.log | tail -10

# Check for stuck subscriptions
db.users.find({
  'subscription.status': 'past_due',
  'subscription.lastSyncedAt': { $lt: new Date(Date.now() - 7*24*60*60*1000) }
})

# Generate report
echo "Active Subscriptions:" && \
db.users.countDocuments({ 'subscription.isActive': true }) && \
echo "Past Due:" && \
db.users.countDocuments({ 'subscription.status': 'past_due' }) && \
echo "Canceled:" && \
db.users.countDocuments({ 'subscription.status': 'canceled' })
```

---

## 🎯 Testing Subscription Features

### Test 1: Happy Path (Subscribe → Auto-renew → Cancel)

```bash
1. POST /api/v1/subscriptions/create-checkout-session
   → Save sessionId
   → Go to checkout URL
   → Use test card 4242 4242 4242 4242
   → Complete payment

2. Check DB: user.subscription.isActive should be true

3. Simulate webhook:
   stripe trigger customer.subscription.updated

4. Check DB: currentPeriodEnd updated?

5. POST /api/v1/subscriptions/cancel { "immediately": false }

6. Simulate cancellation:
   stripe trigger customer.subscription.deleted

7. Check DB: isActive should be false
```

### Test 2: Payment Failure Recovery

```bash
1. Have active subscription
2. Simulate payment fail:
   stripe trigger invoice.payment_failed
3. Check: status = 'past_due', isActive = false
4. Fix card in Stripe or simulation
5. Simulate payment success:
   stripe trigger invoice.paid
6. Check: status = 'active', isActive = true
```

### Test 3: Monitoring Safety Net

```bash
1. Have active subscription
2. Manually update DB: subscription.currentPeriodEnd = yesterday
3. Wait for monitoring cycle OR:
   POST /api/v1/subscriptions/sync
4. Check: currentPeriodEnd automatically updated from Stripe
```

---

## 🔐 Security Checklist

- [ ] Stripe Secret Key is in `.env` (not in code)
- [ ] Webhook Secret is in `.env` (not in code)
- [ ] HTTPS enabled on production
- [ ] Webhook endpoint verified in Stripe Dashboard
- [ ] Rate limiting configured
- [ ] Admin endpoints protected
- [ ] No subscription data in error responses
- [ ] Logs don't contain sensitive info
- [ ] Database backups in place

---

## 📞 Getting Help

1. **Check logs first:**

   ```bash
   grep '\[Subscription\]' winston/success/*.log
   ```

2. **Verify Stripe configuration:**
   - Dashboard → API Keys → Verify Secret Key
   - Dashboard → Webhooks → Verify endpoint and secret

3. **Test webhook locally:**

   ```bash
   stripe trigger customer.subscription.updated
   ```

4. **Check database:**

   ```bash
   db.users.findOne({ email: 'user@example.com' }).subscription
   ```

5. **Manual sync to force update:**
   ```bash
   POST /api/v1/subscriptions/sync  # Admin only
   ```

---

## 📚 File Locations

| Task            | File                                                     |
| --------------- | -------------------------------------------------------- |
| Main logic      | `src/app/modules/subscription/subscription.services.ts`  |
| Webhook handler | `src/app/modules/subscription/subscription.webhook.ts`   |
| Middleware      | `src/app/modules/subscription/reactive.ts`               |
| Database schema | `src/app/modules/subscription/subscription.model.ts`     |
| API routes      | `src/app/modules/subscription/subscription.route.ts`     |
| Types           | `src/app/modules/subscription/subscription.interface.ts` |
| Monitoring      | `src/app/modules/subscription/reactive.ts`               |
| Configuration   | `.env`                                                   |
| Documentation   | `SUBSCRIPTION_GUIDE.md`                                  |

---

## ✅ Done!

Your subscription system is production-ready with automatic monthly renewal! 🎉

Key features:
✅ Automatic monthly charging (Stripe handles)
✅ Webhook sync to keep DB updated
✅ Monitoring safety net
✅ Comprehensive error handling
✅ User access protection with middleware
✅ Detailed logging
✅ Type-safe code

No additional development needed for renewals - Stripe handles everything! 🚀
