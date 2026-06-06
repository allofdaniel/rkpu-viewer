/**
 * Vercel Serverless Function - Aircraft proxy
 * Sources: airplanes.live (primary) + OpenSky Network (merge for extra coverage)
 * 응답 스키마는 airplanes.live 형식을 유지 (프론트 변경 불필요)
 * DO-278A 요구사항 추적: SRS-API-002
 */
import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const M_TO_FT = 3.28084;
const MS_TO_KT = 1.94384;
const MS_TO_FTMIN = 196.8504;
const NM_TO_KM = 1.852;

const OPENSKY_AUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const OPENSKY_CLIENT_ID = process.env.OPENSKY_CLIENT_ID || '';
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET || '';
// Basic Auth fallback (OAuth2 미설정 시)
const OPENSKY_USERNAME = process.env.OPENSKY_USERNAME || '';
const OPENSKY_PASSWORD = process.env.OPENSKY_PASSWORD || '';

// 토큰 캐시 (OAuth2)
let openSkyTokenCache = { token: null, expires: 0 };

/**
 * 좌표 유효성 검증
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

/**
 * Haversine 거리 (km)
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 중심+반경(nm) → bbox (lamin, lomin, lamax, lomax)
 */
function bboxFromRadius(lat, lon, radiusNm) {
  const radiusKm = radiusNm * NM_TO_KM;
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.05, Math.cos(lat * Math.PI / 180)));
  return {
    lamin: Math.max(-90, lat - dLat),
    lamax: Math.min(90, lat + dLat),
    lomin: Math.max(-180, lon - dLon),
    lomax: Math.min(180, lon + dLon)
  };
}

/**
 * airplanes.live `point` 호출
 */
async function fetchAircraftSource(source, apiUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TBAS/2.1 (+https://tbas.vercel.app)',
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[aircraft] ${source} failed:`, response.status, response.statusText);
      return { ok: false, status: response.status, ac: [], source };
    }

    const data = await response.json();
    const ac = Array.isArray(data.ac) ? data.ac : [];
    return { ok: true, status: 200, ac, source };
  } catch (error) {
    console.error(`[aircraft] ${source} error:`, error.message);
    return { ok: false, status: error.name === 'AbortError' ? 408 : 500, ac: [], source };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAirplanesLive(lat, lon, radius) {
  const sources = [
    ['adsb.lol', `https://api.adsb.lol/v2/point/${lat}/${lon}/${radius}`],
    ['airplanes.live', `https://api.airplanes.live/v2/point/${lat}/${lon}/${radius}`],
    ['adsb.fi', `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${radius}`]
  ];

  let lastResult = { ok: false, status: 500, ac: [], source: 'none' };
  for (const [source, url] of sources) {
    const result = await fetchAircraftSource(source, url);
    lastResult = result;
    if (result.ok && result.ac.length > 0) return result;
  }
  return lastResult;
}

/**
 * OpenSky OAuth2 토큰 (자격증명 있을 때만)
 */
async function getOpenSkyToken() {
  if (!OPENSKY_CLIENT_ID || !OPENSKY_CLIENT_SECRET) return null;
  if (openSkyTokenCache.token && openSkyTokenCache.expires > Date.now()) {
    return openSkyTokenCache.token;
  }
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: OPENSKY_CLIENT_ID,
      client_secret: OPENSKY_CLIENT_SECRET
    });
    const res = await fetch(OPENSKY_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.access_token) return null;
    openSkyTokenCache = {
      token: json.access_token,
      expires: Date.now() + (json.expires_in - 60) * 1000
    };
    return json.access_token;
  } catch (e) {
    console.warn('[aircraft] OpenSky token failed:', e.message);
    return null;
  }
}

/**
 * OpenSky 응답을 airplanes.live 스키마로 변환
 * OpenSky state vector: [icao24, callsign, origin_country, time_position, last_contact,
 *   longitude, latitude, baro_altitude_m, on_ground, velocity_ms, true_track,
 *   vertical_rate_ms, sensors, geo_altitude_m, squawk, spi, position_source, category]
 */
function openSkyStateToAircraft(s) {
  if (!Array.isArray(s) || s.length < 11) return null;
  const [icao24, callsign, , , , lon, lat, baroAltM, onGround, velMs, track, vrMs, , geoAltM, squawk] = s;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const altBaroFt = typeof baroAltM === 'number' ? Math.round(baroAltM * M_TO_FT) : null;
  const altGeomFt = typeof geoAltM === 'number' ? Math.round(geoAltM * M_TO_FT) : null;

  return {
    hex: typeof icao24 === 'string' ? icao24.toLowerCase().trim() : '',
    type: 'opensky',
    flight: typeof callsign === 'string' ? callsign : '',
    lat,
    lon,
    alt_baro: onGround ? 'ground' : (altBaroFt ?? altGeomFt ?? 0),
    alt_geom: altGeomFt ?? altBaroFt ?? 0,
    gs: typeof velMs === 'number' ? +(velMs * MS_TO_KT).toFixed(1) : 0,
    track: typeof track === 'number' ? +track.toFixed(2) : 0,
    baro_rate: typeof vrMs === 'number' ? Math.round(vrMs * MS_TO_FTMIN) : 0,
    geom_rate: typeof vrMs === 'number' ? Math.round(vrMs * MS_TO_FTMIN) : 0,
    squawk: typeof squawk === 'string' ? squawk : '',
    on_ground: !!onGround,
    seen: 0,
    seen_pos: 0,
    _src: 'opensky'
  };
}

/**
 * OpenSky `/states/all` 호출 (bbox 기반)
 */
async function fetchOpenSky(lat, lon, radius) {
  const { lamin, lamax, lomin, lomax } = bboxFromRadius(lat, lon, radius);
  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'TBAS/2.1 (+https://tbas.vercel.app)'
  };
  const token = await getOpenSkyToken();
  let authMode = 'none';
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    authMode = 'oauth2';
  } else if (OPENSKY_USERNAME && OPENSKY_PASSWORD) {
    const basic = Buffer.from(`${OPENSKY_USERNAME}:${OPENSKY_PASSWORD}`).toString('base64');
    headers['Authorization'] = `Basic ${basic}`;
    authMode = 'basic';
  }

  const diag = { auth: authMode, status: null, error: null, count: 0, ms: 0 };
  const t0 = Date.now();
  try {
    // Vercel Hobby plan 함수 타임아웃(10s) 안에 fail-fast — OpenSky 미응답해도 airplanes.live는 살림
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(t);
    diag.ms = Date.now() - t0;
    diag.status = res.status;
    if (!res.ok) {
      console.warn('[aircraft] OpenSky status', res.status);
      diag.error = `HTTP ${res.status}`;
      return { ac: [], diag };
    }
    const data = await res.json();
    const states = Array.isArray(data?.states) ? data.states : [];
    const ac = states.map(openSkyStateToAircraft).filter(Boolean);
    diag.count = ac.length;
    return { ac, diag };
  } catch (e) {
    console.warn('[aircraft] OpenSky fetch failed:', e.message);
    diag.error = e.message || 'fetch failed';
    diag.ms = Date.now() - t0;
    return { ac: [], diag };
  }
}

/**
 * 두 데이터 소스를 hex 기준 dedupe 병합 (airplanes.live 우선)
 * + 반경 외부 항공기 제거 (bbox는 정사각형이라 모서리 잡힘)
 */
function mergeAndFilter(primary, secondary, lat, lon, radiusNm) {
  const radiusKm = radiusNm * NM_TO_KM;
  const seen = new Set();
  const out = [];

  for (const ac of primary) {
    if (!ac || typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue;
    const hex = (ac.hex || '').toLowerCase();
    if (hex && seen.has(hex)) continue;
    if (hex) seen.add(hex);
    out.push(ac);
  }

  for (const ac of secondary) {
    if (!ac || typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue;
    const hex = (ac.hex || '').toLowerCase();
    if (hex && seen.has(hex)) continue;
    // 반경 필터 — bbox 모서리 항공기 제외
    if (haversineKm(lat, lon, ac.lat, ac.lon) > radiusKm) continue;
    if (hex) seen.add(hex);
    out.push(ac);
  }

  return out;
}

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;
  if (await checkRateLimit(req, res)) return;

  res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=5');

  const { lat, lon, radius } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon parameters are required', ac: [] });
  }

  const validation = validateCoordinates(lat, lon, radius);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error, ac: [] });
  }
  const { lat: validLat, lon: validLon, radius: r } = validation.values;

  // 두 소스 병렬 호출 — OpenSky 실패해도 airplanes.live만으로 응답
  const [alResult, osResult] = await Promise.all([
    fetchAirplanesLive(validLat, validLon, r),
    fetchOpenSky(validLat, validLon, r)
  ]);
  const osList = osResult.ac || [];

  // airplanes.live 가 429라면 그래도 OpenSky 데이터로 응답
  const merged = mergeAndFilter(alResult.ac || [], osList, validLat, validLon, r);

  if (merged.length === 0 && !alResult.ok) {
    return res.status(alResult.status === 429 ? 429 : 500).json({
      error: alResult.status === 429 ? 'Rate limited by upstream API' : 'Failed to fetch aircraft data',
      ac: []
    });
  }

  return res.status(200).json({
    ac: merged,
    msg: 'No error',
    now: Date.now(),
    total: merged.length,
    sources: {
      primary_adsb: alResult.ac?.length || 0,
      primary_source: alResult.source || null,
      opensky: osList.length,
      merged: merged.length,
      opensky_diag: osResult.diag
    }
  });
}