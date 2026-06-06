import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

const HEX_PATTERN = /^[0-9a-f]{6}$/i;
const USER_AGENT = 'TBAS/2.1 (+https://tbas.vercel.app)';

function normalizeHex(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return HEX_PATTERN.test(normalized) ? normalized : null;
}

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;
  if (await checkRateLimit(req, res)) return;

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

  const hex = normalizeHex(req.query.hex);
  if (!hex) {
    return res.status(400).json({ error: 'valid hex parameter is required' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(`https://hexdb.io/api/v1/aircraft/${hex}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(200).json({ ModeS: hex });
    }

    const data = await response.json();
    return res.status(200).json({ ModeS: hex, ...data });
  } catch (error) {
    console.warn('[aircraft-details] upstream failed:', error?.message || error);
    return res.status(200).json({ ModeS: hex });
  } finally {
    clearTimeout(timeout);
  }
}