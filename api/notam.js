import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

// Static fallback URL (deployed app's public data)
const STATIC_FALLBACK_URL = 'https://tbas.vercel.app/data/notams.json';

// ============================================================
// Supabase 설정
// ============================================================
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_PUBLIC = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/notam-data` : '';
const HAS_SUPABASE_BACKEND = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

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
  if (bounds == null) return true;
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return true;
  return (
    lat >= bounds.south - margin &&
    lat <= bounds.north + margin &&
    lon >= bounds.west - margin &&
    lon <= bounds.east + margin
  );
}

// YYMMDDHHMM, ISO 8601, 'PERM' 모두 처리. 빈 값/파싱불가 → null.
function parseNotamDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper === 'PERM' || upper === 'PERMANENT') return new Date(Date.UTC(2099, 11, 31));
  // YYMMDDHHMM
  if (/^\d{10}$/.test(s)) {
    const year = 2000 + parseInt(s.substring(0, 2), 10);
    const month = parseInt(s.substring(2, 4), 10) - 1;
    const day = parseInt(s.substring(4, 6), 10);
    const hour = parseInt(s.substring(6, 8), 10);
    const minute = parseInt(s.substring(8, 10), 10);
    return new Date(Date.UTC(year, month, day, hour, minute));
  }
  // YYMMDDHH (8자리), YYMMDD (6자리)
  if (/^\d{6,8}$/.test(s)) {
    const year = 2000 + parseInt(s.substring(0, 2), 10);
    const month = parseInt(s.substring(2, 4), 10) - 1;
    const day = parseInt(s.substring(4, 6), 10);
    const hour = s.length >= 8 ? parseInt(s.substring(6, 8), 10) : 0;
    return new Date(Date.UTC(year, month, day, hour, 0));
  }
  // ISO 8601 (e.g. 2026-01-19T08:26:00Z)
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

// effective_start/effective_end 컬럼 우선, full_text의 B)/C) 라인 fallback.
function extractNotamDates(notam) {
  let start = parseNotamDate(notam?.effective_start);
  let end = parseNotamDate(notam?.effective_end);
  const fullText = notam?.full_text;
  if ((!start || !end) && fullText) {
    if (!start) {
      const m = fullText.match(/B\)\s*(\d{10})/);
      if (m) start = parseNotamDate(m[1]);
    }
    if (!end) {
      const m = fullText.match(/C\)\s*(\d{10}|PERM)/);
      if (m) end = parseNotamDate(m[1]);
    }
  }
  return { start, end };
}

function isValidInPeriod(notam, period) {
  if (!period || period === 'all') return true;
  const now = new Date();
  const { start, end } = extractNotamDates(notam);

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
  // 통합 크롤러가 추가하는 신규 컬럼(notam_type, ref_notam, traffic, purpose, scope,
  // data_source, q_lower_alt, q_upper_alt)도 함께 select. 없는 컬럼은 PostgREST가 무시.
  queryParams.set(
    'select',
    'notam_number,location,full_text,e_text,qcode,qcode_mean,effective_start,effective_end,'
    + 'series,fir,q_lat,q_lon,q_radius_nm,q_lower_alt,q_upper_alt,'
    + 'notam_type,ref_notam,traffic,purpose,scope,data_source,crawled_at',
  );
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
    q_lower_alt: row.q_lower_alt,
    q_upper_alt: row.q_upper_alt,
    notam_type: row.notam_type,
    ref_notam: row.ref_notam,
    traffic: row.traffic,
    purpose: row.purpose,
    scope: row.scope,
    data_source: row.data_source,
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

async function fetchStaticFallback() {
  try {
    const fallbackResponse = await fetch(STATIC_FALLBACK_URL);
    if (!fallbackResponse.ok) {
      console.warn('Static fallback failed:', fallbackResponse.status);
      return null;
    }

    const data = await fallbackResponse.json();
    const list = Array.isArray(data) ? data : [];

    if (!Array.isArray(list)) {
      return null;
    }

    return list.map((item) => ({
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
      crawled_at: null,
    }));
  } catch (error) {
    console.warn('Static fallback error:', error.message);
    return null;
  }
}

async function fetchFromStorage(params) {
  const { period, bounds } = params;

  if (!SUPABASE_PUBLIC) {
    console.warn('Supabase storage URL is not configured, using static fallback');
    const staticFallback = await fetchStaticFallback();
    if (staticFallback) {
      return {
        data: staticFallback,
        count: staticFallback.length,
        afterPeriodFilter: staticFallback.length,
        source: 'static-fallback',
        file: 'http-fallback',
        crawled_at: null,
      };
    }
    return {
      data: [],
      count: 0,
      afterPeriodFilter: 0,
      source: 'static-fallback',
      file: 'http-fallback',
      crawled_at: null,
    };
  }

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

  // Helper to check if data is empty/invalid
  const isEmptyData = (data) => !data ||
    (Array.isArray(data) && data.length === 0) ||
    (typeof data === 'object' && !Array.isArray(data) &&
     !data.domestic && !data.international && !data.snowtam);

  // Try to get data from Supabase storage response
  let rawData = null;
  if (response.ok) {
    try {
      rawData = await response.json();
    } catch (parseError) {
      console.warn('Storage JSON parse failed:', parseError.message);
    }
  }

  // If storage failed or returned empty, use HTTP fallback
  if (isEmptyData(rawData)) {
    console.info('Storage unavailable or empty, fetching from static fallback URL');
    const fallbackItems = await fetchStaticFallback();
    if (fallbackItems) {
      rawData = fallbackItems;
      usedStaticFallback = true;
      latestPath = 'http-fallback';
      console.info(`HTTP fallback loaded ${fallbackItems.length} items`);
    }
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
  } else if (rawData && typeof rawData === 'object') {
    // AIM format (object with domestic/international structure)
    notamData = flattenAimData(rawData);
  } else {
    notamData = [];
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
    if (HAS_SUPABASE_BACKEND) {
      try {
        result = await fetchFromDatabase(params);
        // DB에 데이터가 없으면 Storage 폴백
        if (result.data.length === 0) {
          result = await fetchFromStorage(params);
        }
      } catch (dbError) {
        console.warn('DB query failed, falling back to Storage:', dbError.message);
        result = await fetchFromStorage(params);
      }
    } else {
      result = await fetchFromStorage(params);
    }

    let { data: notamData, ...meta } = result;

    const filteredCount = notamData.length;
    if (limit > 0 && notamData.length > limit) {
      notamData = notamData.slice(0, limit);
    }

    // 응답에 출처 분포 포함 (운영 가시성)
    const bySource = {};
    for (const n of notamData) {
      const k = n.data_source || 'UNKNOWN';
      bySource[k] = (bySource[k] || 0) + 1;
    }
    meta.by_source = bySource;

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
