import { Router } from 'express';
import SavedProduct from '../models/SavedProduct.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function validateRequestedListing(title, query) {
  if (typeof query !== 'string' || !query.trim()) return true;
  if (/\b(?:case for|case only|protective case|hard case|cover|pouch|carrying case|hard shell|replacement|spare|ear ?pads?|cable|adapter|dongle|holder|stand|mount|sleeve|bag|protector|box only)\b/i.test(title)) return false;
  const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const modelIds = query.match(/\b(?=[a-z0-9-]*\d)[a-z]{1,8}[- ]?[a-z0-9-]{2,}\b/gi) || [];
  if (modelIds.length && !modelIds.some(model => normalize(title).includes(normalize(model)))) return false;
  const categories = [
    [/\b(headphones?|headsets?|earbuds?|earphones?)\b/i, /\b(headphones?|headsets?|earbuds?|earphones?)\b/i],
    [/\b(laptops?|notebooks?)\b/i, /\b(laptops?|notebooks?)\b/i],
    [/\b(smartphones?|mobiles?|phones?)\b/i, /\b(smartphones?|mobiles?|phones?)\b/i],
    [/\b(tablets?)\b/i, /\b(tablets?)\b/i],
    [/\b(keyboards?)\b/i, /\b(keyboards?)\b/i],
    [/\b(monitors?)\b/i, /\b(monitors?)\b/i],
  ];
  const category = categories.find(([pattern]) => pattern.test(query));
  if (category && !category[1].test(title)) return false;
  return true;
}

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
    const { title, url, merchant, image = null, price = null, description = null, searchQuery = '' } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || typeof merchant !== 'string' || !merchant.trim() || typeof url !== 'string' || !validWebUrl(url)) {
      return res.status(400).json({ error: 'A product title, seller and valid product URL are required.' });
    }
    if (!validateRequestedListing(title, searchQuery)) return res.status(422).json({ error: 'This listing does not match your requested product. PayPilot blocked saving an accessory or a different model.' });
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
