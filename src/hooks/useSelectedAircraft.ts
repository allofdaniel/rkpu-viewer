import { useState, useEffect } from 'react';
import { AIRPORT_DATABASE } from '../constants/airports';
import { ICAO_TO_IATA } from '../constants/aircraft';
import { AIRPORT_ICAO_TO_IATA } from '../constants/airports';
import type { AircraftData } from './useAircraftData';
import { logger } from '../utils/logger';

export interface AircraftPhoto {
  image: string;
  link?: string;
  photographer?: string;
}

export interface AircraftDetails {
  Registration?: string;
  ModeS?: string;
  Type?: string;
  Operator?: string;
  [key: string]: unknown;
}

export interface FlightAirport {
  iata?: string;
  icao?: string;
  airport?: string;
  name?: string;
}

export interface FlightScheduleData {
  flight?: { iata?: string; icao?: string };
  departure?: FlightAirport | null;
  arrival?: FlightAirport | null;
  origin?: FlightAirport;
  destination?: FlightAirport;
  flight_status?: string;
  schedule?: {
    std?: string;
    etd?: string;
    atd?: string;
    sta?: string;
    eta?: string;
    status?: string;
    nature?: string;
  } | null;
  aircraft_info?: {
    registration?: string;
    type?: string;
    images?: string[];
  };
  aircraft_images?: string[];
  _source?: string;
  _lastUpdated?: string;
  _staleSchedule?: boolean;
}

export interface FlightTrackPoint {
  time: number;
  lat: number;
  lon: number;
  altitude_ft: number;
  track?: number;
  on_ground?: boolean;
  callsign?: string;
}

export interface FlightTrackData {
  icao24?: string;
  callsign?: string;
  startTime?: number;
  endTime?: number;
  path: FlightTrackPoint[];
  source?: string;
  totalPoints?: number;
}

export interface UseSelectedAircraftReturn {
  aircraftPhoto: AircraftPhoto | null;
  aircraftPhotoLoading: boolean;
  aircraftDetails: AircraftDetails | null;
  aircraftDetailsLoading: boolean;
  flightSchedule: FlightScheduleData | null;
  flightScheduleLoading: boolean;
  flightTrack: FlightTrackData | null;
  flightTrackLoading: boolean;
  showAircraftPanel: boolean;
  setShowAircraftPanel: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * useSelectedAircraft - 선택된 항공기 상세 정보 관리 훅
 * - 항공기 사진 로딩
 * - hexdb.io 기체 상세정보
 * - 비행 스케줄 정보
 * - OpenSky 비행 경로
 */
export default function useSelectedAircraft(selectedAircraft: AircraftData | null): UseSelectedAircraftReturn {
  const [aircraftPhoto, setAircraftPhoto] = useState<AircraftPhoto | null>(null);
  const [aircraftPhotoLoading, setAircraftPhotoLoading] = useState(false);
  const [aircraftDetails, setAircraftDetails] = useState<AircraftDetails | null>(null);
  const [aircraftDetailsLoading, setAircraftDetailsLoading] = useState(false);
  const [flightSchedule, setFlightSchedule] = useState<FlightScheduleData | null>(null);
  const [flightScheduleLoading, setFlightScheduleLoading] = useState(false);
  const [flightTrack, setFlightTrack] = useState<FlightTrackData | null>(null);
  const [flightTrackLoading, setFlightTrackLoading] = useState(false);
  const [showAircraftPanel, setShowAircraftPanel] = useState(false);

  // aviationstack API key (환경변수 또는 직접 설정)
  const AVIATIONSTACK_API_KEY = import.meta.env.VITE_AVIATIONSTACK_API_KEY || '';

  // Fetch aircraft photo when selectedAircraft changes
  useEffect(() => {
    if (!selectedAircraft) {
      setAircraftPhoto(null);
      setShowAircraftPanel(false);
      return;
    }

    setShowAircraftPanel(true);
    setAircraftPhotoLoading(true);
    setAircraftPhoto(null);

    const hex = selectedAircraft.hex?.toUpperCase();
    const reg = selectedAircraft.registration;

    let cancelled = false;
    const controller = new AbortController();

    // Vercel API Route를 통한 사진 조회 (CORS 해결)
    const fetchPhoto = async () => {
      try {
        const params = new URLSearchParams();
        if (hex) params.append('hex', hex);
        if (reg) params.append('reg', reg);

        const res = await fetch(`/api/aircraft-photo?${params}`, { signal: controller.signal });
        if (cancelled) return;
        const data = await res.json();

        if (!cancelled && data.image) {
          setAircraftPhoto(data);
        }
        if (!cancelled) setAircraftPhotoLoading(false);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        logger.warn('Aircraft', 'Failed to fetch aircraft photo', { error: (err as Error).message });
        if (!cancelled) setAircraftPhotoLoading(false);
      }
    };

    fetchPhoto();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: only re-fetch when identity changes
  }, [selectedAircraft?.hex, selectedAircraft?.registration]);

  // Fetch aircraft details from hexdb.io when selectedAircraft changes
  useEffect(() => {
    if (!selectedAircraft) {
      setAircraftDetails(null);
      return;
    }

    const hex = selectedAircraft.hex?.toUpperCase();
    if (!hex) return;

    setAircraftDetailsLoading(true);
    setAircraftDetails(null);

    const fetchDetails = async () => {
      try {
        const res = await fetch(`/api/aircraft-details?hex=${hex}`);
        if (res.ok) {
          const data = await res.json();
          setAircraftDetails(data);
        }
      } catch (err) {
        logger.warn('Aircraft', 'Failed to fetch aircraft details from hexdb.io', { error: (err as Error).message });
      } finally {
        setAircraftDetailsLoading(false);
      }
    };

    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: only re-fetch when hex changes
  }, [selectedAircraft?.hex]);

  // Fetch flight route from FlightRadar24 (primary) or aviationstack (fallback)
  useEffect(() => {
    if (!selectedAircraft) {
      setFlightSchedule(null);
      return;
    }

    const callsign = selectedAircraft.callsign?.trim();
    const hex = selectedAircraft.hex;
    if (!callsign && !hex) return;

    setFlightScheduleLoading(true);
    setFlightSchedule(null);

    const fetchSchedule = async () => {
      // ICAO to IATA 변환 맵 (공통 매핑 사용 + 추가 공항)
      const icaoToIata: Record<string, string> = {
        ...AIRPORT_ICAO_TO_IATA,
        // 추가 공항 (공통 매핑에 없는 것들)
        'RPLL': 'MNL', 'VVCR': 'CXR', 'VVDN': 'DAD', 'VVPQ': 'PQC',
        'OMDB': 'DXB', 'OTHH': 'DOH', 'HAAB': 'ADD', 'LTFM': 'IST',
        'KORD': 'ORD', 'KCVG': 'CVG', 'PANC': 'ANC',
        'EDDF': 'FRA', 'EDDP': 'LEJ', 'EBBR': 'BRU', 'LIMC': 'MXP',
        'ZMCK': 'UBN', 'WBKK': 'BKI', 'ZSYT': 'YNT'
      };

      try {
        // 1차: 로컬 UBIKAIS 정적 JSON 파일 직접 검색 (API 없이 작동)
        const reg = selectedAircraft?.registration;
        try {
          const ubikaisRes = await fetch('/flight_schedule.json');
          if (ubikaisRes.ok) {
            const ubikaisData = await ubikaisRes.json();
            const departures = ubikaisData.departures || [];
            let matchedFlight: Record<string, unknown> | null = null;

            // callsign으로 검색
            if (callsign) {
              const normalizedCallsign = callsign.replace(/\s/g, '').toUpperCase();
              matchedFlight = departures.find((f: Record<string, unknown>) => {
                const flightNum = (f.flight_number as string)?.replace(/\s/g, '').toUpperCase();
                return flightNum === normalizedCallsign ||
                       flightNum === normalizedCallsign.replace(/^([A-Z]+)0*/, '$1');
              });
            }

            // registration으로 검색
            if (!matchedFlight && reg) {
              const normalizedReg = reg.replace(/-/g, '').toUpperCase();
              matchedFlight = departures.find((f: Record<string, unknown>) => {
                const flightReg = (f.registration as string)?.replace(/-/g, '').toUpperCase();
                return flightReg === normalizedReg;
              });
            }

            if (matchedFlight) {
              // 스케줄이 현재 비행과 일치하는지 검증
              const isStaleSchedule = (): boolean => {
                const etaStr = (matchedFlight?.eta || matchedFlight?.sta) as string | undefined;
                if (!etaStr) return false;
                // "오후 02:26" 같은 형식 파싱
                const match = etaStr.match(/(오전|오후)\s*(\d{1,2}):(\d{2})/);
                if (!match || !match[1] || !match[2] || !match[3]) return false;
                let hour = parseInt(match[2]);
                const minute = parseInt(match[3]);
                if (match[1] === '오후' && hour !== 12) hour += 12;
                if (match[1] === '오전' && hour === 12) hour = 0;

                const now = new Date();
                const eta = new Date();
                eta.setHours(hour, minute, 0, 0);

                const sixHours = 6 * 60 * 60 * 1000;
                if (eta.getTime() - now.getTime() > sixHours) {
                  eta.setDate(eta.getDate() - 1);
                }

                return (now.getTime() - eta.getTime()) > 2 * 60 * 60 * 1000;
              };

              if (isStaleSchedule()) {
                logger.debug('FlightSchedule', 'UBIKAIS: Stale schedule detected (past ETA), skipping', { flight: matchedFlight.flight_number });
              } else {
                const originIcao = matchedFlight.origin as string;
                const destIcao = matchedFlight.destination as string;
                setFlightSchedule({
                  flight: { iata: matchedFlight.flight_number as string, icao: callsign ?? undefined },
                  departure: originIcao ? {
                    iata: icaoToIata[originIcao] || originIcao,
                    icao: originIcao,
                    airport: AIRPORT_DATABASE[originIcao]?.name
                  } : null,
                  arrival: destIcao ? {
                    iata: icaoToIata[destIcao] || destIcao,
                    icao: destIcao,
                    airport: AIRPORT_DATABASE[destIcao]?.name
                  } : null,
                  flight_status: matchedFlight.status as string,
                  schedule: {
                    std: matchedFlight.std as string,
                    etd: matchedFlight.etd as string,
                    atd: matchedFlight.atd as string,
                    sta: matchedFlight.sta as string,
                    eta: matchedFlight.eta as string,
                    status: matchedFlight.status as string,
                    nature: matchedFlight.nature as string
                  },
                  aircraft_info: {
                    registration: matchedFlight.registration as string,
                    type: matchedFlight.aircraft_type as string
                  },
                  _source: 'ubikais',
                  _lastUpdated: ubikaisData.last_updated
                });
                setFlightScheduleLoading(false);
                logger.info('FlightSchedule', 'UBIKAIS match found', { flight: matchedFlight.flight_number });
                return;
              }
            }
          }
        } catch (e) {
          logger.warn('FlightSchedule', 'UBIKAIS static JSON search error', { error: (e as Error).message });
        }

        // 2차: UBIKAIS + FlightRadar24 통합 API로 출발/도착 정보 가져오기
        const params = new URLSearchParams();
        if (callsign) params.append('callsign', callsign);
        if (hex) params.append('hex', hex);
        if (reg) params.append('reg', reg);

        const fr24Res = await fetch(`/api/flight-route?${params}`);
        if (fr24Res.ok) {
          const routeData = await fr24Res.json();
          if (routeData?.origin?.iata || routeData?.destination?.iata) {
            const isStaleSchedule = (): boolean => {
              const etaStr = routeData.schedule?.eta || routeData.schedule?.sta;
              if (!etaStr) return false;
              const match = etaStr.match(/(오전|오후)\s*(\d{1,2}):(\d{2})/);
              if (!match) return false;
              let hour = parseInt(match[2]);
              const minute = parseInt(match[3]);
              if (match[1] === '오후' && hour !== 12) hour += 12;
              if (match[1] === '오전' && hour === 12) hour = 0;

              const now = new Date();
              const eta = new Date();
              eta.setHours(hour, minute, 0, 0);

              const sixHours = 6 * 60 * 60 * 1000;
              if (eta.getTime() - now.getTime() > sixHours) {
                eta.setDate(eta.getDate() - 1);
              }

              return (now.getTime() - eta.getTime()) > 2 * 60 * 60 * 1000;
            };

            const scheduleData = isStaleSchedule() ? null : routeData.schedule;
            if (isStaleSchedule()) {
              logger.debug('FlightSchedule', 'FR24: Stale schedule detected (past ETA), removing time data');
            }

            setFlightSchedule({
              flight: { iata: routeData.callsign, icao: callsign ?? undefined },
              departure: routeData.origin ? {
                iata: routeData.origin.iata,
                icao: routeData.origin.icao,
                airport: routeData.origin.name || AIRPORT_DATABASE[routeData.origin.icao]?.name
              } : null,
              arrival: routeData.destination ? {
                iata: routeData.destination.iata,
                icao: routeData.destination.icao,
                airport: routeData.destination.name || AIRPORT_DATABASE[routeData.destination.icao]?.name
              } : null,
              flight_status: isStaleSchedule() ? 'active' : (routeData.schedule?.status || routeData.status?.text || 'active'),
              schedule: scheduleData,
              aircraft_info: routeData.aircraft,
              aircraft_images: routeData.aircraft?.images || [],
              _source: routeData.source,
              _lastUpdated: routeData.lastUpdated,
              _staleSchedule: isStaleSchedule()
            });
            setFlightScheduleLoading(false);
            return;
          }
        }

        // 3차: aviationstack API 백업 (FR24에서 못 찾으면)
        if (AVIATIONSTACK_API_KEY && callsign) {
          const icaoMatch = callsign.match(/^([A-Z]{3})(\d+)/);
          let flightNumber = callsign;

          if (icaoMatch && icaoMatch[1] && icaoMatch[2]) {
            const icaoCode = icaoMatch[1];
            const number = icaoMatch[2];
            const iataCode = ICAO_TO_IATA[icaoCode];
            if (iataCode) {
              flightNumber = iataCode + number;
            }
          }

          const avRes = await fetch(`/api/flight-schedule?flight=${flightNumber}`);
          if (avRes.ok) {
            const avData = await avRes.json();
            if (avData?.data?.length > 0) {
              setFlightSchedule({ ...avData.data[0], _source: 'aviationstack' });
            }
          }
        }
      } catch (err) {
        logger.warn('FlightSchedule', 'Failed to fetch flight schedule', { error: (err as Error).message });
      } finally {
        setFlightScheduleLoading(false);
      }
    };

    fetchSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: only re-fetch when specific props change
  }, [selectedAircraft?.hex, selectedAircraft?.callsign, AVIATIONSTACK_API_KEY]);

  // Fetch flight track from OpenSky Trino (full history) or REST API (fallback)
  useEffect(() => {
    if (!selectedAircraft) {
      setFlightTrack(null);
      return;
    }

    const hex = selectedAircraft.hex?.toLowerCase();
    if (!hex) return;

    setFlightTrackLoading(true);
    setFlightTrack(null);

    const fetchTrack = async () => {
      try {
        // 1차: OpenSky Trino API (전체 비행 이력 - 이륙부터 착륙까지)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
          logger.debug('FlightTrack', `Fetching Trino data for ${hex}`);
          const trinoRes = await fetch(`/api/opensky-history?icao24=${hex}&hours=24`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (trinoRes.ok) {
            const trinoData = await trinoRes.json();
            logger.debug('FlightTrack', 'Trino response received', { dataKeys: Object.keys(trinoData) });
            if (trinoData.path && trinoData.path.length > 0) {
              logger.info('FlightTrack', `Trino: ${trinoData.path.length} points (sampled from ${trinoData.totalPoints})`);
              const firstPt = trinoData.path[0];
              const lastPt = trinoData.path[trinoData.path.length - 1];
              logger.debug('FlightTrack', `Time range: ${new Date(firstPt.time * 1000).toLocaleString()} ~ ${new Date(lastPt.time * 1000).toLocaleString()}`);
              setFlightTrack({
                icao24: trinoData.icao24,
                callsign: trinoData.path[0]?.callsign,
                startTime: trinoData.startTime,
                endTime: trinoData.endTime,
                path: trinoData.path,
                source: 'trino'
              });
              setFlightTrackLoading(false);
              return;
            } else {
              logger.warn('FlightTrack', `Trino returned empty path`, { error: trinoData.error || 'none' });
            }
          } else {
            const errText = await trinoRes.text();
            logger.warn('FlightTrack', `Trino API error`, { status: trinoRes.status, error: errText });
          }
        } catch (trinoErr) {
          // 에러 발생 시에도 timeout 정리
          clearTimeout(timeoutId);
          if ((trinoErr as Error).name === 'AbortError') {
            logger.warn('FlightTrack', 'Trino API timeout (5s), falling back to REST API');
          } else {
            logger.warn('FlightTrack', 'Trino API failed', { error: (trinoErr as Error).message });
          }
        }

        // 2차: OpenSky REST tracks API (제한된 데이터)
        logger.debug('FlightTrack', `Falling back to OpenSky REST API for ${hex}`);
        const res = await fetch(`/api/aircraft-track?hex=${hex}&time=0`);
        if (res.ok) {
          const data = await res.json();
          logger.debug('FlightTrack', 'OpenSky REST response received', { pathLength: data?.path?.length || 0 });
          if (data && data.path && data.path.length > 0) {
            const trackData: FlightTrackPoint[] = data.path.map((p: number[]) => ({
              time: p[0],
              lat: p[1],
              lon: p[2],
              altitude_ft: p[3] ? Math.round(p[3] * 3.28084) : 0,
              track: p[4],
              on_ground: p[5]
            }));
            logger.info('FlightTrack', `REST: ${trackData.length} points`);
            const firstTrack = trackData[0];
            const lastTrack = trackData[trackData.length-1];
            if (firstTrack && lastTrack) {
              logger.debug('FlightTrack', `Time range: ${new Date(firstTrack.time * 1000).toLocaleString()} ~ ${new Date(lastTrack.time * 1000).toLocaleString()}`);
            }
            setFlightTrack({
              icao24: data.icao24,
              callsign: data.callsign,
              startTime: data.startTime,
              endTime: data.endTime,
              path: trackData,
              source: 'rest'
            });
          }
        } else {
          logger.warn('FlightTrack', 'OpenSky REST API error', { status: res.status });
        }
      } catch (err) {
        logger.warn('FlightTrack', 'Failed to fetch flight track from OpenSky', { error: (err as Error).message });
      } finally {
        setFlightTrackLoading(false);
      }
    };

    fetchTrack();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: only re-fetch when hex changes
  }, [selectedAircraft?.hex]);

  return {
    aircraftPhoto,
    aircraftPhotoLoading,
    aircraftDetails,
    aircraftDetailsLoading,
    flightSchedule,
    flightScheduleLoading,
    flightTrack,
    flightTrackLoading,
    showAircraftPanel,
    setShowAircraftPanel
  };
}
