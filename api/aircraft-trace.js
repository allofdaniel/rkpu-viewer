// Vercel Serverless Function - Proxy for ADS-B trace/hex APIs
import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

const HEX_PATTERN = /^[0-9a-f]{6}$/i;
const USER_AGENT = 'TBAS/2.1 (+https://tbas.vercel.app)';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeHex(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return HEX_PATTERN.test(normalized) ? normalized : null;
}

async function fetchSource(source, url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json'
      }
    });

    if (response.status === 429) {
      return { ok: false, status: 429, source, ac: [], retryAfter: response.headers.get('Retry-After') || null };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, source, ac: [] };
    }

    const data = await response.json();
    const ac = Array.isArray(data?.ac) ? data.ac : [];
    return { ok: true, status: 200, source, ac, raw: data };
  } catch (error) {
    return { ok: false, status: error?.name === 'AbortError' ? 408 : 500, source, ac: [], error: error?.message || 'fetch failed' };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;
  if (await checkRateLimit(req, res)) return;

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const hex = normalizeHex(req.query.hex);
  if (!hex) {
    return res.status(400).json({ error: 'valid hex parameter is required', ac: [] });
  }

  const sources = [
    ['adsb.lol', `https://api.adsb.lol/v2/hex/${hex}`],
    ['airplanes.live', `https://api.airplanes.live/v2/hex/${hex}`],
    ['adsb.fi', `https://opendata.adsb.fi/api/v2/hex/${hex}`]
  ];

  let lastResult = null;
  for (let i = 0; i < sources.length; i += 1) {
    const [source, url] = sources[i];
    const result = await fetchSource(source, url);
    lastResult = result;

    if (result.ok && result.ac.length > 0) {
      return res.status(200).json({ ...result.raw, ac: result.ac, source });
    }

    if (result.status === 429 && i < sources.length - 1) {
      await sleep(250);
    }
  }

  if (lastResult?.ok) {
    return res.status(200).json({ ac: [], source: lastResult.source, msg: 'No aircraft trace found' });
  }

  console.error('[aircraft-trace] all sources failed:', lastResult);
  return res.status(lastResult?.status === 429 ? 429 : 502).json({
    error: lastResult?.status === 429 ? 'Rate limited by upstream APIs' : 'Failed to fetch aircraft trace',
    source: lastResult?.source || null,
    ac: []
  });
}