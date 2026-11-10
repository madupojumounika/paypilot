import { Router } from 'express';
import SavedProduct from '../models/SavedProduct.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const validWebUrl = (value) => {
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol); }
  catch { return false; }
};

router.get('/', async (req, res, next) => {
  try {
    const products = await SavedProduct.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(200);
    return res.json({ products });
  } catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, url, merchant, image = null, price = null, description = null } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || typeof merchant !== 'string' || !merchant.trim() || typeof url !== 'string' || !validWebUrl(url)) {
      return res.status(400).json({ error: 'A product title, seller and valid product URL are required.' });
    }
    if (image !== null && (typeof image !== 'string' || !validWebUrl(image))) return res.status(400).json({ error: 'Product image URL must be a valid web URL.' });
    const product = await SavedProduct.findOneAndUpdate(
      { userId: req.userId, url },
      { $set: { title: title.trim(), merchant: merchant.trim(), image, price, description } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return res.status(201).json({ product });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await SavedProduct.deleteOne({ _id: req.params.id, userId: req.userId });
    if (!result.deletedCount) return res.status(404).json({ error: 'Saved product not found.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

export default router;
