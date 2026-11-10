import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try { return res.json({ transactions: await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100) }); }
  catch (error) { return next(error); }
});

export default router;
