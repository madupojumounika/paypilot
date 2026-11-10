import { Router } from 'express';
import SpendingRule from '../models/SpendingRule.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try { return res.json({ rules: await SpendingRule.find({ userId: req.userId }).sort({ createdAt: -1 }) }); }
  catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, description = '', category = 'all', limit } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || !Number.isFinite(Number(limit)) || Number(limit) <= 0) return res.status(400).json({ error: 'A rule name and positive spending limit are required.' });
    const rule = await SpendingRule.create({ userId: req.userId, name: name.trim(), description, category, limit: Number(limit) });
    return res.status(201).json({ rule });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = {};
    if (typeof req.body?.enabled === 'boolean') allowed.enabled = req.body.enabled;
    if (typeof req.body?.name === 'string' && req.body.name.trim()) allowed.name = req.body.name.trim();
    if (req.body?.limit !== undefined && Number.isFinite(Number(req.body.limit)) && Number(req.body.limit) > 0) allowed.limit = Number(req.body.limit);
    const rule = await SpendingRule.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, { $set: allowed }, { new: true, runValidators: true });
    if (!rule) return res.status(404).json({ error: 'Spending rule not found.' });
    return res.json({ rule });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await SpendingRule.deleteOne({ _id: req.params.id, userId: req.userId });
    if (!result.deletedCount) return res.status(404).json({ error: 'Spending rule not found.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

export default router;
