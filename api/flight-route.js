// Vercel Serverless Function - UBIKAIS + FlightRadar24 鍮꾧났??API濡?異쒕컻/?꾩갑 ?뺣낫 媛?몄삤湲?// UBIKAIS (?쒓뎅 怨듭뿭 ?뺣낫 ?쒖뒪?? ?곗씠?곕? ?곗꽑 ?ъ슜?섍퀬, ?놁쑝硫?FR24濡??대갚
import { setCorsHeaders, checkRateLimit } from './_utils/cors.js';

const CALLSIGN_PATTERN = /^[A-Z0-9-]{2,16}$/i;
const REG_PATTERN = /^[A-Z0-9]{3,12}$/i;
const HEX_PATTERN = /^[0-9A-F]{6}$/i;

function normalizeCallsign(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, '').toUpperCase();
  if (!CALLSIGN_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeReg(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/[-\s]/g, '').toUpperCase();
  if (!REG_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeHex(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!HEX_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}
export default async function handler(req, res) {
  // DO-278A SRS-SEC-002: Use secure CORS headers
  if (setCorsHeaders(req, res)) return;
  // DO-278A SRS-SEC-003: Rate Limiting
  if (await checkRateLimit(req, res)) return;

  const { callsign, reg, hex } = req.query;

  const normalizedCallsign = normalizeCallsign(callsign);
  const normalizedReg = normalizeReg(reg);
  const normalizedHex = normalizeHex(hex);

  if (!normalizedCallsign && !normalizedReg && !normalizedHex) {
    if (callsign || reg || hex) {
      return res.status(400).json({ error: 'Invalid callsign/reg/hex format' });
    }
    return res.status(400).json({ error: 'callsign, reg, or hex parameter required' });
  }

  try {
    let flightData = null;

    // 1李? UBIKAIS ?곗씠?곗뿉??寃??(flight_schedule.json)
    // Vercel ?섍꼍?먯꽌??API濡??몄텧, 濡쒖뺄?먯꽌???뺤쟻 ?뚯씪 李몄“
    try {
      const ubikaisUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/flight_schedule.json`
        : '/flight_schedule.json';

      const ubikaisRes = await fetch(ubikaisUrl);
      if (ubikaisRes.ok) {
        const ubikaisData = await ubikaisRes.json();
        const departures = ubikaisData.departures || [];

        // callsign?쇰줈 寃??(?? KAL319 -> ?몃챸?먯꽌 ?レ옄 遺遺?留ㅼ묶)
        let matchedFlight = null;

        if (normalizedCallsign) {
          const normalizedCallsignForSearch = normalizedCallsign.replace(/\s/g, '').toUpperCase();
          matchedFlight = departures.find(f => {
            const flightNum = f.flight_number?.replace(/\s/g, '').toUpperCase();
            return (
              flightNum === normalizedCallsignForSearch ||
              flightNum === normalizedCallsignForSearch.replace(/^([A-Z]+)0*/, '$1') // KAL0319 -> KAL319
            );
          });
        }

        if (!matchedFlight && normalizedReg) {
          matchedFlight = departures.find(f => {
            const flightReg = f.registration?.replace(/-/g, '').toUpperCase();
            return flightReg === normalizedReg;
          });
        }

        if (matchedFlight) {
          // ICAO 肄붾뱶瑜?IATA濡?蹂??(二쇱슂 ?쒓뎅 怨듯빆)
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

    // UBIKAIS?먯꽌 李얠븯?쇰㈃ 諛붾줈 諛섑솚
    if (flightData) {
      return res.status(200).json(flightData);
    }

    // 2nd: FlightRadar24 API fallback (search by callsign)
    if (normalizedCallsign) {
      try {
        const callSignForSearch = normalizedCallsign;
        const feedUrl = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=0&air=1&vehicles=0&estimated=0&maxage=14400&gliders=0&stats=0&callsign=${encodeURIComponent(callSignForSearch)}`;

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
          // FR24 ?묐떟?먯꽌 ??났湲??곗씠??異붿텧
          for (const key in feedData) {
            if (key !== 'full_count' && key !== 'version' && key !== 'stats') {
              const flight = feedData[key];
              if (Array.isArray(flight) && flight.length >= 14) {
                // FR24 ?곗씠???뺤떇: [icao24, lat, lon, track, alt, speed, squawk, radar, type, reg, timestamp, origin, dest, flight, ...]
                const flightId = key;
                const originIata = flight[11] || null;
                const destIata = flight[12] || null;
                const flightNumber = flight[13] || normalizedCallsign;

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

                  // FR24 detail API call
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
                      if (detail.time) {
                        flightData.schedule = {
                          std: detail.time.scheduled?.departure ? new Date(detail.time.scheduled.departure * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : null,
                          sta: detail.time.scheduled?.arrival ? new Date(detail.time.scheduled.arrival * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : null,
                          etd: detail.time.estimated?.departure ? new Date(detail.time.estimated.departure * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : null,
                          eta: detail.time.estimated?.arrival ? new Date(detail.time.estimated.arrival * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : null,
                          atd: detail.time.real?.departure ? new Date(detail.time.real.departure * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : null,
                          ata: detail.time.real?.arrival ? new Date(detail.time.real.arrival * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : null
                        };
                      }
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
                      if (detail.airline) {
                        flightData.airline = {
                          name: detail.airline.name || null,
                          code: detail.airline.code?.iata || null,
                          icao: detail.airline.code?.icao || null
                        };
                      }
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

    if (!flightData && normalizedHex) {
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
          const hexUpper = normalizedHex;

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

    // ADS-B Exchange fallback
    if (!flightData && normalizedHex) {
      try {
        // adsbexchange.com API ?쒕룄
        const hexForExchange = normalizedHex.toLowerCase();
        const adsbUrl = `https://globe.adsbexchange.com/data/traces/${hexForExchange.substring(0, 2)}/trace_full_${hexForExchange}.json`;
        const adsbRes = await fetch(adsbUrl, {
          headers: { 'User-Agent': 'TBAS/2.1 (+https://tbas.vercel.app)' }
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
                hex: normalizedHex
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

