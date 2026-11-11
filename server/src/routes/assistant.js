import { Router } from 'express';
import jwt from 'jsonwebtoken';
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

function readAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function metaContent(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = readAttributes(tag);
    const name = (attributes.property || attributes.name || attributes.itemprop || '').toLowerCase();
    if (name !== key.toLowerCase()) continue;
    const content = attributes.content || attributes.value;
    if (content) return decodeHtml(content);
  }
  return '';
}

function isLikelyProductImage(imageUrl, productUrl) {
  try {
    const image = new URL(imageUrl, productUrl);
    const page = new URL(productUrl);
    if (image.protocol !== 'https:' || image.href === page.href) return false;
    const path = image.pathname.toLowerCase();
    const full = (image.hostname + path).toLowerCase();
    if (/\.svg(?:$|\?)/i.test(path) || /logo|icon|sprite|banner|avatar|badge|megamenu|menu|header|footer|payment|flag/.test(full)) return false;
    const host = page.hostname.replace(/^www\./, '');
    if (host === 'amazon.in') {
      return /(^|\.)m\.media-amazon\.com$|(^|\.)images-na\.ssl-images-amazon\.com$/.test(image.hostname)
        && /\/images\/i\//i.test(path)
        && !/\/g\//i.test(path);
    }
    return true;
  } catch { return false; }
}
function readProductImage(html, pageUrl) {
  const tags = html.match(/<img\b[^>]*>/gi) || [];
  const candidates = [];
  for (const tag of tags) {
    const attrs = readAttributes(tag);
    const context = [attrs.alt, attrs.id, attrs.class, attrs.itemprop].join(' ').toLowerCase();
    if (/logo|icon|sprite|banner|avatar|badge|payment|flag/.test(context)) continue;
    let source = attrs['data-old-hires'] || attrs['data-src'] || attrs['data-original'] || attrs['data-lazy-src'] || attrs.src || '';
    if (!source && attrs['data-a-dynamic-image']) {
      try { source = Object.keys(JSON.parse(attrs['data-a-dynamic-image']))[0] || ''; } catch {}
    }
    if (!source && attrs.srcset) source = attrs.srcset.split(',')[0].trim().split(/\s+/)[0];
    if (!source || source.startsWith('data:') || !isLikelyProductImage(source, pageUrl)) continue;
    try {
      const url = new URL(source, pageUrl);
      if (url.protocol !== 'https:') continue;
      const score = (/product|main|gallery|hero|item|image|photo/.test(context) ? 4 : 0)
        + (attrs.alt ? 2 : 0)
        + (attrs.width && Number(attrs.width) >= 180 ? 1 : 0);
      candidates.push({ url: url.href, score });
    } catch {}
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || '';
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
        if (types.some(type => String(type || '').toLowerCase() === 'product' || String(type || '').toLowerCase().endsWith('/product'))) {
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          const imageValue = Array.isArray(node.image) ? node.image[0] : node.image;
          return {
            title: typeof node.name === 'string' ? node.name : '',
            image: typeof imageValue === 'string' ? imageValue : imageValue?.url || imageValue?.contentUrl || '',
            description: typeof node.description === 'string' ? node.description : '',
            price: offer?.price || offer?.lowPrice || '',
            currency: offer?.priceCurrency || '',
          };
        }
      }
    } catch {}
  }
  return null;
}

function isProductPageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.toLowerCase();
    const blocked = /\/content\/|\/collection\/|\/category\/|\/categories\/|\/search\/|\/filter\/|\/listing\/|\/offers?\/|\/deals?\/|under[-/ ]?(?:rs|inr|₹)?[-/ ]?\d|\/(?:laptops?|mobiles?|phones?|tablets?)\/?$/i;
    if (blocked.test(path)) return false;
    if (host === 'amazon.in') return /\/(?:dp|gp\/product)\/[a-z0-9]{8,}/i.test(path);
    if (host === 'flipkart.com') return /\/p\/itm[a-z0-9]{8,}/i.test(path);
    if (host === 'croma.com') return /\/(?:p|product)\/[a-z0-9-]+(?:\.html?)?$/i.test(path);
    if (host === 'reliancedigital.in') return /\/p\/[a-z0-9-]+(?:\.html?)?$/i.test(path);
    if (host === 'vijaysales.com') return /\/p\/[a-z0-9-]+(?:\.html?)?$/i.test(path);
    if (host === 'lenovo.com') return /\/p\/[a-z0-9-]+(?:\.html?)?$/i.test(path);
    if (host === 'hp.com') return /\/(?:pdp|product)\/[a-z0-9-]+(?:\.html?)?$/i.test(path);
    if (host === 'dell.com') return /\/shop\/[a-z0-9-]+\/pd(?:\/|$)/i.test(path);
    if (host === 'asus.com' || host === 'acer.com') return /\/(?:store|shop)\/p\/[a-z0-9-]+(?:\.html?)?$/i.test(path);
    return /\/(?:p|product|products)\/[a-z0-9-]{5,}(?:\.html?)?$/i.test(path);
  } catch { return false; }
}

function looksLikeCategoryResult(item) {
  const text = [item.title, item.content, item.url].join(' ').toLowerCase();
  return /\b(category|collection|buying guide|top picks|best laptops|laptops under|under ₹?\s?\d|under rs\.?\s?\d|price list|all laptops|shop all|browse all|product range|deals and offers)\b/.test(text)
    || /\/content\/|\/collection\/|\/category\/|\/categories\/|\/search\/|\/filter\//i.test(item.url || '');
}

function normalizeProductText(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isAccessoryTitle(title = '') {
  return /\b(?:case for|case only|protective case|hard case|cover|pouch|carry(?:ing)? case|hard shell|protective shell|replacement|spare|ear ?pads?|ear cushions?|headband cushion|cable|charging cable|adapter|dongle|holder|stand|mount|skin|sleeve|bag|protector|screen guard|decorative|storage box|box only)\b/i.test(String(title));
}

function matchesRequestedProduct(title = '', query = '') {
  const cleanTitle = normalizeProductText(title);
  const cleanQuery = normalizeProductText(query);
  if (!cleanTitle || !cleanQuery || isAccessoryTitle(title)) return false;

  // A model number in the request is a strong identifier: require it in the listing title.
  const modelIds = String(query).match(/\b(?=[a-z0-9-]*\d)[a-z]{1,8}[- ]?[a-z0-9-]{2,}\b/gi) || [];
  if (modelIds.length) {
    const matchedModel = modelIds.some(model => cleanTitle.includes(normalizeProductText(model)));
    if (!matchedModel) return false;
  }

  const categoryGroups = [
    { query: /\b(headphones?|headsets?|earbuds?|earphones?)\b/i, title: /\b(headphones?|headsets?|earbuds?|earphones?)\b/i },
    { query: /\b(laptops?|notebooks?)\b/i, title: /\b(laptops?|notebooks?)\b/i },
    { query: /\b(smartphones?|mobiles?|phones?)\b/i, title: /\b(smartphones?|mobiles?|phones?)\b/i },
    { query: /\b(tablets?)\b/i, title: /\b(tablets?)\b/i },
    { query: /\b(monitors?)\b/i, title: /\b(monitors?)\b/i },
    { query: /\b(keyboards?)\b/i, title: /\b(keyboards?)\b/i },
    { query: /\b(mice|mouse)\b/i, title: /\b(mice|mouse)\b/i },
    { query: /\b(speakers?)\b/i, title: /\b(speakers?)\b/i },
    { query: /\b(watches?)\b/i, title: /\b(watches?)\b/i },
    { query: /\b(cameras?)\b/i, title: /\b(cameras?)\b/i },
  ];
  const category = categoryGroups.find(group => group.query.test(query));
  if (category && !category.title.test(title)) return false;

  if (modelIds.length) return true;
  const ignored = new Set(['the','for','with','and','under','below','within','budget','amazon','india','flipkart','croma','wireless','bluetooth','noise','cancelling','active','buy','price','best','new']);
  const words = cleanQuery.split(' ').filter(word => word.length > 2 && !ignored.has(word));
  if (!words.length) return true;
  const matched = words.filter(word => cleanTitle.includes(word)).length;
  return matched >= Math.min(2, words.length);
}

function merchantName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return ({'amazon.in':'Amazon India','flipkart.com':'Flipkart','croma.com':'Croma','reliancedigital.in':'Reliance Digital','vijaysales.com':'Vijay Sales'}[host] || host);
  } catch { return 'Seller website'; }
}

async function fillMissingProductImages(products) {
  const missing = products.filter(product => !product.image);
  const apiKey = process.env.TAVILY_API_KEY;
  if (!missing.length || !apiKey) return products;
  try {
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        urls: missing.map(product => product.url),
        extract_depth: 'basic',
        include_images: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return products;
    const payload = await response.json();
    const imagesByUrl = new Map((payload.results || []).map(result => [
      result.url,
      Array.isArray(result.images) ? result.images : [],
    ]));
    return products.map(product => {
      if (product.image) return product;
      const images = imagesByUrl.get(product.url) || [];
      const candidates = images.map(image => ({
        url: typeof image === 'string' ? image : image?.url,
        description: typeof image === 'object' ? image?.description || '' : '',
      })).filter(image => {
        if (!image.url) return false;
        try {
          const parsed = new URL(image.url);
          return isLikelyProductImage(parsed.href, product.url);
        } catch { return false; }
      });
      const titleWords = product.title.toLowerCase().split(/\W+/).filter(word => word.length > 3);
      candidates.sort((a, b) => {
        const score = candidate => titleWords.reduce((total, word) => total + (candidate.description.toLowerCase().includes(word) ? 1 : 0), 0);
        return score(b) - score(a);
      });
      return candidates[0] ? { ...product, image: candidates[0].url } : product;
    });
  } catch {
    return products;
  }
}

async function enrichShoppingPages(searchResults, query) {
  const candidates = searchResults.filter(item => {
    try {
      const host = new URL(item.url).hostname.replace(/^www\./, '');
      return ['amazon.in','flipkart.com','croma.com','reliancedigital.in','vijaysales.com','lenovo.com','hp.com','dell.com','asus.com','acer.com'].includes(host)
        && isProductPageUrl(item.url)
        && !looksLikeCategoryResult(item);
    } catch { return false; }
  }).slice(0, 6);

  const enriched = await Promise.all(candidates.map(async item => {
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
        signal: AbortSignal.timeout(5500),
      });
      if (!response.ok) return isProductPageUrl(item.url) && matchesRequestedProduct(fallbackTitle, query) ? product : null;
      const html = (await response.text()).slice(0, 1200000);
      const structured = readStructuredProduct(html);
      const title = metaContent(html, 'og:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      const image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image') || readProductImage(html, item.url);
      const description = metaContent(html, 'og:description') || metaContent(html, 'description');
      const price = metaContent(html, 'product:price:amount') || metaContent(html, 'og:price:amount') || structured?.price;
      const currency = metaContent(html, 'product:price:currency') || structured?.currency || '';
      const isStructuredProduct = Boolean(structured?.title);
      const isOpenGraphProduct = metaContent(html, 'og:type').toLowerCase() === 'product';
      if (!isProductPageUrl(item.url)) return null;
      if (!isStructuredProduct && !isOpenGraphProduct && !title) return null;
      const resolvedTitle = structured?.title || title;
      const resolvedImage = structured?.image || image;
      const resolvedDescription = structured?.description || description;
      if (resolvedTitle) product.title = decodeHtml(resolvedTitle.replace(/<[^>]+>/g, '')).slice(0, 220);
      if (!matchesRequestedProduct(product.title, query)) return null;
      if (resolvedImage) {
        try {
          const imageUrl = new URL(resolvedImage, item.url);
          const productUrl = new URL(item.url);
          if (isLikelyProductImage(imageUrl.href, item.url)) product.image = imageUrl.href;
        } catch {}
      }
      if (resolvedDescription) product.description = decodeHtml(resolvedDescription).slice(0, 260);
      const numericPrice = String(price ?? '').replace(/[^\d.]/g, '');
      if (numericPrice && /^\d+(?:\.\d+)?$/.test(numericPrice) && Number(numericPrice) > 0 && currency) {
        const formatted = Number(numericPrice).toLocaleString('en-IN');
        product.price = currency.toUpperCase() === 'INR' ? '₹' + formatted : currency.toUpperCase() + ' ' + formatted;
      }
    } catch {
      // Keep only specific product URLs when a merchant blocks fetching.
      return isProductPageUrl(item.url) && matchesRequestedProduct(fallbackTitle, query) ? product : null;
    }
    return product;
  }));
  return enriched.filter(Boolean);
}

function buildSearchFallback(query, searchResults, products, budget) {
  const summary = products.length
    ? 'The free AI model did not return a usable comparison. PayPilot found ' + products.length + ' individual product page' + (products.length === 1 ? '' : 's') + ' that passed its listing checks. Prices and stock are shown only when the seller page exposes them.'
    : 'The free AI model did not return a usable comparison, and the search did not produce a verifiable individual product page for “' + query + '”. PayPilot has hidden category pages, buying guides and generic search pages instead of presenting them as products. Try a more specific model or retailer search.';
  return {
    summary: summary + (budget ? ' Your budget: ₹' + Number(budget).toLocaleString('en-IN') + '.' : ''),
    criteria: [
      { label: 'Compare the exact model, processor, memory and display specifications', importance: 'must-have' },
      { label: 'Confirm the final selling price, delivery and return policy', importance: 'must-have' },
      { label: 'Check seller reputation, warranty and stock before deciding', importance: 'nice-to-have' },
    ],
    options: [],
    rejectedAlternatives: [],
    questions: products.length ? ['Open each seller page to confirm its current offer and availability.'] : ['Try a specific model such as Lenovo IdeaPad Slim 5, ASUS Vivobook 15 or HP Pavilion 14.', 'You can also include a preferred seller such as Amazon, Flipkart or Croma.'],
    safetyNote: 'Seller pages and metadata can change. Confirm the exact model, final price, warranty and availability on the merchant website. No purchase has been made.',
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
      signal: AbortSignal.timeout(18000),
    });
    const searchPayload = await searchResponse.json();
    if (!searchResponse.ok) {
      console.error('Tavily search failed:', searchPayload);
      return res.status(502).json({ error: 'Product web search failed. Check your Tavily free-tier key and quota.' });
    }

    const searchResults = (searchPayload.results || [])
      .filter(item => !/youtube\.com|youtu\.be/i.test(item.url || ''))
      .map(item => ({
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
      '{"summary":"string","criteria":[{"label":"string","importance":"must-have or nice-to-have"}],"options":[{"product":"string","merchant":"string or null","price":"string or null","reason":"string","verification":"verified or unverified"}],"rejectedAlternatives":[{"product":"string","reason":"string grounded in supplied sources"}],"questions":["string"],"safetyNote":"string"}',
      'Search results: ' + JSON.stringify(searchResults),
      'User request: ' + query,
    ].join('\n');

    // Enrich seller pages while the free AI provider is working. If AI is slow or unavailable,
    // the verified seller data can still be returned as a useful source-based result.
    const productWork = (async () => {
      const products = await enrichShoppingPages(searchResults, query);
      return (await fillMissingProductImages(products)).filter(product => Boolean(product.image));
    })().catch(error => {
      console.warn('Seller page enrichment was incomplete:', error.message);
      return [];
    });

    let raw = '';
    let usedFallback = false;
    let result;
    try {
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
        signal: AbortSignal.timeout(18000),
      });
      const aiPayload = await aiResponse.json();
      if (!aiResponse.ok) {
        const providerMessage = aiPayload?.error?.message || 'HTTP ' + aiResponse.status;
        throw new Error('OpenRouter returned ' + providerMessage);
      }
      const messageContent = aiPayload.choices?.[0]?.message?.content;
      raw = typeof messageContent === 'string'
        ? messageContent
        : Array.isArray(messageContent)
          ? messageContent.map(part => typeof part === 'string' ? part : part?.text || '').join('\\n')
          : '';
      if (!raw.trim()) usedFallback = true;
    } catch (error) {
      usedFallback = true;
      console.warn('OpenRouter unavailable; continuing with seller research:', error.message);
    }

    if (raw.trim()) {
      try { result = extractJson(raw); }
      catch { usedFallback = true; }
    }
    const productsWithImages = (await productWork).map(product => {
      if (!product.price?.startsWith('₹') || !process.env.JWT_SECRET) return product;
      const amountINR = Number(product.price.replace(/[^\d.]/g, ''));
      if (!Number.isFinite(amountINR) || amountINR <= 0) return product;
      const selectionToken = jwt.sign({ type: 'purchase_selection', title: product.title, url: product.url, merchant: product.merchant, amountINR, currency: 'INR' }, process.env.JWT_SECRET, { expiresIn: '15m' });
      return { ...product, selectionToken };
    });
    if (usedFallback || !result || !Array.isArray(result.options)) {
      result = buildSearchFallback(query, searchResults, productsWithImages, budget);
    }
    if (!Array.isArray(result.rejectedAlternatives)) result.rejectedAlternatives = [];
    result.rejectedAlternatives = result.rejectedAlternatives.slice(0, 5).filter(option => option && typeof option.product === 'string' && typeof option.reason === 'string');

        const productUrls = new Set(productsWithImages.map(product => product.url));
    const safeSources = searchResults
      .filter(source => {
        try { return new URL(source.url).protocol === 'https:' && !looksLikeCategoryResult(source); } catch { return false; }
      })
      .filter(source => productUrls.has(source.url))
      .map(({ title, url }) => ({ title: title || url, url }));

    return res.json({
      result,
      products: productsWithImages,
      sources: safeSources,
      provider: usedFallback ? 'Tavily web search · source-based fallback (AI response unavailable)' : 'OpenRouter (free model) + Tavily Search',
      note: 'Free-tier research. Confirm price, stock and seller details on the merchant website before purchasing.',
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timed out|timeout|aborted/i.test(error?.message || '');
    console.error(timedOut ? 'Shopping research timed out during web search:' : 'Shopping research failed:', error.message);
    return res.status(502).json({
      error: timedOut
        ? 'Product search took too long to respond. Please try again in a moment or use a more specific product search.'
        : 'Shopping research is temporarily unavailable. Please retry.',
    });
  }
});

export default router;
