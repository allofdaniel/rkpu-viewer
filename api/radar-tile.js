function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rawPath = String(req.query.path || '');
  if (!rawPath.startsWith('/')) return res.status(400).json({ error: 'Missing RainViewer tile path' });
  if (rawPath.includes('..') || rawPath.includes('://') || !rawPath.includes('/radar/')) {
    return res.status(400).json({ error: 'Invalid RainViewer tile path' });
  }

  const url = `https://tilecache.rainviewer.com${rawPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TBAS/2.1 (+https://tbas.vercel.app)',
        Accept: 'image/png,image/*,*/*'
      }
    });
    if (!response.ok) return res.status(response.status).json({ error: `RainViewer tile failed: ${response.statusText}` });
    const contentType = response.headers.get('content-type') || 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
    return res.status(200).send(bytes);
  } catch (error) {
    console.error('[radar-tile] upstream failed:', error.message);
    return res.status(502).json({ error: 'Radar tile unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}