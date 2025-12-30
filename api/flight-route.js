// Vercel Serverless Function - UBIKAIS + FlightRadar24 비공식 API로 출발/도착 정보 가져오기
// UBIKAIS (한국 공역 정보 시스템) 데이터를 우선 사용하고, 없으면 FR24로 폴백

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { callsign, reg, hex } = req.query;

  if (!callsign && !reg && !hex) {
    return res.status(400).json({ error: 'callsign, reg, or hex parameter required' });
  }

  try {
    let flightData = null;

    // 1차: UBIKAIS 데이터에서 검색 (flight_schedule.json)
    // Vercel 환경에서는 API로 호출, 로컬에서는 정적 파일 참조
    try {
      const ubikaisUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/flight_schedule.json`
        : '/flight_schedule.json';

      const ubikaisRes = await fetch(ubikaisUrl);
      if (ubikaisRes.ok) {
        const ubikaisData = await ubikaisRes.json();
        const departures = ubikaisData.departures || [];

        // callsign으로 검색 (예: KAL319 -> 편명에서 숫자 부분 매칭)
        let matchedFlight = null;

        if (callsign) {
          const normalizedCallsign = callsign.replace(/\s/g, '').toUpperCase();
          matchedFlight = departures.find(f => {
            const flightNum = f.flight_number?.replace(/\s/g, '').toUpperCase();
            return flightNum === normalizedCallsign ||
                   flightNum === normalizedCallsign.replace(/^([A-Z]+)0*/, '$1'); // KAL0319 -> KAL319
          });
        }

        // registration으로 검색
        if (!matchedFlight && reg) {
          const normalizedReg = reg.replace(/-/g, '').toUpperCase();
          matchedFlight = departures.find(f => {
            const flightReg = f.registration?.replace(/-/g, '').toUpperCase();
            return flightReg === normalizedReg;
          });
        }

        if (matchedFlight) {
          // ICAO 코드를 IATA로 변환 (주요 한국 공항)
          const icaoToIata = {
            'RKSI': 'ICN', 'RKSS': 'GMP', 'RKPK': 'PUS', 'RKPC': 'CJU',
            'RKPU': 'USN', 'RKTN': 'TAE', 'RKTU': 'CJJ', 'RKJB': 'MWX',
            'RKNY': 'YNY', 'RKJY': 'RSU', 'RKPS': 'HIN', 'RKTH': 'KPO',
            'RJTT': 'HND', 'RJAA': 'NRT', 'RJBB': 'KIX', 'RJOO': 'ITM',
            'RJFF': 'FUK', 'RJCC': 'CTS', 'VHHH': 'HKG', 'RCTP': 'TPE',
            'WSSS': 'SIN', 'VTBS': 'BKK', 'WMKK': 'KUL', 'RPLL': 'MNL',
            'ZGGG': 'CAN', 'ZSPD': 'PVG', 'ZSSS': 'SHA', 'ZBAA': 'PEK',
            'VVTS': 'SGN', 'VVNB': 'HAN', 'VVCR': 'CXR', 'VVDN': 'DAD', 'VVPQ': 'PQC',
            'OMDB': 'DXB', 'OTHH': 'DOH', 'HAAB': 'ADD', 'LTFM': 'IST',
            'KLAX': 'LAX', 'KJFK': 'JFK', 'KORD': 'ORD', 'KCVG': 'CVG', 'PANC': 'ANC',
            'EDDF': 'FRA', 'EDDP': 'LEJ', 'EBBR': 'BRU', 'LIMC': 'MXP',
            'ZMCK': 'UBN', 'WBKK': 'BKI'
          };

          const originIcao = matchedFlight.origin;
          const destIcao = matchedFlight.destination;

          flightData = {
            source: 'ubikais',
            flightId: matchedFlight.flight_number,
            callsign: matchedFlight.flight_number,
            origin: originIcao ? {
              iata: icaoToIata[originIcao] || originIcao,
              icao: originIcao,
              name: null
            } : null,
            destination: destIcao ? {
              iata: icaoToIata[destIcao] || destIcao,
              icao: destIcao,
              name: null
            } : null,
            aircraft: {
              registration: matchedFlight.registration || null,
              type: matchedFlight.aircraft_type || null,
              hex: null
            },
            schedule: {
              std: matchedFlight.std,
              etd: matchedFlight.etd,
              atd: matchedFlight.atd,
              sta: matchedFlight.sta,
              eta: matchedFlight.eta,
              status: matchedFlight.status,
              nature: matchedFlight.nature // PAX, CGO, STP, GEN
            },
            lastUpdated: ubikaisData.last_updated
          };
        }
      }
    } catch (e) {
      console.warn('UBIKAIS data search error:', e.message);
    }

    // UBIKAIS에서 찾았으면 바로 반환
    if (flightData) {
      return res.status(200).json(flightData);
    }

    // 2차: FlightRadar24 API로 출발/도착 정보 가져오기
    // callsign으로 검색 (예: KAL018)
    if (callsign) {
      try {
        // FR24 실시간 데이터 피드에서 검색
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
          // FR24 응답에서 항공기 데이터 추출
          for (const key in feedData) {
            if (key !== 'full_count' && key !== 'version' && key !== 'stats') {
              const flight = feedData[key];
              if (Array.isArray(flight) && flight.length >= 14) {
                // FR24 데이터 형식: [icao24, lat, lon, track, alt, speed, squawk, radar, type, reg, timestamp, origin, dest, flight, ...]
                const flightId = key;
                const originIata = flight[11] || null;
                const destIata = flight[12] || null;
                const flightNumber = flight[13] || callsign;

                if (originIata || destIata) {
                  flightData = {
                    source: 'flightradar24',
                    flightId: flightId,
                    callsign: flightNumber,
                    origin: originIata ? { iata: originIata } : null,
                    destination: destIata ? { iata: destIata } : null,
                    aircraft: {
                      registration: flight[9] || null,
                      type: flight[8] || null,
                      hex: flight[0] || null
                    },
                    // 추가 실시간 데이터
                    realtime: {
                      altitude: flight[4] || null,
                      speed: flight[5] || null,
                      track: flight[3] || null,
                      squawk: flight[6] || null,
                      lat: flight[1] || null,
                      lon: flight[2] || null,
                      timestamp: flight[10] || null
                    }
                  };

                  // FR24 상세 정보 API 호출 (출발/도착 시간 등)
                  try {
                    const detailUrl = `https://data-live.flightradar24.com/clickhandler/?version=1.5&flight=${flightId}`;
                    const detailRes = await fetch(detailUrl, {
                      headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Origin': 'https://www.flightradar24.com',
                        'Referer': 'https://www.flightradar24.com/'
                      }
                    });
                    if (detailRes.ok) {
                      const detail = await detailRes.json();
                      // 상세 시간 정보 추가
                      if (detail.time) {
                        flightData.schedule = {
                          std: detail.time.scheduled?.departure ? new Date(detail.time.scheduled.departure * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null,
                          sta: detail.time.scheduled?.arrival ? new Date(detail.time.scheduled.arrival * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null,
                          etd: detail.time.estimated?.departure ? new Date(detail.time.estimated.departure * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null,
                          eta: detail.time.estimated?.arrival ? new Date(detail.time.estimated.arrival * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null,
                          atd: detail.time.real?.departure ? new Date(detail.time.real.departure * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null,
                          ata: detail.time.real?.arrival ? new Date(detail.time.real.arrival * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null
                        };
                      }
                      // 공항 상세 정보
                      if (detail.airport) {
                        if (detail.airport.origin) {
                          flightData.origin = {
                            iata: detail.airport.origin.code?.iata || originIata,
                            icao: detail.airport.origin.code?.icao || null,
                            name: detail.airport.origin.name || null,
                            city: detail.airport.origin.position?.region?.city || null,
                            country: detail.airport.origin.position?.country?.name || null,
                            timezone: detail.airport.origin.timezone?.name || null
                          };
                        }
                        if (detail.airport.destination) {
                          flightData.destination = {
                            iata: detail.airport.destination.code?.iata || destIata,
                            icao: detail.airport.destination.code?.icao || null,
                            name: detail.airport.destination.name || null,
                            city: detail.airport.destination.position?.region?.city || null,
                            country: detail.airport.destination.position?.country?.name || null,
                            timezone: detail.airport.destination.timezone?.name || null
                          };
                        }
                      }
                      // 항공기 상세 정보
                      if (detail.aircraft) {
                        flightData.aircraft = {
                          ...flightData.aircraft,
                          model: detail.aircraft.model?.text || null,
                          code: detail.aircraft.model?.code || null,
                          registration: detail.aircraft.registration || flightData.aircraft.registration,
                          age: detail.aircraft.age || null,
                          msn: detail.aircraft.msn || null,
                          images: detail.aircraft.images?.thumbnails || []
                        };
                      }
                      // 항공사 정보
                      if (detail.airline) {
                        flightData.airline = {
                          name: detail.airline.name || null,
                          code: detail.airline.code?.iata || null,
                          icao: detail.airline.code?.icao || null
                        };
                      }
                      // 비행 상태
                      if (detail.status) {
                        flightData.status = {
                          text: detail.status.text || null,
                          icon: detail.status.icon || null,
                          live: detail.status.live || false
                        };
                      }
                    }
                  } catch (detailErr) {
                    console.warn('FR24 detail API error:', detailErr.message);
                  }
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('FR24 feed API error:', e.message);
      }
    }

    // hex로 검색
    if (!flightData && hex) {
      try {
        const feedUrl = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=0&air=1&vehicles=0&estimated=0&maxage=14400&gliders=0&stats=0`;

        const feedRes = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        });

        if (feedRes.ok) {
          const feedData = await feedRes.json();
          const hexUpper = hex.toUpperCase();

          for (const key in feedData) {
            if (key !== 'full_count' && key !== 'version' && key !== 'stats') {
              const flight = feedData[key];
              if (Array.isArray(flight) && flight.length >= 14) {
                if (flight[0] && flight[0].toUpperCase() === hexUpper) {
                  const originIata = flight[11] || null;
                  const destIata = flight[12] || null;

                  flightData = {
                    source: 'flightradar24',
                    flightId: key,
                    callsign: flight[13] || null,
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
        console.warn('FR24 hex search error:', e.message);
      }
    }

    // 방법 2: ADS-B Exchange 백업 (FR24에서 못찾으면)
    if (!flightData && hex) {
      try {
        // adsbexchange.com API 시도
        const adsbUrl = `https://globe.adsbexchange.com/data/traces/${hex.toLowerCase().substring(0, 2)}/trace_full_${hex.toLowerCase()}.json`;
        const adsbRes = await fetch(adsbUrl, {
          headers: { 'User-Agent': 'RKPU-Viewer/1.0' }
        });

        if (adsbRes.ok) {
          const adsbData = await adsbRes.json();
          if (adsbData && (adsbData.r || adsbData.desc)) {
            flightData = {
              source: 'adsbexchange',
              callsign: adsbData.flight?.trim() || null,
              origin: null,
              destination: null,
              aircraft: {
                registration: adsbData.r || null,
                type: adsbData.t || null,
                hex: hex
              }
            };
          }
        }
      } catch (e) {
        console.warn('ADS-B Exchange error:', e.message);
      }
    }

    if (flightData) {
      return res.status(200).json(flightData);
    }

    return res.status(200).json({ source: null, origin: null, destination: null });

  } catch (error) {
    console.error('Flight route API error:', error);
    return res.status(500).json({ error: 'Failed to fetch flight route' });
  }
}
