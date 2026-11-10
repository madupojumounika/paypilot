import { Router } from 'express';
const router = Router();

function extractJson(raw) {
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('The AI provider returned an unreadable response.');
  }
}

function decodeHtml(value = '') {
  return String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim();
}

function metaContent(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/(?:property|name|itemprop)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name !== key.toLowerCase()) continue;
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decodeHtml(content);
  }
  return '';
}

function readStructuredProduct(html) {
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^<[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    try {
      const parsed = JSON.parse(raw);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== 'object') continue;
        if (Array.isArray(node)) { queue.push(...node); continue; }
        if (node['@graph']) queue.push(...(Array.isArray(node['@graph']) ? node['@graph'] : [node['@graph']]));
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        if (types.includes('Product')) {
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          const imageValue = Array.isArray(node.image) ? node.image[0] : node.image;
          return {
            title: typeof node.name === 'string' ? node.name : '',
            image: typeof imageValue === 'string' ? imageValue : imageValue?.url || imageValue?.contentUrl || '',
            description: typeof node.description === 'string' ? node.description : '',
            price: offer?.price || offer?.lowPrice || '',
            currency: offer?.priceCurrency || 'INR',
          };
        }
      }
    } catch {}
  }
  return null;
}

function merchantName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return ({'amazon.in':'Amazon India','flipkart.com':'Flipkart','croma.com':'Croma','reliancedigital.in':'Reliance Digital','vijaysales.com':'Vijay Sales'}[host] || host);
  } catch { return 'Seller website'; }
}

async function enrichShoppingPages(searchResults) {
  const candidates = searchResults.filter(item => {
    try {
      const host = new URL(item.url).hostname.replace(/^www\./, '');
      return ['amazon.in','flipkart.com','croma.com','reliancedigital.in','vijaysales.com','lenovo.com','hp.com','dell.com','asus.com','acer.com'].includes(host);
    } catch { return false; }
  }).slice(0, 6);

  return Promise.all(candidates.map(async item => {
    const fallbackTitle = item.title || 'Product listing';
    const product = {
      title: fallbackTitle,
      url: item.url,
      image: null,
      description: null,
      price: null,
      merchant: merchantName(item.url),
    };
    try {
      const response = await fetch(item.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PayPilotResearch/1.0)', 'Accept': 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(6500),
      });
      if (!response.ok) return product;
      const html = (await response.text()).slice(0, 1200000);
      const title = metaContent(html, 'og:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      const image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
      const description = metaContent(html, 'og:description') || metaContent(html, 'description');
      const structured = readStructuredProduct(html);
      const resolvedTitle = title || structured?.title;
      const resolvedImage = image || structured?.image;
      const resolvedDescription = description || structured?.description;
      const resolvedPrice = price || structured?.price;
      if (resolvedTitle) product.title = decodeHtml(resolvedTitle.replace(/<[^>]+>/g, '')).slice(0, 220);
      if (resolvedImage) {
        try { const imageUrl = new URL(resolvedImage, item.url); if (imageUrl.protocol === 'https:') product.image = imageUrl.href; } catch {}
      }
      if (resolvedDescription) product.description = decodeHtml(resolvedDescription).slice(0, 260);
      if (resolvedPrice && /^[\d,.]+$/.test(String(resolvedPrice).trim())) product.price = '₹' + Number(String(resolvedPrice).replace(/,/g, '')).toLocaleString('en-IN');
    } catch {
      // Keep the seller search result; never invent page metadata when a merchant blocks fetching.
    }
    return product;
  }));
}

function buildSearchFallback(query, searchResults, budget) {
  return {
    summary: 'Web search found ' + searchResults.length + ' relevant shopping pages for “' + query + '”. The free AI model did not return a usable comparison, so PayPilot is showing visual product listings enriched with details available on the seller pages. It will not turn articles, videos or search snippets into fake product cards or guess prices.' + (budget ? ' Search budget: ₹' + Number(budget).toLocaleString('en-IN') + '.' : ''),
    criteria: [
      { label: 'Compare the exact model and specifications on the seller page', importance: 'must-have' },
      { label: 'Confirm the final selling price, delivery and return policy', importance: 'must-have' },
      { label: 'Check seller reputation, warranty and stock', importance: 'nice-to-have' },
    ],
    options: [],
    questions: ['Try again shortly if you want an AI-generated product comparison.'],
    safetyNote: 'Source links are research leads, not verified offers. Confirm product model, price and availability directly with the seller. No purchase has been made.',
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
        query: query + ' buy price India product listing',
        search_depth: 'basic',
        max_results: 8,
        include_domains: ['amazon.in', 'flipkart.com', 'croma.com', 'reliancedigital.in', 'vijaysales.com', 'lenovo.com', 'hp.com', 'dell.com', 'asus.com', 'acer.com'],
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

    const searchResults = (searchPayload.results || []).filter(item => !/youtube\.com|youtu\.be/i.test(item.url || '')).slice(0, 8).map(item => ({
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

    const products = await enrichShoppingPages(searchResults);

    return res.json({
      result,
      products,
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
