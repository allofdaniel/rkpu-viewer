/**
 * Vercel Serverless Function - OpenSky Flight Track API
 * DO-278A 요구사항 추적: SRS-API-003
 * Uses OAuth2 authentication for better rate limits and data access
 */
import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

const OPENSKY_API_URL = 'https://opensky-network.org/api';
const OPENSKY_AUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const OPENSKY_CLIENT_ID = process.env.OPENSKY_CLIENT_ID || '';
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET || '';

// Token cache to avoid re-authenticating every request
let tokenCache = { token: null, expires: 0 };

/**
 * Get OAuth2 access token from OpenSky
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (tokenCache.token && tokenCache.expires > Date.now()) {
    console.log('[OpenSky] Using cached OAuth2 token');
    return tokenCache.token;
  }

  if (!OPENSKY_CLIENT_ID || !OPENSKY_CLIENT_SECRET) {
    console.log('[OpenSky] No OAuth2 credentials, using anonymous access');
    return null;
  }

  try {
    console.log('[OpenSky] Requesting new OAuth2 token...');
    const response = await fetch(OPENSKY_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: OPENSKY_CLIENT_ID,
        client_secret: OPENSKY_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[OpenSky] OAuth2 token request failed:', response.status, text);
      return null;
    }

    const data = await response.json();
    console.log('[OpenSky] OAuth2 token obtained, expires in:', data.expires_in, 'seconds');

    // Cache the token with a 5-minute buffer before expiration
    tokenCache = {
      token: data.access_token,
      expires: Date.now() + ((data.expires_in - 300) * 1000),
    };

    return data.access_token;
  } catch (error) {
    console.error('[OpenSky] OAuth2 error:', error.message);
    return null;
  }
}

/**
 * Fetch flight track from OpenSky REST API
 */
async function fetchFlightTrack(icao24, accessToken) {
  const headers = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Try to get track data
  const trackUrl = `${OPENSKY_API_URL}/tracks/all?icao24=${icao24}&time=0`;
  console.log('[OpenSky] Fetching track:', trackUrl);

  const response = await fetch(trackUrl, { headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenSky API error: ${response.status} - ${text}`);
  }

  return response.json();
}

/**
 * ICAO24 주소 유효성 검증
 * @param {string} icao24 - ICAO 24비트 주소 (hex)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateIcao24(icao24) {
  // ICAO24는 6자리 hex 문자열
  const validPattern = /^[0-9a-fA-F]{6}$/;
  if (!validPattern.test(icao24)) {
    return { valid: false, error: 'Invalid ICAO24: must be 6-character hex string' };
  }
  return { valid: true };
}

export default async function handler(req, res) {
  // DO-278A SRS-SEC-002: CORS 처리 (강화된 버전)
  if (setCorsHeaders(req, res)) return;
  // DO-278A SRS-SEC-003: Rate Limiting
  if (await checkRateLimit(req, res)) return;

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const { icao24 } = req.query;

  if (!icao24) {
    return res.status(400).json({ error: 'icao24 parameter is required' });
  }

  // DO-278A SRS-SEC-004: 입력 검증
  const validation = validateIcao24(icao24);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    console.log('[OpenSky] Request for icao24:', icao24);
    console.log('[OpenSky] OAuth2 configured:', !!OPENSKY_CLIENT_ID && !!OPENSKY_CLIENT_SECRET);

    // Get OAuth2 token (or null for anonymous)
    const accessToken = await getAccessToken();

    // Fetch track data from OpenSky REST API
    const trackData = await fetchFlightTrack(icao24.toLowerCase(), accessToken);

    if (!trackData || !trackData.path || trackData.path.length === 0) {
      return res.status(200).json({
        icao24: icao24.toLowerCase(),
        path: [],
        error: 'No track data available',
        source: 'opensky-rest',
      });
    }

    // Convert to our format
    // OpenSky path format: [time, lat, lon, baro_altitude, track, on_ground]
    const path = trackData.path.map(p => ({
      time: p[0],
      lat: p[1],
      lon: p[2],
      altitude_ft: p[3] ? Math.round(p[3] * 3.28084) : 0, // meters to feet
      altitude_m: p[3] || 0,
      track: p[4],
      on_ground: p[5],
    }));

    // Downsample if too many points (keep ~500 points max for performance)
    let sampledPath = path;
    if (path.length > 500) {
      const step = Math.ceil(path.length / 500);
      sampledPath = path.filter((_, i) => i % step === 0 || i === path.length - 1);
    }

    return res.status(200).json({
      icao24: trackData.icao24,
      callsign: trackData.callsign?.trim(),
      startTime: trackData.startTime,
      endTime: trackData.endTime,
      totalPoints: path.length,
      sampledPoints: sampledPath.length,
      path: sampledPath,
      source: 'opensky-rest',
      authenticated: !!accessToken,
    });

  } catch (error) {
    console.error('[OpenSky] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch flight track',
      // DO-278A SRS-SEC-006: 프로덕션에서 에러 상세 숨김
      ...(process.env.NODE_ENV === 'development' && { details: error.message }),
      path: [],
    });
  }
}
