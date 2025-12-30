// Vercel Serverless Function - Proxy for airplanes.live trace API
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { hex } = req.query;

  if (!hex) {
    return res.status(400).json({ error: 'hex parameter is required' });
  }

  // airplanes.live trace API - returns last 25 positions for an aircraft
  const apiUrl = `https://api.airplanes.live/v2/hex/${hex}`;

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching aircraft trace:', error);
    return res.status(500).json({ error: 'Failed to fetch aircraft trace', details: error.message });
  }
}
