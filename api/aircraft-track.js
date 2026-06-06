import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

const HEX_PATTERN = /^[0-9a-f]{6}$/i;
const USER_AGENT = 'TBAS/2.1 (+https://tbas.vercel.app)';

function normalizeHex(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return HEX_PATTERN.test(normalized) ? normalized : null;
}

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;
  if (await checkRateLimit(req, res)) return;

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');

  const hex = normalizeHex(req.query.hex || req.query.icao24);
  const time = Number.isFinite(Number(req.query.time)) ? Number(req.query.time) : 0;
  if (!hex) {
    return res.status(400).json({ error: 'valid hex parameter is required', path: [] });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`https://opensky-network.org/api/tracks/all?icao24=${hex}&time=${time}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(200).json({ icao24: hex, path: [], source: 'opensky-rest', status: response.status });
    }

    const data = await response.json();
    return res.status(200).json({ ...data, source: 'opensky-rest' });
  } catch (error) {
    console.warn('[aircraft-track] upstream failed:', error?.message || error);
    return res.status(200).json({ icao24: hex, path: [], source: 'opensky-rest' });
  } finally {
    clearTimeout(timeout);
  }
}