import { Router } from 'express';
import mongoose from 'mongoose';
import Approval from '../models/Approval.js';
import SpendingRule from '../models/SpendingRule.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AuditEvent from '../models/AuditEvent.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try { return res.json({ approvals: await Approval.find({ userId: req.userId }).sort({ createdAt: -1 }) }); }
  catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const { merchant, item, category = 'shopping', amount, userGoal = '', recommendationSummary = '', recommendationReason = '', rejectedAlternatives = [], productUrl = '', productImage = '' } = req.body || {};
    const value = Number(amount);
    if (typeof merchant !== 'string' || !merchant.trim() || typeof item !== 'string' || !item.trim() || !Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'Merchant, item and a positive amount are required.' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    const rules = await SpendingRule.find({ userId: req.userId, enabled: true });
    const matchingRules = rules.filter(rule => rule.category === 'all' || rule.category === String(category).toLowerCase());
    const exceeded = matchingRules.find(rule => rule.spent + value > rule.limit);
    if (exceeded) return res.status(403).json({ error: 'This request exceeds the "' + exceeded.name + '" spending rule.', rule: exceeded.name });

    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthly = await Transaction.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.userId), status: 'approved_pending_payment', createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    if ((monthly[0]?.total || 0) + value > user.monthlyBudget) return res.status(403).json({ error: 'This request exceeds your monthly budget.' });

    const approval = await Approval.create({ userId: req.userId, merchant: merchant.trim(), item: item.trim(), category, amount: value, userGoal: String(userGoal).slice(0, 240), recommendationSummary: String(recommendationSummary).slice(0, 1200), recommendationReason: String(recommendationReason).slice(0, 600), rejectedAlternatives: Array.isArray(rejectedAlternatives) ? rejectedAlternatives.slice(0, 5).map(option => ({ product: String(option.product || '').slice(0, 180), reason: String(option.reason || '').slice(0, 400) })) : [], productUrl: typeof productUrl === 'string' && /^https:\/\//i.test(productUrl) ? productUrl.slice(0, 1000) : '', productImage: typeof productImage === 'string' && /^https:\/\//i.test(productImage) ? productImage.slice(0, 1000) : '', budgetAtRequest: user.monthlyBudget, policyCheck: { withinMonthlyBudget: true, matchedRules: matchingRules.map(rule => ({ name: rule.name, limit: rule.limit, spentBeforeRequest: rule.spent })), checkedAt: new Date() } });
    await AuditEvent.create({ userId: req.userId, action: 'purchase.requested', entityType: 'approval', entityId: approval._id, details: { goal: approval.userGoal, product: approval.item, merchant: approval.merchant, amount: approval.amount, budgetAtRequest: approval.budgetAtRequest, policyCheck: approval.policyCheck, recommendationReason: approval.recommendationReason, rejectedAlternatives: approval.rejectedAlternatives } });
    return res.status(201).json({ approval, message: 'Request queued. No payment has been initiated.' });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const decision = req.body?.decision;
    if (!['approved', 'declined'].includes(decision)) return res.status(400).json({ error: 'Decision must be approved or declined.' });
    let response;
    await session.withTransaction(async () => {
      const approval = await Approval.findOne({ _id: req.params.id, userId: req.userId }).session(session);
      if (!approval) { response = { status: 404, body: { error: 'Approval request not found.' } }; return; }
      if (approval.status !== 'pending') { response = { status: 409, body: { error: 'This request has already been reviewed.' } }; return; }
      if (decision === 'approved') {
        const currentRules = await SpendingRule.find({ userId: req.userId, enabled: true }).session(session);
        const exceeded = currentRules.find(rule => (rule.category === 'all' || rule.category === approval.category) && rule.spent + approval.amount > rule.limit);
        if (exceeded) { response = { status: 403, body: { error: 'The request now exceeds the "' + exceeded.name + '" spending rule.' } }; return; }
        const user = await User.findById(req.userId).session(session);
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const monthly = await Transaction.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(req.userId), status: 'approved_pending_payment', createdAt: { $gte: monthStart } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]).session(session);
        if (!user || (monthly[0]?.total || 0) + approval.amount > user.monthlyBudget) {
          response = { status: 403, body: { error: 'The request now exceeds your monthly budget.' } };
          return;
        }
      }
      approval.status = decision;
      approval.decisionAt = new Date();
      await approval.save({ session });
      if (decision === 'approved') {
        await Transaction.create([{ userId: req.userId, approvalId: approval._id, merchant: approval.merchant, item: approval.item, category: approval.category, amount: approval.amount, status: 'approved_pending_payment', paymentExecuted: false }], { session });
        const rules = await SpendingRule.find({ userId: req.userId, enabled: true }).session(session);
        for (const rule of rules) if (rule.category === 'all' || rule.category === approval.category) {
          rule.spent += approval.amount;
          await rule.save({ session });
        }
      } else {
        await Transaction.create([{ userId: req.userId, approvalId: approval._id, merchant: approval.merchant, item: approval.item, category: approval.category, amount: approval.amount, status: 'declined', paymentExecuted: false }], { session });
      }
      await AuditEvent.create([{ userId: req.userId, action: decision === 'approved' ? 'purchase.approved' : 'purchase.declined', entityType: 'approval', entityId: approval._id, details: { product: approval.item, merchant: approval.merchant, amount: approval.amount, decision, policyCheck: approval.policyCheck, paymentCaptured: false } }], { session });
      response = { status: 200, body: { approval, message: decision === 'approved' ? 'Approved for the next checkout step. No payment was captured.' : 'Request declined. No payment was made.' } };
    });
    return res.status(response?.status || 200).json(response?.body || {});
  } catch (error) { return next(error); }
  finally { await session.endSession(); }
});

export default router;
