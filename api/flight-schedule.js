// Vercel Serverless Function - aviationstack 프록시 (Mixed Content 해결)
export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { flight } = req.query;

  if (!flight) {
    return res.status(400).json({ error: 'flight parameter required' });
  }

  const API_KEY = process.env.VITE_AVIATIONSTACK_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // 1차: IATA 코드로 active 비행 검색
    const url1 = `http://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${flight}&flight_status=active`;
    const response1 = await fetch(url1);
    const data1 = await response1.json();

    if (data1?.data?.length > 0) {
      return res.status(200).json(data1);
    }

    // 2차: IATA 코드로 모든 상태 검색 (flight_status 제거)
    const url2 = `http://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${flight}`;
    const response2 = await fetch(url2);
    const data2 = await response2.json();

    if (data2?.data?.length > 0) {
      return res.status(200).json(data2);
    }

    // 3차: ICAO 코드로 검색
    const url3 = `http://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_icao=${flight}`;
    const response3 = await fetch(url3);
    const data3 = await response3.json();

    return res.status(200).json(data3);

  } catch (error) {
    console.error('aviationstack API error:', error);
    return res.status(500).json({ error: 'Failed to fetch flight schedule' });
  }
}
