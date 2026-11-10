import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function extractJson(raw) {
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('The AI provider returned an unreadable response.');
  }
}

function buildSearchFallback(query, searchResults, budget) {
  const options = searchResults.slice(0, 5).map((source) => {
    const text = source.title + ' ' + source.content;
    const priceMatch = text.match(/(?:₹|Rs\.?\s?|INR\s?)([\d,]+(?:\.\d{1,2})?)/i);
    return {
      product: source.title || 'Product listing',
      merchant: (() => { try { return new URL(source.url).hostname.replace(/^www\./, ''); } catch { return null; } })(),
      price: priceMatch ? '₹' + priceMatch[1] : null,
      reason: source.content.slice(0, 360) || 'Open the source to review the product details.',
      verification: priceMatch ? 'unverified — confirm on seller website' : 'unverified',
    };
  });
  return {
    summary: 'Web research for “' + query + '” found ' + options.length + ' source listings. The AI provider did not return a usable answer, so these are source-based results rather than AI-verified recommendations.' + (budget ? ' Your stated budget is ₹' + Number(budget).toLocaleString('en-IN') + '; confirm each listing price before deciding.' : ''),
    criteria: [
      { label: 'Compare the exact model and specifications', importance: 'must-have' },
      { label: 'Confirm final price, delivery and return policy', importance: 'must-have' },
      { label: 'Check seller reputation and warranty', importance: 'nice-to-have' },
    ],
    options,
    questions: ['What screen size, performance level or key features matter most?'],
    safetyNote: 'No purchase has been made. Prices and availability can change; verify details directly with the seller.',
  };
}

router.post('/plan', async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const budget = Number(req.body?.budget);
  if (query.length < 3 || query.length > 240) return res.status(400).json({ error: 'Describe what you want to buy (3–240 characters).' });
  if (req.body?.budget !== undefined && (!Number.isFinite(budget) || budget <= 0)) return res.status(400).json({ error: 'Budget must be a positive number.' });

  const { OPENROUTER_API_KEY, TAVILY_API_KEY } = process.env;
  if (!OPENROUTER_API_KEY || !TAVILY_API_KEY) {
    return res.status(503).json({ error: 'Free AI research is not configured. Add OPENROUTER_API_KEY and TAVILY_API_KEY to the server environment.' });
  }

  try {
    const searchResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query + ' product price India official store specifications',
        search_depth: 'basic',
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const searchPayload = await searchResponse.json();
    if (!searchResponse.ok) {
      console.error('Tavily search failed:', searchPayload);
      return res.status(502).json({ error: 'Product web search failed. Check your Tavily free-tier key and quota.' });
    }

    const searchResults = (searchPayload.results || []).slice(0, 5).map(item => ({
      title: String(item.title || '').slice(0, 240),
      url: item.url,
      content: String(item.content || '').slice(0, 1800),
    }));
    if (!searchResults.length) return res.status(404).json({ error: 'No useful web results found. Try a more specific product search.' });

    const budgetLine = req.body?.budget !== undefined ? 'Maximum budget: INR ' + budget + '.' : 'No budget was supplied.';
    const prompt = [
      'You are PayPilot AI, a careful shopping research assistant for users in India.',
      'Use ONLY the supplied search results as evidence. Do not invent products, prices, merchants, ratings, availability, discounts or URLs.',
      budgetLine,
      'If a price or merchant is not clearly present in the sources, return null and mark the option unverified.',
      'Do not initiate checkout, request payment credentials, or claim that a payment has happened.',
      'Return only a JSON object with this shape:',
      '{"summary":"string","criteria":[{"label":"string","importance":"must-have or nice-to-have"}],"options":[{"product":"string","merchant":"string or null","price":"string or null","reason":"string","verification":"verified or unverified"}],"questions":["string"],"safetyNote":"string"}',
      'Search results: ' + JSON.stringify(searchResults),
      'User request: ' + query,
    ].join('\n');

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + OPENROUTER_API_KEY,
        'Content-Type': 'application/json',
        'X-Title': 'PayPilot AI',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openrouter/free',
        messages: [
          { role: 'system', content: 'You produce cautious, evidence-based shopping research. Never fabricate commercial facts.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1400,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const aiPayload = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error('OpenRouter request failed:', aiPayload);
      const status = aiResponse.status === 429 ? 429 : 502;
      return res.status(status).json({ error: aiResponse.status === 429 ? 'The free AI model is rate-limited. Try again later.' : 'Free AI model request failed. Check the OpenRouter key and selected free model.' });
    }

    const messageContent = aiPayload.choices?.[0]?.message?.content;
    const raw = typeof messageContent === 'string'
      ? messageContent
      : Array.isArray(messageContent)
        ? messageContent.map(part => typeof part === 'string' ? part : part?.text || '').join('\n')
        : '';
    let result;
    let usedFallback = false;
    if (raw.trim()) {
      try { result = extractJson(raw); }
      catch { usedFallback = true; }
    } else {
      usedFallback = true;
    }
    if (usedFallback || !result || !Array.isArray(result.options)) {
      result = buildSearchFallback(query, searchResults, budget);
    }

    const safeSources = searchResults
      .filter(source => {
        try { return new URL(source.url).protocol === 'https:'; } catch { return false; }
      })
      .map(({ title, url }) => ({ title: title || url, url }));

    return res.json({
      result,
      sources: safeSources,
      provider: usedFallback ? 'Tavily web search · source-based fallback (AI response unavailable)' : 'OpenRouter (free model) + Tavily Search',
      note: 'Free-tier research. Confirm price, stock and seller details on the merchant website before purchasing.',
    });
  } catch (error) {
    console.error('AI shopping research failed:', error.message);
    return res.status(502).json({ error: 'AI shopping research is temporarily unavailable. Please retry.' });
  }
});

export default router;
