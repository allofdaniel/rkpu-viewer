// Vercel Serverless Function - Aviation Weather Data for Korea
// KMA API Hub (apihub.kma.go.kr) + International Sources
// DO-278A 요구사항 추적: SRS-SEC-001

import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

/**
 * 환경변수에서 KMA API 키 로드
 * Vercel 환경변수 또는 .env 파일에서 KMA_API_KEY 설정 필요
 */
const KMA_API_KEY = process.env.KMA_API_KEY;
const ULSAN_STN = '151'; // 울산공항 지점번호

// API 키 검증
if (!KMA_API_KEY) {
  console.error(
    '[TBAS Weather API] KMA_API_KEY 환경변수가 설정되지 않았습니다.\n' +
    'Vercel Dashboard > Settings > Environment Variables에서 설정하거나\n' +
    '.env 파일에 KMA_API_KEY=your_key_here 형태로 추가하세요.'
  );
}

// Ulsan Airport coordinates for Open-Meteo
const ULSAN_LAT = 35.5934;
const ULSAN_LON = 129.3517;

export default async function handler(req, res) {
  // DO-278A SRS-SEC-002: Use secure CORS headers
  if (setCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  // DO-278A SRS-SEC-003: Rate Limiting
  if (checkRateLimit(req, res)) {
    return; // Rate limit exceeded
  }

  const type = req.query.type || 'metar';

  // KMA API 키가 반드시 필요한 엔드포인트 (aviationweather.gov 대체 불가)
  const kmaRequiredTypes = [
    'kma_metar', 'kma_taf', 'kma_sigmet', 'kma_airmet',
    'warning', 'llws', 'sigwx', 'radar', 'satellite', 'lightning'
  ];

  // KMA API 키 검증 (필요한 경우) - metar/amos/taf는 aviationweather.gov 사용 가능
  if (kmaRequiredTypes.includes(type) && !KMA_API_KEY) {
    console.error('[TBAS Weather API] KMA_API_KEY not configured for:', type);
    return res.status(503).json({
      error: 'Weather service temporarily unavailable',
      code: 'KMA_API_KEY_MISSING',
      message: 'KMA API key is not configured. Contact administrator.'
    });
  }

  try {
    switch (type) {
      case 'metar':
      case 'amos':
        return await handleAmos(req, res);
      case 'kma_metar':
        return await handleKmaMetar(req, res);
      case 'taf':
        return await handleTaf(req, res);
      case 'kma_taf':
        return await handleKmaTaf(req, res);
      case 'sigmet':
        return await handleSigmet(req, res);
      case 'kma_sigmet':
        return await handleKmaSigmet(req, res);
      case 'airmet':
        return await handleAirmet(req, res);
      case 'kma_airmet':
        return await handleKmaAirmet(req, res);
      case 'notam':
        return await handleNotam(req, res);
      case 'warning':
        return await handleWarning(req, res);
      case 'llws':
        return await handleLlws(req, res);
      case 'sigwx':
        return await handleSigwx(req, res);
      case 'upperwind':
        return await handleUpperWind(req, res);
      case 'radar':
        return await handleRadar(req, res);
      case 'satellite':
        return await handleSatellite(req, res);
      case 'lightning':
        return await handleLightning(req, res);
      default:
        return res.status(400).json({ error: 'Invalid type' });
    }
  } catch (error) {
    console.error('Weather API error:', error.message);
    // DO-278A SRS-SEC-006: 프로덕션에서 에러 상세 숨김
    return res.status(500).json({
      error: 'Weather service temporarily unavailable',
      code: 'WEATHER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

// AMOS - 공항기상관측 (aviationweather.gov 우선, KMA 폴백)
async function handleAmos(req, res) {
  let metar = null;

  // 1. aviationweather.gov 먼저 시도 (API 키 불필요)
  // RKPU(울산)는 데이터가 없으므로 RKPK(김해)도 함께 요청
  try {
    const metarUrl = `https://aviationweather.gov/api/data/metar?ids=RKPU,RKPK&format=json`;
    const response = await fetch(metarUrl);
    if (response.ok) {
      const metarJson = await response.json();
      if (metarJson && metarJson.length > 0) {
        // RKPU(울산) 우선, 없으면 RKPK(김해) 사용
        const raw = metarJson.find(m => m.icaoId === 'RKPU') || metarJson[0];
        metar = {
          icaoId: raw.icaoId || 'RKPU',
          obsTime: raw.reportTime || raw.obsTime,
          temp: raw.temp,
          dewp: raw.dewp,
          humidity: raw.humidity,
          altim: raw.altim,
          wdir: raw.wdir,
          wspd: raw.wspd,
          wspdMs: raw.wspd ? (raw.wspd * 0.514444).toFixed(1) : null,
          wgst: raw.wgst,
          visib: raw.visib,
          visibM: raw.visib ? Math.round(raw.visib * 1609.34) : null,
          ceiling: raw.clouds?.[0]?.base || null,
          fltCat: raw.fltCat || 'VFR',
          rawOb: raw.rawOb,
          source: 'aviationweather.gov'
        };
        console.log('[Weather API] METAR from aviationweather.gov');
      }
    }
  } catch (e) {
    console.warn('[Weather API] aviationweather.gov failed:', e.message);
  }

  // 2. KMA AMOS 폴백 (API 키가 있는 경우)
  if (!metar && KMA_API_KEY) {
    try {
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000 - 5 * 60 * 1000);
      const tm = kstNow.toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);

      const amosUrl = `https://apihub.kma.go.kr/api/typ01/url/amos.php?tm=${tm}&stn=${ULSAN_STN}&authKey=${KMA_API_KEY}`;
      const amosRes = await fetch(amosUrl);
      const amosText = await amosRes.text();
      metar = parseKmaAmos(amosText);

      if (!metar) {
        const utcTm = now.toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
        const metarDecUrl = `https://apihub.kma.go.kr/api/typ01/url/air_metar_dec.php?tm=${utcTm}&org=K&authKey=${KMA_API_KEY}`;
        const metarRes = await fetch(metarDecUrl);
        const metarText = await metarRes.text();
        metar = parseKmaMetarDec(metarText, ULSAN_STN);
      }
    } catch (e) {
      console.warn('[Weather API] KMA AMOS failed:', e.message);
    }
  }

  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  return res.status(200).json(metar ? [metar] : []);
}

// TAF - 공항예보 (aviationweather.gov fallback)
async function handleTaf(req, res) {
  const tafUrl = `https://aviationweather.gov/api/data/taf?ids=RKPK,RKPU&format=json`;
  const response = await fetch(tafUrl);
  const tafJson = response.ok ? await response.json() : [];

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  return res.status(200).json(tafJson || []);
}

// KMA METAR - 항공기상전문 조회 (공식 KMA API)
async function handleKmaMetar(req, res) {
  const icao = req.query.icao || 'RKPU';
  const metarUrl = `https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getMetar?pageNo=1&numOfRows=10&dataType=JSON&icao=${icao}&authKey=${KMA_API_KEY}`;

  console.log('Fetching KMA METAR:', metarUrl);
  const response = await fetch(metarUrl);
  const data = response.ok ? await response.json() : null;

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  return res.status(200).json(data);
}

// KMA TAF - 공항예보 조회 (공식 KMA API)
async function handleKmaTaf(req, res) {
  const icao = req.query.icao || 'RKPU';
  const tafUrl = `https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getTaf?pageNo=1&numOfRows=10&dataType=JSON&icao=${icao}&authKey=${KMA_API_KEY}`;

  console.log('Fetching KMA TAF:', tafUrl);
  const response = await fetch(tafUrl);
  const data = response.ok ? await response.json() : null;

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  return res.status(200).json(data);
}

// KMA SIGMET - 한국 FIR SIGMET (공식 KMA API)
async function handleKmaSigmet(req, res) {
  const sigmetUrl = `https://apihub.kma.go.kr/api/typ02/openApi/AmmService/getSigmet?pageNo=1&numOfRows=50&dataType=JSON&authKey=${KMA_API_KEY}`;

  console.log('Fetching KMA SIGMET:', sigmetUrl);
  const response = await fetch(sigmetUrl);
  const data = response.ok ? await response.json() : null;

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  return res.status(200).json(data);
}

// KMA AIRMET - 한국 FIR AIRMET (공식 KMA API)
async function handleKmaAirmet(req, res) {
  const airmetUrl = `https://apihub.kma.go.kr/api/typ02/openApi/AmmService/getAirmet?pageNo=1&numOfRows=50&dataType=JSON&authKey=${KMA_API_KEY}`;

  console.log('Fetching KMA AIRMET:', airmetUrl);
  const response = await fetch(airmetUrl);
  const data = response.ok ? await response.json() : null;

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  return res.status(200).json(data);
}

// 공항경보 조회 (공식 KMA API)
async function handleWarning(req, res) {
  const warningUrl = `https://apihub.kma.go.kr/api/typ02/openApi/AmmService/getWarning?pageNo=1&numOfRows=50&dataType=JSON&authKey=${KMA_API_KEY}`;

  console.log('Fetching Airport Warning:', warningUrl);
  const response = await fetch(warningUrl);
  const data = response.ok ? await response.json() : null;

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  return res.status(200).json(data);
}

// SIGMET - 중요기상정보 (난류, 착빙, 화산재 등)
async function handleSigmet(req, res) {
  // KMA SIGMET
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const tm = kstNow.toISOString().slice(0, 10).replace(/-/g, '');

  const sigmetUrl = `https://apihub.kma.go.kr/api/typ01/url/fct_air_sigmet.php?tm=${tm}&authKey=${KMA_API_KEY}`;
  console.log('Fetching SIGMET:', sigmetUrl);

  const kmaRes = await fetch(sigmetUrl);
  const kmaText = await kmaRes.text();
  const kmaSigmets = parseSigmet(kmaText);

  // Also get international SIGMET from aviationweather.gov
  const intlUrl = `https://aviationweather.gov/api/data/isigmet?format=json&loc=rkrr`;
  const intlRes = await fetch(intlUrl);
  const intlSigmets = intlRes.ok ? await intlRes.json() : [];

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  return res.status(200).json({ kma: kmaSigmets, international: intlSigmets });
}

// AIRMET - 저고도 기상정보
async function handleAirmet(req, res) {
  const airmetUrl = `https://aviationweather.gov/api/data/airmet?format=json`;
  const response = await fetch(airmetUrl);
  const data = response.ok ? await response.json() : [];

  // Filter for Korea region (approximate bounds)
  const koreaAirmets = data.filter(a => {
    if (!a.coords) return false;
    // Check if any coordinate is within Korea bounds
    return a.coords.some(c => c.lat >= 33 && c.lat <= 43 && c.lon >= 124 && c.lon <= 132);
  });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  return res.status(200).json(koreaAirmets);
}

// NOTAM - 항공고시보
async function handleNotam(req, res) {
  // KMA doesn't provide NOTAM via API, use FAA NOTAM API
  const notamUrl = `https://api.aviationapi.com/v1/notams?apt=RKPU,RKPK`;

  try {
    const response = await fetch(notamUrl);
    const data = response.ok ? await response.json() : {};

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (e) {
    // Fallback: return empty - NOTAM APIs often require authentication
    return res.status(200).json({ RKPU: [], RKPK: [], note: 'NOTAM service limited' });
  }
}

// LLWS - 저층윈드시어
async function handleLlws(req, res) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const tm = kstNow.toISOString().slice(0, 13).replace(/[-T:]/g, '');

  const llwsUrl = `https://apihub.kma.go.kr/api/typ01/url/llws_sfc.php?tm=${tm}&stn=151&authKey=${KMA_API_KEY}`;
  console.log('Fetching LLWS:', llwsUrl);

  const response = await fetch(llwsUrl);
  const text = await response.text();
  const llwsData = parseLlws(text);

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  return res.status(200).json(llwsData);
}

// SIGWX - 중요기상도 (이미지 URL 반환)
async function handleSigwx(req, res) {
  const now = new Date();
  const utcHour = now.getUTCHours();
  // SIGWX charts are issued at 00, 06, 12, 18 UTC
  const validHour = Math.floor(utcHour / 6) * 6;
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');

  // KMA significant weather chart URLs
  const charts = {
    low: `https://apihub.kma.go.kr/api/typ01/cgi/wrn/nph-aws_img?tm=${dateStr}${String(validHour).padStart(2, '0')}&obs=sigwx_low&authKey=${KMA_API_KEY}`,
    mid: `https://apihub.kma.go.kr/api/typ01/cgi/wrn/nph-aws_img?tm=${dateStr}${String(validHour).padStart(2, '0')}&obs=sigwx_mid&authKey=${KMA_API_KEY}`,
    high: `https://apihub.kma.go.kr/api/typ01/cgi/wrn/nph-aws_img?tm=${dateStr}${String(validHour).padStart(2, '0')}&obs=sigwx_high&authKey=${KMA_API_KEY}`,
    // Alternative: aviationweather.gov
    intl: `https://aviationweather.gov/data/iffdp/2050.gif`
  };

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
  return res.status(200).json(charts);
}

// Upper Wind - 상층풍 (Open-Meteo API - 지역별 그리드 + 고도별 풍향/풍속/온도)
async function handleUpperWind(req, res) {
  // Grid points around Ulsan (approximately 0.5 degree spacing)
  // Covers about 100km x 100km area around the airport
  const gridPoints = [
    { lat: 35.0, lon: 128.8, name: 'SW' },
    { lat: 35.0, lon: 129.4, name: 'S' },
    { lat: 35.0, lon: 130.0, name: 'SE' },
    { lat: 35.6, lon: 128.8, name: 'W' },
    { lat: 35.6, lon: 129.4, name: 'C' },  // Center (near RKPU)
    { lat: 35.6, lon: 130.0, name: 'E' },
    { lat: 36.2, lon: 128.8, name: 'NW' },
    { lat: 36.2, lon: 129.4, name: 'N' },
    { lat: 36.2, lon: 130.0, name: 'NE' },
  ];

  // Build latitude and longitude strings for Open-Meteo
  const lats = gridPoints.map(p => p.lat).join(',');
  const lons = gridPoints.map(p => p.lon).join(',');

  const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=windspeed_850hPa,windspeed_700hPa,windspeed_500hPa,windspeed_300hPa,winddirection_850hPa,winddirection_700hPa,winddirection_500hPa,winddirection_300hPa,geopotential_height_850hPa,geopotential_height_700hPa,geopotential_height_500hPa,geopotential_height_300hPa&timezone=Asia/Seoul&forecast_days=1`;

  console.log('Fetching Open-Meteo Upper Wind Grid');
  const response = await fetch(openMeteoUrl);

  if (!response.ok) {
    return res.status(500).json({ error: 'Failed to fetch upper wind data' });
  }

  const rawData = await response.json();

  // Find current hour index
  const now = new Date();
  const currentHour = now.getHours();

  // Handle both single point and multi-point responses
  const dataArray = Array.isArray(rawData) ? rawData : [rawData];

  const hourIndex = dataArray[0].hourly.time.findIndex(t => {
    const h = new Date(t).getHours();
    return h >= currentHour;
  }) || 0;

  // Process each grid point
  const gridData = dataArray.map((data, idx) => {
    const point = gridPoints[idx] || gridPoints[0];
    return {
      lat: point.lat,
      lon: point.lon,
      name: point.name,
      levels: {
        'FL050': {
          altitude_m: Math.round(data.hourly.geopotential_height_850hPa?.[hourIndex] || 1500),
          wind_dir: Math.round(data.hourly.winddirection_850hPa?.[hourIndex] || 0),
          wind_spd_kt: Math.round((data.hourly.windspeed_850hPa?.[hourIndex] || 0) * 0.539957)
        },
        'FL100': {
          altitude_m: Math.round(data.hourly.geopotential_height_700hPa?.[hourIndex] || 3000),
          wind_dir: Math.round(data.hourly.winddirection_700hPa?.[hourIndex] || 0),
          wind_spd_kt: Math.round((data.hourly.windspeed_700hPa?.[hourIndex] || 0) * 0.539957)
        },
        'FL180': {
          altitude_m: Math.round(data.hourly.geopotential_height_500hPa?.[hourIndex] || 5500),
          wind_dir: Math.round(data.hourly.winddirection_500hPa?.[hourIndex] || 0),
          wind_spd_kt: Math.round((data.hourly.windspeed_500hPa?.[hourIndex] || 0) * 0.539957)
        },
        'FL300': {
          altitude_m: Math.round(data.hourly.geopotential_height_300hPa?.[hourIndex] || 9000),
          wind_dir: Math.round(data.hourly.winddirection_300hPa?.[hourIndex] || 0),
          wind_spd_kt: Math.round((data.hourly.windspeed_300hPa?.[hourIndex] || 0) * 0.539957)
        }
      }
    };
  });

  // Also provide center point data for compatibility
  const centerData = gridData.find(g => g.name === 'C') || gridData[0];

  const upperWindData = {
    time: dataArray[0].hourly.time[hourIndex],
    grid: gridData,
    levels: centerData.levels,
    source: 'Open-Meteo'
  };

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
  return res.status(200).json(upperWindData);
}

// Radar - 기상레이더
async function handleRadar(req, res) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // Round to nearest 10 minutes
  const mins = Math.floor(kstNow.getMinutes() / 10) * 10;
  const tm = kstNow.toISOString().slice(0, 10).replace(/-/g, '') +
             String(kstNow.getHours()).padStart(2, '0') +
             String(mins).padStart(2, '0');

  // KMA radar image - composite reflectivity
  const radarUrl = `https://apihub.kma.go.kr/api/typ02/openApi/RadarImgService/getRadarImg?tm=${tm}&size=1000&authKey=${KMA_API_KEY}`;

  // Multiple radar products
  const radarData = {
    composite: radarUrl,
    // Echo top
    echoTop: `https://apihub.kma.go.kr/api/typ02/openApi/RadarImgService/getRadarImg?tm=${tm}&size=1000&obs=echo_top&authKey=${KMA_API_KEY}`,
    // VIL (Vertically Integrated Liquid)
    vil: `https://apihub.kma.go.kr/api/typ02/openApi/RadarImgService/getRadarImg?tm=${tm}&size=1000&obs=vil&authKey=${KMA_API_KEY}`,
    // Timestamp
    time: tm,
    // GeoJSON bounds for overlay (Korea)
    bounds: [[124.5, 33.0], [132.0, 43.0]]
  };

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  return res.status(200).json(radarData);
}

// Satellite - 기상위성
async function handleSatellite(req, res) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const mins = Math.floor(kstNow.getMinutes() / 10) * 10;
  const tm = kstNow.toISOString().slice(0, 10).replace(/-/g, '') +
             String(kstNow.getHours()).padStart(2, '0') +
             String(mins).padStart(2, '0');

  const satelliteData = {
    // Visible
    vis: `https://apihub.kma.go.kr/api/typ02/openApi/SatImgService/getSatImg?tm=${tm}&obs=vis&size=1000&authKey=${KMA_API_KEY}`,
    // Infrared
    ir: `https://apihub.kma.go.kr/api/typ02/openApi/SatImgService/getSatImg?tm=${tm}&obs=ir&size=1000&authKey=${KMA_API_KEY}`,
    // Water vapor
    wv: `https://apihub.kma.go.kr/api/typ02/openApi/SatImgService/getSatImg?tm=${tm}&obs=wv&size=1000&authKey=${KMA_API_KEY}`,
    // Enhanced IR (for cloud top temp)
    enhir: `https://apihub.kma.go.kr/api/typ02/openApi/SatImgService/getSatImg?tm=${tm}&obs=enhir&size=1000&authKey=${KMA_API_KEY}`,
    time: tm,
    bounds: [[110, 20], [150, 50]]
  };

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  return res.status(200).json(satelliteData);
}

// Lightning - 낙뢰
async function handleLightning(req, res) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // Get last hour of lightning data
  const tmEnd = kstNow.toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
  const kstStart = new Date(kstNow.getTime() - 60 * 60 * 1000);
  const tmStart = kstStart.toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);

  const lightningUrl = `https://apihub.kma.go.kr/api/typ01/url/lgt_data.php?tm1=${tmStart}&tm2=${tmEnd}&authKey=${KMA_API_KEY}`;
  console.log('Fetching Lightning:', lightningUrl);

  const response = await fetch(lightningUrl);
  const text = await response.text();
  const strikes = parseLightning(text);

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
  return res.status(200).json({ strikes, timeRange: { start: tmStart, end: tmEnd } });
}

// ============ PARSERS ============

function parseKmaAmos(text) {
  try {
    const lines = text.split('\n');
    let dataLine = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^\d{2,3}\s+\d{12}/)) {
        dataLine = trimmed;
        break;
      }
    }

    if (!dataLine) return null;

    const parts = dataLine.split(/\s+/);
    if (parts.length < 20) return null;

    const parseVal = (v) => { const n = parseInt(v); return isNaN(n) || n <= -99000 ? null : n; };

    const stn = parts[0];
    const tm = parts[1];
    const lVisRaw = parseVal(parts[2]);
    const rVisRaw = parseVal(parts[3]);
    const lVis = lVisRaw !== null ? lVisRaw : 9999;
    const rVis = rVisRaw !== null ? rVisRaw : 9999;
    const lRvr = parseVal(parts[4]);
    const rRvr = parseVal(parts[5]);
    const vis = Math.min(lVis > 0 ? lVis : 9999, rVis > 0 ? rVis : 9999);
    const ceilingRaw = parseVal(parts[6]);
    const ceilingM = ceilingRaw !== null && ceilingRaw < 90000 ? ceilingRaw : 99999;
    const ta = parseVal(parts[7]) !== null ? parseVal(parts[7]) / 10 : null;
    const td = parseVal(parts[8]) !== null ? parseVal(parts[8]) / 10 : null;
    const hm = parseVal(parts[9]);
    const ps = parseVal(parts[10]) !== null ? parseVal(parts[10]) / 10 : 1013;
    const pa = parseVal(parts[11]) !== null ? parseVal(parts[11]) / 10 : 1013;
    const rn = parseVal(parts[12]) !== null ? parseVal(parts[12]) / 10 : null;
    const cloud1 = parseVal(parts[13]);
    const cloud2 = parseVal(parts[14]);

    let wd = parseInt(parts[21]);
    let wsRaw = parseInt(parts[24]);
    let wsMaxRaw = parseInt(parts[25]);

    if (isNaN(wd) || wd < 0 || wd > 360) {
      wd = parseInt(parts[15]) || 0;
      wsRaw = parseInt(parts[18]) || 0;
      wsMaxRaw = parseInt(parts[19]) || 0;
    }

    const ws = Math.round(wsRaw / 10 * 1.94384);
    const wsMax = Math.round(wsMaxRaw / 10 * 1.94384);

    const visSM = vis / 1609.34;
    const ceilingFt = ceilingM * 3.28084;
    let fltCat = 'VFR';
    if (visSM < 1 || ceilingFt < 500) fltCat = 'LIFR';
    else if (visSM < 3 || ceilingFt < 1000) fltCat = 'IFR';
    else if (visSM < 5 || ceilingFt < 3000) fltCat = 'MVFR';

    const wdStr = wd > 0 ? String(wd).padStart(3, '0') : 'VRB';
    const rawOb = `RKPU ${tm.slice(6, 10)}Z ${wdStr}${String(Math.abs(ws)).padStart(2, '0')}${wsMax > ws ? 'G' + String(wsMax).padStart(2, '0') : ''}KT ${vis >= 9999 ? 'CAVOK' : vis + 'M'} ${ta < 0 ? 'M' : ''}${String(Math.abs(Math.round(ta))).padStart(2, '0')}/${td < 0 ? 'M' : ''}${String(Math.abs(Math.round(td))).padStart(2, '0')} Q${Math.round(ps)}`;

    return {
      icaoId: 'RKPU',
      obsTime: tm,
      temp: ta,
      dewp: td,
      humidity: hm,
      altim: Math.round(ps),
      altimLocal: Math.round(pa),
      wdir: wd,
      wspd: ws,
      wspdMs: (wsRaw / 10).toFixed(1),
      wgst: wsMax > ws ? wsMax : null,
      visib: vis >= 9999 ? 10 : Math.round(vis / 1000),
      visibM: vis < 90000 ? vis : null,
      lVis: lVisRaw,
      rVis: rVisRaw,
      lRvr: lRvr !== null && lRvr > 0 ? lRvr : null,
      rRvr: rRvr !== null && rRvr > 0 ? rRvr : null,
      ceiling: ceilingM < 99999 ? Math.round(ceilingM * 3.28084) : null,
      ceilingM: ceilingM < 99999 ? ceilingM : null,
      cloud: cloud1 !== null || cloud2 !== null ? Math.max(cloud1 || 0, cloud2 || 0) : null,
      rain: rn !== null && rn > 0 ? rn : null,
      fltCat,
      rawOb,
      source: 'KMA AMOS'
    };
  } catch (e) {
    console.error('AMOS parse error:', e);
    return null;
  }
}

function parseKmaMetarDec(text, stn) {
  try {
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const dataLine = lines.find(l => l.includes(`#${stn}#`));
    if (!dataLine) return null;

    const parts = dataLine.split('#');
    const tm = parts[2];
    const wd = parseInt(parts[3]) || 0;
    const ws = parseInt(parts[4]) || 0;
    const gst = parseInt(parts[5]) || 0;
    const vis = parseInt(parts[6]) || 9999;
    const ta = parseInt(parts[21]) / 10;
    const td = parseInt(parts[22]) / 10;
    const qnh = parseInt(parts[23]);

    const rawMatch = dataLine.match(/##(.+?)##=$/);
    const rawOb = rawMatch ? `METAR RKPU ${rawMatch[1]}` : '';

    const visSM = vis / 1609.34;
    let fltCat = 'VFR';
    if (visSM < 1) fltCat = 'LIFR';
    else if (visSM < 3) fltCat = 'IFR';
    else if (visSM < 5) fltCat = 'MVFR';

    return {
      icaoId: 'RKPU',
      obsTime: tm,
      temp: ta,
      dewp: td,
      altim: qnh,
      wdir: wd,
      wspd: ws,
      wgst: gst > 0 ? gst : null,
      visib: vis >= 9999 ? 10 : Math.round(vis / 1000),
      fltCat,
      rawOb,
      source: 'KMA METAR'
    };
  } catch (e) {
    return null;
  }
}

function parseSigmet(text) {
  const sigmets = [];
  try {
    const lines = text.split('\n');
    let currentSigmet = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // SIGMET format varies, try to extract key info
      if (trimmed.includes('SIGMET') || trimmed.includes('VALID')) {
        if (currentSigmet) sigmets.push(currentSigmet);
        currentSigmet = {
          raw: trimmed,
          type: trimmed.includes('TURB') ? 'TURBULENCE' :
                trimmed.includes('ICE') || trimmed.includes('ICING') ? 'ICING' :
                trimmed.includes('TS') || trimmed.includes('CB') ? 'THUNDERSTORM' :
                trimmed.includes('VA') || trimmed.includes('VOLCANIC') ? 'VOLCANIC_ASH' :
                'OTHER',
          coords: []
        };
      } else if (currentSigmet) {
        currentSigmet.raw += ' ' + trimmed;
        // Try to extract coordinates (N/S E/W format)
        const coordMatches = trimmed.matchAll(/([NS])(\d+)\s*([EW])(\d+)/g);
        for (const match of coordMatches) {
          const lat = parseInt(match[2]) / 100 * (match[1] === 'S' ? -1 : 1);
          const lon = parseInt(match[4]) / 100 * (match[3] === 'W' ? -1 : 1);
          currentSigmet.coords.push([lon, lat]);
        }
      }
    }
    if (currentSigmet) sigmets.push(currentSigmet);
  } catch (e) {
    console.error('SIGMET parse error:', e);
  }
  return sigmets;
}

function parseLlws(text) {
  const alerts = [];
  try {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // LLWS data format: STN TM RWY ALERT_TYPE WINDSHEAR_VALUE
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        alerts.push({
          station: parts[0],
          time: parts[1],
          runway: parts[2],
          type: parts[3],
          value: parts[4] || null,
          raw: trimmed
        });
      }
    }
  } catch (e) {
    console.error('LLWS parse error:', e);
  }
  return alerts;
}

function parseUpperWind(text, level) {
  const data = [];
  try {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 5) {
        data.push({
          station: parts[0],
          lat: parseFloat(parts[1]),
          lon: parseFloat(parts[2]),
          windDir: parseInt(parts[3]),
          windSpd: parseInt(parts[4]),
          temp: parts[5] ? parseFloat(parts[5]) : null,
          level: level
        });
      }
    }
  } catch (e) {
    console.error('Upper wind parse error:', e);
  }
  return data;
}

function parseLightning(text) {
  const strikes = [];
  try {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Lightning data format: TIME LAT LON AMPLITUDE TYPE
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        const lat = parseFloat(parts[1]);
        const lon = parseFloat(parts[2]);
        // Filter for Korea region
        if (lat >= 33 && lat <= 43 && lon >= 124 && lon <= 132) {
          strikes.push({
            time: parts[0],
            lat: lat,
            lon: lon,
            amplitude: parts[3] ? parseFloat(parts[3]) : null,
            type: parts[4] || 'CG' // Cloud-to-Ground default
          });
        }
      }
    }
  } catch (e) {
    console.error('Lightning parse error:', e);
  }
  return strikes;
}
