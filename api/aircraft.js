/**
 * Vercel Serverless Function - Proxy for airplanes.live API
 * DO-278A 요구사항 추적: SRS-API-002
 */
import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 좌표 유효성 검증
 * @param {string} lat - 위도
 * @param {string} lon - 경도
 * @param {string} radius - 반경
 * @returns {{ valid: boolean, error?: string, values?: object }}
 */
function validateCoordinates(lat, lon, radius) {
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const radiusNum = parseFloat(radius) || 100;

  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    return { valid: false, error: 'Invalid latitude. Must be between -90 and 90.' };
  }
  if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
    return { valid: false, error: 'Invalid longitude. Must be between -180 and 180.' };
  }
  if (radiusNum < 1 || radiusNum > 500) {
    return { valid: false, error: 'Invalid radius. Must be between 1 and 500 nm.' };
  }

  return { valid: true, values: { lat: latNum, lon: lonNum, radius: radiusNum } };
}

export default async function handler(req, res) {
  // DO-278A SRS-SEC-002: CORS 처리 (강화된 버전)
  if (setCorsHeaders(req, res)) return;
  // DO-278A SRS-SEC-003: Rate Limiting
  if (await checkRateLimit(req, res)) return;

  res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=5');

  const { lat, lon, radius } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon parameters are required', ac: [] });
  }

  // DO-278A SRS-SEC-004: 입력 검증
  const validation = validateCoordinates(lat, lon, radius);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error, ac: [] });
  }

  const { lat: validLat, lon: validLon, radius: r } = validation.values;
  const apiUrl = `https://api.airplanes.live/v2/point/${validLat}/${validLon}/${r}`;

  // Retry logic with exponential backoff
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(apiUrl);

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || (attempt + 1) * 2;
        if (attempt < maxRetries - 1) {
          await sleep(retryAfter * 1000);
          continue;
        }
        return res.status(429).json({
          error: 'Rate limited by upstream API',
          retryAfter: retryAfter,
          ac: [] // Return empty array so frontend doesn't crash
        });
      }

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      const data = await response.json();
      return res.status(200).json(data);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await sleep((attempt + 1) * 1000);
      }
    }
  }

  console.error('Error fetching aircraft data after retries:', lastError);
  return res.status(500).json({
    error: 'Failed to fetch aircraft data',
    details: lastError?.message,
    ac: [] // Return empty array so frontend doesn't crash
  });
}
