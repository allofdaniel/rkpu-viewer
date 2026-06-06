// Vercel Serverless Function - 항공기 사진 프록시
import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

const REG_PATTERN = /^[A-Z0-9-]{2,12}$/i;
const HEX_PATTERN = /^[0-9A-F]{6}$/i;
const USER_AGENT = 'TBAS/2.1 (+https://tbas.vercel.app)';

function cleanString(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeRegistration(value) {
  const raw = cleanString(value).replace(/\s/g, '');
  if (!raw || !REG_PATTERN.test(raw)) return null;
  return raw;
}

function registrationVariants(value) {
  const normalized = normalizeRegistration(value);
  if (!normalized) return [];
  const compact = normalized.replace(/-/g, '');
  return [...new Set([normalized, compact].filter(Boolean))];
}

function normalizeHex(value) {
  const normalized = cleanString(value);
  if (!HEX_PATTERN.test(normalized)) return null;
  return normalized;
}

function pickPlanespottersImage(photo) {
  if (!photo || typeof photo !== 'object') return null;
  return photo.large?.src ||
    photo.medium?.src ||
    photo.thumbnail_large?.src ||
    photo.thumbnail?.src ||
    photo.thumbnail_large ||
    photo.thumbnail ||
    null;
}

function pickAirportDataImage(item) {
  if (!item || typeof item !== 'object') return null;
  return item.image || item.thumbnail || item.link || null;
}

function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://')) return url.replace(/^http:\/\//, 'https://');
  if (url.startsWith('https://')) return url;
  return null;
}

async function fetchJson(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/plain,*/*'
      }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('[aircraft-photo] source failed:', url, error.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function photoResponse(source, image, extra = {}) {
  const normalizedImage = normalizeImageUrl(image);
  if (!normalizedImage) return null;
  return {
    source,
    image: normalizedImage,
    ...extra
  };
}

async function fetchPlanespottersByReg(reg) {
  const data = await fetchJson(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`);
  const photo = Array.isArray(data?.photos) ? data.photos[0] : null;
  return photoResponse('planespotters', pickPlanespottersImage(photo), {
    photographer: photo?.photographer,
    link: photo?.link
  });
}

async function fetchPlanespottersByHex(hex) {
  const data = await fetchJson(`https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(hex)}`);
  const photo = Array.isArray(data?.photos) ? data.photos[0] : null;
  return photoResponse('planespotters', pickPlanespottersImage(photo), {
    photographer: photo?.photographer,
    link: photo?.link
  });
}

async function fetchAirportDataByReg(reg) {
  const data = await fetchJson(`https://www.airport-data.com/api/ac_thumb.json?r=${encodeURIComponent(reg)}&n=1`, 5500);
  const item = Array.isArray(data?.data) ? data.data[0] : null;
  return photoResponse('airport-data', pickAirportDataImage(item), {
    photographer: item?.photographer,
    link: item?.link
  });
}

async function fetchAirportDataByHex(hex) {
  const data = await fetchJson(`https://www.airport-data.com/api/ac_thumb.json?m=${encodeURIComponent(hex)}&n=1`, 5500);
  const item = Array.isArray(data?.data) ? data.data[0] : null;
  return photoResponse('airport-data', pickAirportDataImage(item), {
    photographer: item?.photographer,
    link: item?.link
  });
}

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;
  if (await checkRateLimit(req, res)) return;

  const { hex, reg } = req.query;
  const normalizedHex = normalizeHex(hex);
  const regCandidates = registrationVariants(reg);

  if (reg && regCandidates.length === 0) {
    return res.status(400).json({ error: 'Invalid reg format' });
  }
  if (hex && !normalizedHex) {
    return res.status(400).json({ error: 'Invalid hex format' });
  }
  if (regCandidates.length === 0 && !normalizedHex) {
    return res.status(400).json({ error: 'hex or reg parameter required' });
  }

  try {
    const attempts = [];
    regCandidates.forEach((candidate) => attempts.push(() => fetchPlanespottersByReg(candidate)));
    if (normalizedHex) attempts.push(() => fetchPlanespottersByHex(normalizedHex));
    regCandidates.forEach((candidate) => attempts.push(() => fetchAirportDataByReg(candidate)));
    if (normalizedHex) attempts.push(() => fetchAirportDataByHex(normalizedHex));

    for (const attempt of attempts) {
      const result = await attempt();
      if (result?.image) {
        return res.status(200).json(result);
      }
    }

    return res.status(200).json({ source: null, image: null });
  } catch (error) {
    console.error('[aircraft-photo] unexpected error:', error);
    return res.status(200).json({ source: null, image: null });
  }
}