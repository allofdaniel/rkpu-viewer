import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

// Parse NOTAM Q-line coordinates (e.g., "3505N12804E005" -> {lat, lon})
function parseNotamCoordinates(fullText) {
  if (!fullText) return null;
  // Q-line format: Q) FIR/QCODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORD
  const qLineMatch = fullText.match(/Q\)\s*\S+\/\S+\/\S+\/\S+\/\S+\/\d{3}\/\d{3}\/(\d{4})([NS])(\d{5})([EW])\d{3}/);
  if (!qLineMatch) return null;

  const [, latDeg, latDir, lonDeg, lonDir] = qLineMatch;

  // Parse latitude: DDMM format
  const latDegrees = parseInt(latDeg.substring(0, 2), 10);
  const latMinutes = parseInt(latDeg.substring(2, 4), 10);
  let lat = latDegrees + latMinutes / 60;
  if (latDir === 'S') lat = -lat;

  // Parse longitude: DDDMM format
  const lonDegrees = parseInt(lonDeg.substring(0, 3), 10);
  const lonMinutes = parseInt(lonDeg.substring(3, 5), 10);
  let lon = lonDegrees + lonMinutes / 60;
  if (lonDir === 'W') lon = -lon;

  return { lat, lon };
}

// Check if a point is within bounds (with margin for NOTAM radius)
function isInBounds(lat, lon, bounds, margin = 1) {
  if (!bounds || !lat || !lon) return true; // No bounds = include all
  return (
    lat >= bounds.south - margin &&
    lat <= bounds.north + margin &&
    lon >= bounds.west - margin &&
    lon <= bounds.east + margin
  );
}

// Parse NOTAM date from Item B or C (format: YYMMDDHHMM or YYMMDD)
function parseNotamDate(dateStr) {
  if (!dateStr || dateStr.length < 6) return null;
  const year = 2000 + parseInt(dateStr.substring(0, 2), 10);
  const month = parseInt(dateStr.substring(2, 4), 10) - 1;
  const day = parseInt(dateStr.substring(4, 6), 10);
  const hour = dateStr.length >= 8 ? parseInt(dateStr.substring(6, 8), 10) : 0;
  const minute = dateStr.length >= 10 ? parseInt(dateStr.substring(8, 10), 10) : 0;
  return new Date(year, month, day, hour, minute);
}

// Extract start/end dates from NOTAM full_text
function extractNotamDates(fullText) {
  if (!fullText) return { start: null, end: null };

  // Item B: start date (B) YYMMDDHHMM)
  const startMatch = fullText.match(/B\)\s*(\d{10})/);
  const start = startMatch ? parseNotamDate(startMatch[1]) : null;

  // Item C: end date (C) YYMMDDHHMM or PERM or EST)
  const endMatch = fullText.match(/C\)\s*(\d{10}|PERM)/);
  let end = null;
  if (endMatch) {
    if (endMatch[1] === 'PERM') {
      end = new Date(2099, 11, 31); // Permanent = far future
    } else {
      end = parseNotamDate(endMatch[1]);
    }
  }

  return { start, end };
}

// Check if NOTAM is valid within period range
function isValidInPeriod(notam, period) {
  if (!period || period === 'all') return true;

  const now = new Date();
  const { start, end } = extractNotamDates(notam.full_text);

  let periodStart, periodEnd;

  if (period === 'current') {
    // Currently valid: start <= now AND (end >= now OR end is null/PERM)
    if (start && start > now) return false; // Not started yet
    if (end && end < now) return false; // Already expired
    return true;
  } else if (period === '1month') {
    periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  } else if (period === '1year') {
    periodStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  } else {
    return true;
  }

  // NOTAM is valid if its validity period overlaps with our period range
  // (start <= periodEnd) AND (end >= periodStart OR end is null/PERM)
  if (start && start > periodEnd) return false; // Starts after our period
  if (end && end < periodStart) return false; // Ended before our period

  return true;
}

// Transform AIM Korea NOTAM item to frontend format
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

// Flatten AIM Korea grouped data into a flat NOTAM array
function flattenAimData(aimData) {
  const items = [];
  // Domestic NOTAMs (grouped by series: A, C, D, E, G, Z)
  if (aimData.domestic) {
    for (const seriesItems of Object.values(aimData.domestic)) {
      if (Array.isArray(seriesItems)) {
        for (const item of seriesItems) items.push(transformAimNotam(item));
      }
    }
  }
  // International NOTAMs (grouped by airport: RKSI, RKSS, ...)
  if (aimData.international) {
    for (const airportItems of Object.values(aimData.international)) {
      if (Array.isArray(airportItems)) {
        for (const item of airportItems) items.push(transformAimNotam(item));
      }
    }
  }
  // SNOWTAM
  if (Array.isArray(aimData.snowtam)) {
    for (const item of aimData.snowtam) items.push(transformAimNotam(item));
  }
  return items;
}

export default async function handler(req, res) {
  // DO-278A SRS-SEC-002: Use secure CORS headers
  if (setCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  // DO-278A SRS-SEC-003: Rate Limiting
  if (checkRateLimit(req, res)) {
    return; // Rate limit exceeded
  }

  try {
    const SUPABASE_PUBLIC = 'https://lxbdegbsriisiekvnpbk.supabase.co/storage/v1/object/public/notam-data';

    // Check query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit')) || 0;
    const period = url.searchParams.get('period') || 'all';

    // Bounds filtering (south,west,north,east)
    const boundsParam = url.searchParams.get('bounds');
    let bounds = null;
    if (boundsParam) {
      const [south, west, north, east] = boundsParam.split(',').map(Number);
      if (!isNaN(south) && !isNaN(west) && !isNaN(north) && !isNaN(east)) {
        bounds = { south, west, north, east };
      }
    }

    // Fetch latest NOTAM data from Supabase Storage (public bucket)
    const today = new Date().toISOString().split('T')[0];
    let latestPath = `notam_realtime/${today}/notam_latest.json`;
    let fileUrl = `${SUPABASE_PUBLIC}/${latestPath}`;

    let response = await fetch(fileUrl);

    // Fallback to yesterday if today's data not found
    if (!response.ok) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      latestPath = `notam_realtime/${yesterday}/notam_latest.json`;
      fileUrl = `${SUPABASE_PUBLIC}/${latestPath}`;
      response = await fetch(fileUrl);
    }

    if (!response.ok) {
      return res.status(200).json({ data: [], count: 0, source: 'supabase', message: 'No NOTAM data found' });
    }

    const aimData = await response.json();

    // Flatten AIM Korea grouped format into flat array with frontend field names
    let notamData = flattenAimData(aimData);
    const totalCount = notamData.length;

    // Filter by period
    if (period && period !== 'all') {
      notamData = notamData.filter(notam => isValidInPeriod(notam, period));
    }
    const afterPeriodCount = notamData.length;

    // Filter by bounds if specified
    if (bounds) {
      notamData = notamData.filter(notam => {
        const coords = parseNotamCoordinates(notam.full_text);
        if (!coords) return false;
        return isInBounds(coords.lat, coords.lon, bounds);
      });
    }

    const filteredCount = notamData.length;
    if (limit > 0 && notamData.length > limit) {
      notamData = notamData.slice(0, limit);
    }

    res.status(200).json({
      data: notamData,
      count: totalCount,
      afterPeriodFilter: afterPeriodCount,
      filtered: filteredCount,
      returned: notamData.length,
      source: 'supabase',
      period: period,
      bounds: bounds,
      file: latestPath,
      crawled_at: aimData.crawled_at || null,
    });
  } catch (error) {
    console.error('NOTAM fetch error:', error.message);

    res.status(500).json({
      error: 'NOTAM service temporarily unavailable',
      code: 'NOTAM_ERROR',
      ...(process.env.NODE_ENV === 'development' && {
        details: error.message,
      })
    });
  }
}
