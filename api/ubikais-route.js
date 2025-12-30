// Vercel Serverless Function - UBIKAIS API 프록시 (비행 경로 정보)
// UBIKAIS 크롤링 데이터에서 출발/도착 정보 가져오기

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { callsign, reg, hex } = req.query;

  if (!callsign && !reg && !hex) {
    return res.status(400).json({ error: 'callsign, reg, or hex parameter required' });
  }

  try {
    // UBIKAIS API 엔드포인트 (AWS에 배포된 API)
    const UBIKAIS_API_URL = process.env.UBIKAIS_API_URL || 'https://your-ubikais-api.amazonaws.com/prod';

    // 로컬 JSON 파일에서 먼저 검색 (Vercel Functions에서는 사용 불가)
    // AWS Lambda에 배포된 API 호출

    let flightData = null;

    // 1. callsign으로 검색
    if (callsign) {
      try {
        const response = await fetch(`${UBIKAIS_API_URL}/api/flights/route?callsign=${encodeURIComponent(callsign)}`);

        if (response.ok) {
          const data = await response.json();
          if (data && data.origin) {
            flightData = {
              source: 'ubikais',
              callsign: data.callsign,
              origin: data.origin,
              destination: data.destination,
              aircraft: data.aircraft,
              schedule: data.schedule,
              status: data.status
            };
          }
        }
      } catch (e) {
        console.warn('UBIKAIS API callsign search error:', e.message);
      }
    }

    // 2. registration으로 검색
    if (!flightData && reg) {
      try {
        const response = await fetch(`${UBIKAIS_API_URL}/api/flights/route?reg=${encodeURIComponent(reg)}`);

        if (response.ok) {
          const data = await response.json();
          if (data && data.origin) {
            flightData = {
              source: 'ubikais',
              callsign: data.callsign,
              origin: data.origin,
              destination: data.destination,
              aircraft: data.aircraft,
              status: data.status
            };
          }
        }
      } catch (e) {
        console.warn('UBIKAIS API reg search error:', e.message);
      }
    }

    // 3. FlightRadar24 백업 (UBIKAIS에서 못 찾으면)
    if (!flightData && callsign) {
      try {
        const feedUrl = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=0&air=1&vehicles=0&estimated=0&maxage=14400&gliders=0&stats=0&callsign=${callsign}`;

        const feedRes = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Origin': 'https://www.flightradar24.com',
            'Referer': 'https://www.flightradar24.com/'
          }
        });

        if (feedRes.ok) {
          const feedData = await feedRes.json();
          for (const key in feedData) {
            if (key !== 'full_count' && key !== 'version' && key !== 'stats') {
              const flight = feedData[key];
              if (Array.isArray(flight) && flight.length >= 14) {
                const originIata = flight[11] || null;
                const destIata = flight[12] || null;
                const flightNumber = flight[13] || callsign;

                if (originIata || destIata) {
                  flightData = {
                    source: 'flightradar24',
                    flightId: key,
                    callsign: flightNumber,
                    origin: originIata ? { iata: originIata } : null,
                    destination: destIata ? { iata: destIata } : null,
                    aircraft: {
                      registration: flight[9] || null,
                      type: flight[8] || null,
                      hex: flight[0] || null
                    }
                  };
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('FR24 fallback error:', e.message);
      }
    }

    if (flightData) {
      return res.status(200).json(flightData);
    }

    return res.status(200).json({ source: null, origin: null, destination: null });

  } catch (error) {
    console.error('UBIKAIS route API error:', error);
    return res.status(500).json({ error: 'Failed to fetch flight route' });
  }
}
