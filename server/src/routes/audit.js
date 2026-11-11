import { Router } from 'express';
import AuditEvent from '../models/AuditEvent.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const events = await AuditEvent.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ events });
  } catch (error) { return next(error); }
});

export default router;
