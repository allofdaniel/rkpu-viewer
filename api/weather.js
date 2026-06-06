const AVIATION_WEATHER_BASE = 'https://aviationweather.gov/api/data';
const RAINVIEWER_META = 'https://api.rainviewer.com/public/weather-maps.json';

const FALLBACK_WEATHER = {
  metar: [
    {
      icaoId: 'RKPU',
      reportTime: '2026-01-01T00:00:00Z',
      temp: 5,
      dewp: -2,
      wdir: 310,
      wspd: 12,
      visib: '10+',
      altim: 30.12,
      rawOb: 'RKPU fallback METAR unavailable from upstream service'
    }
  ],
  taf: [
    {
      icaoId: 'RKPU',
      issueTime: '2026-01-01T00:00:00Z',
      validTimeFrom: '2026-01-01T00:00:00Z',
      validTimeTo: '2026-01-02T00:00:00Z',
      rawTAF: 'RKPU fallback TAF unavailable from upstream service'
    }
  ],
  sigmet: { international: [] },
  lightning: { strikes: [] },
  llws: { reports: [] }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TBAS/2.1 (+https://tbas.vercel.app)',
        Accept: 'application/json'
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackFor(type) {
  return FALLBACK_WEATHER[type] ?? { ok: false, message: 'Unsupported weather type' };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const type = String(req.query.type || 'metar').toLowerCase();
  const station = String(req.query.station || req.query.ids || 'RKPU').toUpperCase();

  try {
    if (type === 'metar') {
      const data = await fetchJson(`${AVIATION_WEATHER_BASE}/metar?ids=${encodeURIComponent(station)}&format=json`);
      return res.status(200).json(Array.isArray(data) ? data : []);
    }
    if (type === 'taf') {
      const data = await fetchJson(`${AVIATION_WEATHER_BASE}/taf?ids=${encodeURIComponent(station)}&format=json`);
      return res.status(200).json(Array.isArray(data) ? data : []);
    }
    if (type === 'radar' || type === 'satellite') {
      const data = await fetchJson(RAINVIEWER_META);
      return res.status(200).json(data || {});
    }
    if (type === 'sigmet' || type === 'lightning' || type === 'llws') {
      return res.status(200).json(fallbackFor(type));
    }
    return res.status(400).json({ error: `Unsupported weather type: ${type}` });
  } catch (error) {
    console.error(`[weather] ${type} upstream failed:`, error.message);
    return res.status(200).json(fallbackFor(type));
  }
}