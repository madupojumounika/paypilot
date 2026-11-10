import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.post('/plan', async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const budget = Number(req.body?.budget);
  if (query.length < 3 || query.length > 240) return res.status(400).json({ error: 'Describe what you want to buy (3–240 characters).' });
  if (req.body?.budget !== undefined && (!Number.isFinite(budget) || budget <= 0)) return res.status(400).json({ error: 'Budget must be a positive number.' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI shopping is not configured. Add GEMINI_API_KEY on the server.' });

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const budgetLine = req.body?.budget !== undefined ? 'User maximum budget: ' + budget + ' INR.' : 'Ask for a budget if it is essential.';
  const prompt = [
    'You are PayPilot AI, a cautious shopping research assistant for users in India.',
    'Research the request using Google Search grounding. ' + budgetLine,
    'Do not invent product names, merchants, ratings, stock, discounts, URLs, or prices.',
    'Only describe current facts that are supported by the search results. If you cannot verify a fact, say it is unverified.',
    'Do not initiate checkout, collect payment details, or recommend bypassing a user's spending rules.',
    'Return valid JSON with this shape: {"summary":string,"criteria":[{"label":string,"importance":"must-have"|"nice-to-have"}],"options":[{"product":string,"merchant":string|null,"price":string|null,"reason":string,"verification":"verified"|"unverified"}],"questions":[string],"safetyNote":string}.',
    'For each option, use only a price and merchant that are explicitly supported by a search result. If unavailable, set them to null and mark verification unverified.',
    'User request: ' + query,
  ].join('\n');

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(30000),
    });
    const payload = await response.json();
    if (!response.ok) return res.status(502).json({ error: 'AI provider request failed.', providerStatus: response.status });
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'AI provider returned an empty response.' });
    let result;
    try { result = JSON.parse(text); }
    catch { return res.status(502).json({ error: 'AI provider returned an unreadable response.' }); }
    const sources = (payload.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
      .map(chunk => chunk.web)
      .filter(source => source?.uri)
      .map(source => ({ title: source.title || source.uri, url: source.uri }));
    return res.json({ result, sources, provider: 'Gemini', note: 'Search-grounded research only. Verify merchant details before checkout.' });
  } catch (error) {
    console.error('AI shopping request failed:', error.message);
    return res.status(502).json({ error: 'AI shopping is temporarily unavailable.' });
  }
});

export default router;
