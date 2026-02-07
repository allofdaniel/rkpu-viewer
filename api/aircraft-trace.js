// Vercel Serverless Function - Proxy for airplanes.live trace API
import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
  // DO-278A SRS-SEC-002: Use secure CORS headers
  if (setCorsHeaders(req, res)) return;
  // DO-278A SRS-SEC-003: Rate Limiting
  if (await checkRateLimit(req, res)) return;

  res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=5');

  const { hex } = req.query;

  if (!hex) {
    return res.status(400).json({ error: 'hex parameter is required' });
  }

  // airplanes.live trace API - returns last 25 positions for an aircraft
  const apiUrl = `https://api.airplanes.live/v2/hex/${hex}`;

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
          ac: []
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

  console.error('Error fetching aircraft trace after retries:', lastError);
  return res.status(500).json({
    error: 'Failed to fetch aircraft trace',
    details: lastError?.message,
    ac: []
  });
}
