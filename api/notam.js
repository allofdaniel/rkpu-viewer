import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';
import staticNotamData from './_data/notams.json' with { type: 'json' };

// ============================================================
// Supabase 설정
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ugzsuswrazaimvpyloqw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_PUBLIC = `${SUPABASE_URL}/storage/v1/object/public/notam-data`;

// ============================================================
// 유틸리티 함수
// ============================================================

function parseNotamCoordinates(fullText) {
  if (!fullText) return null;
  const qLineMatch = fullText.match(/Q\)\s*\S+\/\S+\/\S+\/\S+\/\S+\/\d{3}\/\d{3}\/(\d{4})([NS])(\d{5})([EW])\d{3}/);
  if (!qLineMatch) return null;

  const [, latDeg, latDir, lonDeg, lonDir] = qLineMatch;
  const latDegrees = parseInt(latDeg.substring(0, 2), 10);
  const latMinutes = parseInt(latDeg.substring(2, 4), 10);
  let lat = latDegrees + latMinutes / 60;
  if (latDir === 'S') lat = -lat;

  const lonDegrees = parseInt(lonDeg.substring(0, 3), 10);
  const lonMinutes = parseInt(lonDeg.substring(3, 5), 10);
  let lon = lonDegrees + lonMinutes / 60;
  if (lonDir === 'W') lon = -lon;

  return { lat, lon };
}

function isInBounds(lat, lon, bounds, margin = 1) {
  if (!bounds || !lat || !lon) return true;
  return (
    lat >= bounds.south - margin &&
    lat <= bounds.north + margin &&
    lon >= bounds.west - margin &&
    lon <= bounds.east + margin
  );
}

function parseNotamDate(dateStr) {
  if (!dateStr || dateStr.length < 6) return null;
  const year = 2000 + parseInt(dateStr.substring(0, 2), 10);
  const month = parseInt(dateStr.substring(2, 4), 10) - 1;
  const day = parseInt(dateStr.substring(4, 6), 10);
  const hour = dateStr.length >= 8 ? parseInt(dateStr.substring(6, 8), 10) : 0;
  const minute = dateStr.length >= 10 ? parseInt(dateStr.substring(8, 10), 10) : 0;
  return new Date(year, month, day, hour, minute);
}

function extractNotamDates(fullText) {
  if (!fullText) return { start: null, end: null };
  const startMatch = fullText.match(/B\)\s*(\d{10})/);
  const start = startMatch ? parseNotamDate(startMatch[1]) : null;
  const endMatch = fullText.match(/C\)\s*(\d{10}|PERM)/);
  let end = null;
  if (endMatch) {
    end = endMatch[1] === 'PERM' ? new Date(2099, 11, 31) : parseNotamDate(endMatch[1]);
  }
  return { start, end };
}

function isValidInPeriod(notam, period) {
  if (!period || period === 'all') return true;
  const now = new Date();
  const { start, end } = extractNotamDates(notam.full_text);

  if (period === 'current') {
    if (start && start > now) return false;
    if (end && end < now) return false;
    return true;
  }

  let periodStart, periodEnd;
  if (period === '1month') {
    periodStart = new Date(now.getTime() - 30 * 86400000);
    periodEnd = new Date(now.getTime() + 30 * 86400000);
  } else if (period === '1year') {
    periodStart = new Date(now.getTime() - 365 * 86400000);
    periodEnd = new Date(now.getTime() + 365 * 86400000);
  } else {
    return true;
  }

  if (start && start > periodEnd) return false;
  if (end && end < periodStart) return false;
  return true;
}

// ============================================================
// 방식 1: Supabase PostgREST DB 쿼리
// ============================================================

async function fetchFromDatabase(params) {
  const { limit, period, bounds } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('select', 'notam_number,location,full_text,e_text,qcode,qcode_mean,effective_start,effective_end,series,fir,q_lat,q_lon,q_radius_nm,crawled_at');
  queryParams.set('order', 'crawled_at.desc,notam_number.desc');
  queryParams.set('limit', String(limit > 0 ? limit : 2000));

  // 영역 필터 (좌표 있는 것 + 없는 것 모두 포함)
  if (bounds) {
    queryParams.set(
      'or',
      `(and(q_lat.gte.${bounds.south - 1},q_lat.lte.${bounds.north + 1},q_lon.gte.${bounds.west - 1},q_lon.lte.${bounds.east + 1}),q_lat.is.null)`
    );
  }

  const url = `${SUPABASE_URL}/rest/v1/notams?${queryParams.toString()}`;
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Accept': 'application/json',
      'Prefer': 'count=exact'
    }
  });

  if (!response.ok) {
    throw new Error(`PostgREST error: ${response.status} ${response.statusText}`);
  }

  const contentRange = response.headers.get('content-range');
  const totalCount = contentRange ? parseInt(contentRange.split('/')[1], 10) : 0;

  let notamData = await response.json();

  // DB 레코드 → 프론트엔드 포맷
  notamData = notamData.map(row => ({
    notam_number: row.notam_number,
    location: row.location,
    full_text: row.full_text,
    e_text: row.e_text,
    qcode: row.qcode,
    qcode_mean: row.qcode_mean,
    effective_start: row.effective_start,
    effective_end: row.effective_end,
    series: row.series,
    fir: row.fir,
    q_lat: row.q_lat,
    q_lon: row.q_lon,
    q_radius: row.q_radius_nm,
  }));

  // 기간 필터
  const beforePeriod = notamData.length;
  if (period && period !== 'all') {
    notamData = notamData.filter(n => isValidInPeriod(n, period));
  }

  return {
    data: notamData,
    count: totalCount || beforePeriod,
    afterPeriodFilter: notamData.length,
    source: 'database',
  };
}

// ============================================================
// 방식 2: Supabase Storage 폴백 (기존 방식)
// ============================================================

function transformAimNotam(item) {
  return {
    notam_number: item.NOTAM_NO || '',
    location: item.LOCATION || '',
    full_text: item.FULL_TEXT || '',
    e_text: item.ECODE || '',
    qcode: item.QCODE || '',
    qcode_mean: item.QCODE_MEAN || '',
    effective_start: item.EFFECTIVESTART || '',
    effective_end: item.EFFECTIVEEND || '',
    series: item.SERIES || '',
    fir: item.FIR || '',
  };
}

function flattenAimData(aimData) {
  const items = [];
  if (aimData.domestic) {
    for (const seriesItems of Object.values(aimData.domestic)) {
      if (Array.isArray(seriesItems)) {
        for (const item of seriesItems) items.push(transformAimNotam(item));
      }
    }
  }
  if (aimData.international) {
    for (const airportItems of Object.values(aimData.international)) {
      if (Array.isArray(airportItems)) {
        for (const item of airportItems) items.push(transformAimNotam(item));
      }
    }
  }
  if (Array.isArray(aimData.snowtam)) {
    for (const item of aimData.snowtam) items.push(transformAimNotam(item));
  }
  return items;
}

async function fetchFromStorage(params, req) {
  const { limit, period, bounds } = params;

  const today = new Date().toISOString().split('T')[0];
  let latestPath = `notam_realtime/${today}/notam_latest.json`;
  let fileUrl = `${SUPABASE_PUBLIC}/${latestPath}`;
  let response = await fetch(fileUrl);
  let usedStaticFallback = false;

  if (!response.ok) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    latestPath = `notam_realtime/${yesterday}/notam_latest.json`;
    fileUrl = `${SUPABASE_PUBLIC}/${latestPath}`;
    response = await fetch(fileUrl);
  }

  // Static fallback: use pre-imported JSON if Supabase storage fails
  let rawData;
  if (!response.ok) {
    // Use statically imported JSON data
    rawData = staticNotamData;
    usedStaticFallback = true;
    latestPath = 'static-import';
  } else {
    try {
      rawData = await response.json();
    } catch (parseError) {
      console.warn('Storage JSON parse failed:', parseError.message);
      rawData = null;
    }
  }

  // Also fallback if parsed data is empty or invalid
  const isEmptyData = !rawData ||
    (Array.isArray(rawData) && rawData.length === 0) ||
    (typeof rawData === 'object' && !Array.isArray(rawData) &&
     !rawData.domestic && !rawData.international && !rawData.snowtam);

  if (!usedStaticFallback && isEmptyData) {
    console.log('Storage returned empty data, using static fallback');
    rawData = staticNotamData;
    usedStaticFallback = true;
    latestPath = 'static-import';
  }

  let notamData;

  // Handle different data formats
  if (Array.isArray(rawData)) {
    // Static fallback format (direct array from /data/notams.json)
    notamData = rawData.map(item => ({
      notam_number: item.notam_id || item.notam_number || '',
      location: item.location || item.icao || '',
      full_text: item.full_text || '',
      e_text: item.message || item.e_text || '',
      qcode: item.qcode || item.type || '',
      qcode_mean: item.qcode_desc || item.qcode_mean || '',
      effective_start: item.effectiveStart || item.effective_start || '',
      effective_end: item.effectiveEnd || item.effective_end || '',
      series: item.series || '',
      fir: item.fir || '',
      q_lat: item.latitude || item.q_lat,
      q_lon: item.longitude || item.q_lon,
      q_radius: item.radius || item.q_radius,
    }));
  } else {
    // AIM format (object with domestic/international structure)
    notamData = flattenAimData(rawData);
  }
  const totalCount = notamData.length;

  if (period && period !== 'all') {
    notamData = notamData.filter(n => isValidInPeriod(n, period));
  }
  const afterPeriodCount = notamData.length;

  if (bounds) {
    notamData = notamData.filter(notam => {
      const coords = parseNotamCoordinates(notam.full_text);
      if (!coords) return false;
      return isInBounds(coords.lat, coords.lon, bounds);
    });
  }

  return {
    data: notamData,
    count: totalCount,
    afterPeriodFilter: afterPeriodCount,
    source: usedStaticFallback ? 'static-fallback' : 'storage',
    file: latestPath,
    crawled_at: Array.isArray(rawData) ? null : (rawData.crawled_at || null),
  };
}

// ============================================================
// API Handler
// ============================================================

export default async function handler(req, res) {
  // DO-278A SRS-SEC-002: CORS
  if (setCorsHeaders(req, res)) return;
  // DO-278A SRS-SEC-003: Rate Limiting
  if (await checkRateLimit(req, res)) return;

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit')) || 0;
    const period = url.searchParams.get('period') || 'all';

    const boundsParam = url.searchParams.get('bounds');
    let bounds = null;
    if (boundsParam) {
      const [south, west, north, east] = boundsParam.split(',').map(Number);
      if (!isNaN(south) && !isNaN(west) && !isNaN(north) && !isNaN(east)) {
        bounds = { south, west, north, east };
      }
    }

    const params = { limit, period, bounds };
    let result;

    // DB 우선 → Storage 폴백 → Static 폴백
    if (SUPABASE_SERVICE_KEY) {
      try {
        result = await fetchFromDatabase(params);
        // DB에 데이터가 없으면 Storage 폴백
        if (result.data.length === 0) {
          result = await fetchFromStorage(params, req);
        }
      } catch (dbError) {
        console.warn('DB query failed, falling back to Storage:', dbError.message);
        result = await fetchFromStorage(params, req);
      }
    } else {
      result = await fetchFromStorage(params, req);
    }

    let { data: notamData, ...meta } = result;

    const filteredCount = notamData.length;
    if (limit > 0 && notamData.length > limit) {
      notamData = notamData.slice(0, limit);
    }

    // Content-Type 명시적 설정 (브라우저 호환성)
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      data: notamData,
      ...meta,
      filtered: filteredCount,
      returned: notamData.length,
      period,
      bounds,
    });
  } catch (error) {
    console.error('NOTAM fetch error:', error.message);
    res.status(500).json({
      error: 'NOTAM service temporarily unavailable',
      code: 'NOTAM_ERROR',
      ...(process.env.NODE_ENV === 'development' && { details: error.message }),
    });
  }
}
