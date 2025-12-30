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

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Dynamic import for AWS SDK
    const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');

    const s3Client = new S3Client({
      region: 'ap-southeast-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // Check query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const source = url.searchParams.get('source') || 'realtime';
    const limit = parseInt(url.searchParams.get('limit')) || 0; // 0 = no limit
    const period = url.searchParams.get('period') || 'all'; // 'all', '1month', '1year'

    // Bounds filtering (south,west,north,east)
    const boundsParam = url.searchParams.get('bounds');
    let bounds = null;
    if (boundsParam) {
      const [south, west, north, east] = boundsParam.split(',').map(Number);
      if (!isNaN(south) && !isNaN(west) && !isNaN(north) && !isNaN(east)) {
        bounds = { south, west, north, east };
      }
    }

    if (source === 'complete') {
      // Find the latest complete folder
      const listCommand = new ListObjectsV2Command({
        Bucket: 'notam-korea-data',
        Prefix: 'notam_complete/',
        Delimiter: '/',
      });

      const listResponse = await s3Client.send(listCommand);
      const folders = (listResponse.CommonPrefixes || [])
        .map(p => p.Prefix)
        .filter(p => p.includes('notam_complete/'))
        .sort()
        .reverse();

      // Get the latest folder (sorted by timestamp in folder name)
      const latestFolder = folders[0] || 'notam_complete/20251222_225257/';
      const completeKey = `${latestFolder}notam_final_complete.json`;

      // Fetch complete NOTAM database
      const getCommand = new GetObjectCommand({
        Bucket: 'notam-korea-data',
        Key: completeKey,
      });

      const getResponse = await s3Client.send(getCommand);
      const bodyString = await getResponse.Body.transformToString();
      let notamData = JSON.parse(bodyString);
      const totalCount = notamData.length;

      // Filter by period first (this is the most effective filter for reducing data)
      if (period && period !== 'all') {
        notamData = notamData.filter(notam => isValidInPeriod(notam, period));
      }
      const afterPeriodCount = notamData.length;

      // Filter by bounds if specified
      if (bounds) {
        notamData = notamData.filter(notam => {
          const coords = parseNotamCoordinates(notam.full_text);
          if (!coords) return false; // Skip NOTAMs without parseable coordinates
          return isInBounds(coords.lat, coords.lon, bounds);
        });
      }

      // Apply limit if specified (after all filtering)
      const filteredCount = notamData.length;
      if (limit > 0 && notamData.length > limit) {
        notamData = notamData.slice(0, limit);
      }

      return res.status(200).json({
        data: notamData,
        count: totalCount,
        afterPeriodFilter: afterPeriodCount,
        filtered: filteredCount,
        returned: notamData.length,
        source: 's3-complete',
        period: period,
        bounds: bounds,
        file: completeKey,
      });
    }

    // Default: fetch realtime NOTAM data
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    const prefix = `notam_realtime/${today}/`;

    // List objects in today's folder to find the latest file
    const listCommand = new ListObjectsV2Command({
      Bucket: 'notam-korea-data',
      Prefix: prefix,
    });

    let listResponse = await s3Client.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      // Try yesterday if today's folder is empty
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const yesterdayPrefix = `notam_realtime/${yesterday}/`;

      const yesterdayListCommand = new ListObjectsV2Command({
        Bucket: 'notam-korea-data',
        Prefix: yesterdayPrefix,
      });

      listResponse = await s3Client.send(yesterdayListCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return res.status(200).json({ data: [], count: 0, source: 's3-realtime', message: 'No NOTAM data found' });
      }
    }

    // Sort by LastModified to get the latest file
    const sortedFiles = listResponse.Contents.sort((a, b) =>
      new Date(b.LastModified) - new Date(a.LastModified)
    );

    const latestFile = sortedFiles[0];

    // Get the latest NOTAM file
    const getCommand = new GetObjectCommand({
      Bucket: 'notam-korea-data',
      Key: latestFile.Key,
    });

    const getResponse = await s3Client.send(getCommand);
    const bodyString = await getResponse.Body.transformToString();
    const notamData = JSON.parse(bodyString);

    res.status(200).json({
      data: notamData,
      count: notamData.length,
      returned: notamData.length,
      source: 's3-realtime',
      file: latestFile.Key,
      lastModified: latestFile.LastModified,
    });
  } catch (error) {
    console.error('NOTAM S3 error:', error.message, error.stack);

    // Fallback to original API if S3 fails
    try {
      const response = await fetch('http://3.27.240.67:8000/notams/realtime?limit=500');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      res.status(200).json({ ...data, source: 'api-fallback', s3Error: error.message });
    } catch (fallbackError) {
      res.status(500).json({ error: error.message, fallbackError: fallbackError.message });
    }
  }
}
