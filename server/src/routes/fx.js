import { Router } from 'express';
import mongoose from 'mongoose';
import Approval from '../models/Approval.js';
import FxQuote from '../models/FxQuote.js';
import AuditEvent from '../models/AuditEvent.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const FX_API = 'https://api.frankfurter.dev/v2';
const QUOTE_TTL_MS = 5 * 60 * 1000;
const MAX_RATE_AGE_DAYS = 4;

async function fetchEcbReferenceRates() {
  const response = await fetch(FX_API + '/rates?base=EUR&quotes=INR,USD&providers=ecb', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('The ECB reference-rate service is temporarily unavailable.');
  const rows = await response.json();
  const inr = Array.isArray(rows) ? rows.find(row => row.base === 'EUR' && row.quote === 'INR') : null;
  const usd = Array.isArray(rows) ? rows.find(row => row.base === 'EUR' && row.quote === 'USD') : null;
  if (!inr || !usd || !Number.isFinite(inr.rate) || !Number.isFinite(usd.rate) || inr.rate <= 0 || usd.rate <= 0 || inr.date !== usd.date) {
    throw new Error('A complete INR/USD reference-rate pair could not be verified.');
  }
  const rateDate = new Date(inr.date + 'T00:00:00.000Z');
  const ageDays = (Date.now() - rateDate.getTime()) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays > MAX_RATE_AGE_DAYS || ageDays < -1) {
    throw new Error('The latest published ECB reference rate is too old. Please try again later.');
  }
  return { rateDate: inr.date, rateUSDPerINR: usd.rate / inr.rate };
}

router.post('/quotes', async (req, res, next) => {
  try {
    const { approvalId } = req.body || {};
    if (!mongoose.isValidObjectId(approvalId)) return res.status(400).json({ error: 'A valid approved purchase request is required.' });
    const approval = await Approval.findOne({ _id: approvalId, userId: req.userId, status: 'approved' });
    if (!approval) return res.status(404).json({ error: 'Approved purchase request not found.' });

    const { rateDate, rateUSDPerINR } = await fetchEcbReferenceRates();
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + QUOTE_TTL_MS);
    const sourceAmountINR = Math.round(approval.amount * 100) / 100;
    const targetAmountUSD = Math.round(sourceAmountINR * rateUSDPerINR * 100) / 100;
    if (!Number.isFinite(targetAmountUSD) || targetAmountUSD <= 0) return res.status(502).json({ error: 'The conversion result could not be verified.' });

    const quote = await FxQuote.create({
      userId: req.userId,
      approvalId: approval._id,
      sourceAmountINR,
      targetAmountUSD,
      rateINRPerUSD: 1 / rateUSDPerINR,
      rateUSDPerINR,
      rateDate,
      provider: 'European Central Bank reference rates via Frankfurter API',
      fetchedAt,
      expiresAt,
    });
    await AuditEvent.create({
      userId: req.userId,
      action: 'fx.quote.created',
      entityType: 'fx_quote',
      entityId: quote._id,
      details: { approvalId: approval._id, sourceAmountINR, targetAmountUSD, rateUSDPerINR, rateINRPerUSD: 1 / rateUSDPerINR, rateDate, provider: quote.provider, expiresAt },
    });
    return res.status(201).json({
      quote: {
        id: quote.id,
        approvalId: String(approval._id),
        sourceAmountINR,
        targetAmountUSD,
        rateUSDPerINR,
        rateINRPerUSD: 1 / rateUSDPerINR,
        rateDate,
        provider: quote.provider,
        fetchedAt,
        expiresAt,
        status: quote.status,
        quoteType: 'reference_rate',
        disclaimer: 'This is an ECB reference-rate estimate, not a locked PayPal conversion rate or a guarantee of the amount a bank or payment provider may charge.',
      },
    });
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return res.status(503).json({ error: 'The exchange-rate service timed out. No quote was created.' });
    if (error.message?.includes('reference-rate') || error.message?.includes('could not be verified') || error.message?.includes('temporarily unavailable')) return res.status(503).json({ error: error.message + ' No quote was created.' });
    return next(error);
  }
});

router.post('/quotes/:id/accept', async (req, res, next) => {
  try {
    const quote = await FxQuote.findOne({ _id: req.params.id, userId: req.userId });
    if (!quote) return res.status(404).json({ error: 'Conversion quote not found.' });
    if (quote.expiresAt <= new Date()) {
      quote.status = 'expired';
      await quote.save();
      return res.status(409).json({ error: 'This conversion quote has expired. Request a fresh quote before checkout.' });
    }
    if (quote.status === 'accepted') return res.json({ quote: { id: quote.id, status: quote.status, acceptedAt: quote.acceptedAt }, message: 'Conversion quote was already accepted.' });
    if (quote.status !== 'quoted') return res.status(409).json({ error: 'This conversion quote cannot be accepted.' });
    quote.status = 'accepted';
    quote.acceptedAt = new Date();
    await quote.save();
    await AuditEvent.create({
      userId: req.userId,
      action: 'fx.quote.accepted',
      entityType: 'fx_quote',
      entityId: quote._id,
      details: { approvalId: quote.approvalId, sourceAmountINR: quote.sourceAmountINR, targetAmountUSD: quote.targetAmountUSD, rateUSDPerINR: quote.rateUSDPerINR, rateDate: quote.rateDate, acceptedAt: quote.acceptedAt },
    });
    return res.json({ quote: { id: quote.id, status: quote.status, acceptedAt: quote.acceptedAt }, message: 'Conversion estimate accepted. PayPal checkout is a separate step.' });
  } catch (error) { return next(error); }
});

export default router;
