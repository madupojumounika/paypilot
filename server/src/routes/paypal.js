import { Router } from 'express';
import mongoose from 'mongoose';
import Approval from '../models/Approval.js';
import FxQuote from '../models/FxQuote.js';
import Transaction from '../models/Transaction.js';
import AuditEvent from '../models/AuditEvent.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
const PAYPAL_API = 'https://api-m.sandbox.paypal.com';

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    const error = new Error('PayPal Sandbox is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to the server environment.');
    error.status = 503;
    throw error;
  }
  const response = await fetch(PAYPAL_API + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(clientId + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const error = new Error('PayPal Sandbox authentication failed. Check the server-side Sandbox credentials.');
    error.status = 503;
    throw error;
  }
  return data.access_token;
}

const amountString = value => Number(value).toFixed(2);

router.post('/orders', async (req, res, next) => {
  try {
    const { quoteId } = req.body || {};
    if (!mongoose.isValidObjectId(quoteId)) return res.status(400).json({ error: 'A valid accepted conversion estimate is required.' });
    const quote = await FxQuote.findOne({ _id: quoteId, userId: req.userId, status: 'accepted' });
    if (!quote) return res.status(409).json({ error: 'Accept a valid INR to USD conversion estimate before checkout.' });
    if (quote.expiresAt <= new Date()) return res.status(409).json({ error: 'The conversion estimate expired. Request and accept a fresh estimate before checkout.' });

    const approval = await Approval.findOne({ _id: quote.approvalId, userId: req.userId, status: 'approved' });
    if (!approval) return res.status(409).json({ error: 'The purchase request is not approved.' });
    const transaction = await Transaction.findOne({ approvalId: approval._id, userId: req.userId, status: 'approved_pending_payment' });
    if (!transaction) return res.status(409).json({ error: 'No unpaid approved purchase is available for checkout.' });
    if (Math.abs(transaction.amount - quote.sourceAmountINR) > 0.01) return res.status(409).json({ error: 'The conversion estimate does not match the approved INR amount.' });
    if (transaction.paymentStatus === 'COMPLETED' || transaction.paymentExecuted) return res.status(409).json({ error: 'This purchase has already been paid.' });
    if (transaction.paypalOrderId) return res.json({ orderID: transaction.paypalOrderId, amountUSD: amountString(transaction.amountUSD), currency: 'USD', reused: true });

    const accessToken = await getAccessToken();
    const requestId = 'paypilot-order-' + transaction.id;
    const response = await fetch(PAYPAL_API + '/v2/checkout/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': requestId,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: String(approval._id),
          custom_id: String(transaction._id),
          description: ('PayPilot Sandbox demo: ' + transaction.item).slice(0, 127),
          amount: { currency_code: 'USD', value: amountString(quote.targetAmountUSD) },
        }],
        application_context: {
          brand_name: 'PayPilot AI',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || !data.id) return res.status(502).json({ error: 'PayPal Sandbox could not create the order. No payment was captured.' });

    transaction.fxQuoteId = quote._id;
    transaction.amountUSD = quote.targetAmountUSD;
    transaction.paypalOrderId = data.id;
    transaction.paymentStatus = 'ORDER_CREATED';
    await transaction.save();
    await AuditEvent.create({
      userId: req.userId,
      action: 'payment.order_created',
      entityType: 'transaction',
      entityId: transaction._id,
      details: { approvalId: approval._id, paypalOrderId: data.id, amountINR: transaction.amount, amountUSD: transaction.amountUSD, currency: 'USD', fxQuoteId: quote._id },
    });
    return res.status(201).json({ orderID: data.id, amountUSD: amountString(transaction.amountUSD), currency: 'USD' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return res.status(503).json({ error: 'PayPal Sandbox timed out. Check the order status before retrying.' });
    return next(error);
  }
});

router.post('/capture', async (req, res, next) => {
  try {
    const orderId = typeof req.body?.orderID === 'string' ? req.body.orderID.trim() : '';
    if (!orderId || orderId.length > 80) return res.status(400).json({ error: 'A valid PayPal order ID is required.' });
    const transaction = await Transaction.findOne({ paypalOrderId: orderId, userId: req.userId });
    if (!transaction) return res.status(404).json({ error: 'PayPal order not found for this account.' });
    if (transaction.paymentStatus === 'COMPLETED' && transaction.paymentExecuted) {
      return res.json({ status: 'COMPLETED', alreadyCaptured: true, receipt: receiptFor(transaction) });
    }
    if (!['ORDER_CREATED', 'CAPTURE_UNKNOWN', 'PENDING'].includes(transaction.paymentStatus)) {
      return res.status(409).json({ error: 'This order is not ready for capture.' });
    }

    const accessToken = await getAccessToken();
    const response = await fetch(PAYPAL_API + '/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': 'paypilot-capture-' + transaction.id,
      },
      body: '{}',
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) {
      transaction.paymentStatus = 'CAPTURE_UNKNOWN';
      await transaction.save();
      return res.status(502).json({ error: 'PayPal did not confirm the capture. The result is not marked as paid; refresh the order status before retrying.' });
    }

    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    const captureAmount = capture?.amount;
    const expected = amountString(transaction.amountUSD);
    const amountMatches = captureAmount?.currency_code === 'USD' && amountString(Number(captureAmount.value)) === expected;

    if (data.status === 'COMPLETED' && capture?.id && amountMatches) {
      transaction.paymentStatus = 'COMPLETED';
      transaction.status = 'payment_completed';
      transaction.paymentExecuted = true;
      transaction.paypalCaptureId = capture.id;
      transaction.capturedAt = new Date();
      transaction.receiptNumber = 'PP-' + transaction.id.slice(-8).toUpperCase();
      await transaction.save();
      await AuditEvent.create({
        userId: req.userId,
        action: 'payment.captured',
        entityType: 'transaction',
        entityId: transaction._id,
        details: { paypalOrderId: orderId, paypalCaptureId: capture.id, amountINR: transaction.amount, amountUSD: transaction.amountUSD, currency: 'USD', verified: true },
      });
      return res.json({ status: 'COMPLETED', receipt: receiptFor(transaction) });
    }

    if (data.status === 'PENDING') {
      transaction.paymentStatus = 'PENDING';
      transaction.status = 'payment_pending';
      await transaction.save();
      await AuditEvent.create({
        userId: req.userId,
        action: 'payment.pending',
        entityType: 'transaction',
        entityId: transaction._id,
        details: { paypalOrderId: orderId, paypalCaptureId: capture?.id || '', amountINR: transaction.amount, amountUSD: transaction.amountUSD, currency: 'USD', verified: false },
      });
      return res.status(202).json({ status: 'PENDING', message: 'PayPal reports that the payment is pending. It is not marked as completed.' });
    }

    transaction.paymentStatus = amountMatches ? 'FAILED' : 'AMOUNT_MISMATCH';
    transaction.status = 'payment_failed';
    transaction.paymentExecuted = false;
    await transaction.save();
    await AuditEvent.create({
      userId: req.userId,
      action: 'payment.failed',
      entityType: 'transaction',
      entityId: transaction._id,
      details: { paypalOrderId: orderId, paypalCaptureId: capture?.id || '', paypalStatus: data.status || 'UNKNOWN', expectedAmountUSD: expected, actualAmount: captureAmount || null, amountMatches, verified: false },
    });
    return res.status(502).json({ error: amountMatches ? 'PayPal did not return a completed capture. The payment is not marked as successful.' : 'The captured amount did not match the accepted USD estimate. The payment is flagged for review.' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return res.status(503).json({ error: 'PayPal capture status could not be verified. It is not marked as paid; refresh before retrying.' });
    return next(error);
  }
});

function receiptFor(transaction) {
  return {
    receiptNumber: transaction.receiptNumber,
    transactionId: String(transaction._id),
    merchant: transaction.merchant,
    item: transaction.item,
    amountINR: transaction.amount,
    amountUSD: transaction.amountUSD,
    currency: 'USD',
    paypalOrderId: transaction.paypalOrderId,
    paypalCaptureId: transaction.paypalCaptureId,
    capturedAt: transaction.capturedAt,
    status: transaction.paymentStatus,
    note: 'PayPilot Sandbox demo payment to the configured PayPilot merchant account. This does not place an order with the external retailer.',
  };
}

router.get('/receipt/:transactionId', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.transactionId)) return res.status(400).json({ error: 'Invalid transaction ID.' });
    const transaction = await Transaction.findOne({ _id: req.params.transactionId, userId: req.userId, paymentStatus: 'COMPLETED', paymentExecuted: true });
    if (!transaction) return res.status(404).json({ error: 'A verified completed-payment receipt was not found.' });
    return res.json({ receipt: receiptFor(transaction) });
  } catch (error) { return next(error); }
});

export default router;
