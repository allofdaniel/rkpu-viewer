import { useState, useEffect, useCallback, useRef } from 'react';
import { ftToM, isValidCoordinate } from '../utils/geometry';
import {
  getAircraftApiUrl,
  getAircraftTraceUrl,
  AIRCRAFT_UPDATE_INTERVAL,
  AIRCRAFT_QUERY_CENTER_LAT,
  AIRCRAFT_QUERY_CENTER_LON,
  AIRCRAFT_QUERY_RADIUS_NM,
} from '../constants/config';
import type { AviationData } from './useDataLoading';
import { logger } from '../utils/logger';

export interface AircraftData {
  hex: string;
  callsign: string;
  type: string;
  category: string;
  lat: number;
  lon: number;
  altitude_ft: number;
  altitude_m: number;
  ground_speed: number;
  track: number;
  on_ground: boolean;
  vertical_rate: number;
  squawk: string;
  emergency: string;
  registration: string;
  icao_type: string;
  operator: string;
  origin: string;
  destination: string;
  nav_altitude: number | null;
  nav_heading: number | null;
  ias: number;
  tas: number;
  mach: number;
  mag_heading: number;
  true_heading: number;
  timestamp: number;
}

export interface TrailPoint {
  lat: number;
  lon: number;
  altitude_m: number;
  altitude_ft?: number;
  timestamp: number;
}

export interface AircraftTrails {
  [hex: string]: TrailPoint[];
}

export interface DataWithAirport extends AviationData {
  airport?: { lat: number; lon: number };
}

export interface DataHealthStatus {
  isConnected: boolean;
  lastSuccessTime: number | null;
  aircraftCount: number;
  errorCount: number;
}

export interface UseAircraftDataReturn {
  aircraft: AircraftData[];
  setAircraft: React.Dispatch<React.SetStateAction<AircraftData[]>>;
  aircraftTrails: AircraftTrails;
  setAircraftTrails: React.Dispatch<React.SetStateAction<AircraftTrails>>;
  tracesLoaded: Set<string>;
  setTracesLoaded: React.Dispatch<React.SetStateAction<Set<string>>>;
  dataHealth: DataHealthStatus;
}

/**
 * useAircraftData - 항공기 데이터 로딩 및 관리 훅
 * - ADS-B 데이터 폴링
 * - 항적 히스토리 로딩
 * - 항공기 상태 관리
 * - 429 에러 시 백오프 처리
 */
export default function useAircraftData(
  data: DataWithAirport | null,
  mapLoaded: boolean,
  showAircraft: boolean,
  trailDuration: number
): UseAircraftDataReturn {
  const [aircraft, setAircraft] = useState<AircraftData[]>([]);
  const [aircraftTrails, setAircraftTrails] = useState<AircraftTrails>({});
  const [tracesLoaded, setTracesLoaded] = useState<Set<string>>(new Set());
  const [dataHealth, setDataHealth] = useState<DataHealthStatus>({
    isConnected: false,
    lastSuccessTime: null,
    aircraftCount: 0,
    errorCount: 0
  });
  const aircraftIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // tracesLoaded를 ref로도 유지하여 fetchAircraftData의 dependency 순환 방지
  const tracesLoadedRef = useRef<Set<string>>(new Set());
  // 429 에러 백오프
  const backoffRef = useRef<number>(0);
  const lastErrorTimeRef = useRef<number>(0);
  // AbortController for cleanup (race condition 방지)
  const abortControllerRef = useRef<AbortController | null>(null);

  // 개별 항공기의 과거 위치 히스토리 로드
  const loadAircraftTrace = useCallback(async (hex: string, signal?: AbortSignal): Promise<TrailPoint[] | null> => {
    try {
      const response = await fetch(getAircraftTraceUrl(hex), { signal });

      // 429 Too Many Requests 또는 다른 에러 상태 처리
      if (!response.ok) {
        if (response.status === 429) {
          logger.warn('Aircraft', `Trace API 429 for ${hex}: rate limited`);
        }
        return null;
      }

      // Content-Type 확인 (HTML 에러 페이지 감지)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        logger.warn('Aircraft', `Trace for ${hex}: invalid content-type`, { contentType });
        return null;
      }

      // 텍스트로 먼저 읽어서 유효성 검사
      const text = await response.text();
      if (!text || text.length < 2 || text.startsWith('<!') || text.startsWith('You')) {
        logger.warn('Aircraft', `Trace for ${hex}: invalid response (HTML or rate limit message)`);
        return null;
      }

      const result = JSON.parse(text);
      const ac = result.ac?.[0];
      if (!ac || !ac.trace) return null;

      // trace 배열: [timestamp, lat, lon, altitude(feet?), ...]
      const tracePoints: TrailPoint[] = [];
      const now = Date.now();
      ac.trace.forEach((point: number[]) => {
        if (point && point.length >= 4) {
          const ts = point[0];
          const lat = point[1];
          const lon = point[2];
          const alt = point[3];
          if (ts === undefined || lat === undefined || lon === undefined) return;
          const timestamp = ts * 1000; // 초 -> 밀리초
          if (now - timestamp <= trailDuration) {
            tracePoints.push({
              lat,
              lon,
              altitude_m: ftToM(alt ?? 0),
              timestamp
            });
          }
        }
      });
      return tracePoints;
    } catch (e) {
      // AbortError는 정상적인 cleanup이므로 무시
      if (e instanceof Error && e.name === 'AbortError') return null;
      // JSON 파싱 에러 등을 조용히 처리
      logger.warn('Aircraft', `Failed to load trace for ${hex}`, { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }, [trailDuration]);

  const fetchAircraftData = useCallback(async () => {
    if (!data?.airport) return;

    // 백오프 중이면 스킵
    if (backoffRef.current > 0 && Date.now() - lastErrorTimeRef.current < backoffRef.current) {
      logger.debug('Aircraft', `API: backing off for ${Math.round(backoffRef.current / 1000)}s`);
      return;
    }

    // 진행 중인 요청이 있으면 취소하고 새로 시작
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // 항적은 한반도 전체 + 인근 FIR 트래픽까지 커버하기 위해
      // data.airport(공항 정보 패널/기상 레이더용)와 별도로 한반도 중심 좌표 + 400NM 사용
      const response = await fetch(
        getAircraftApiUrl(
          AIRCRAFT_QUERY_CENTER_LAT,
          AIRCRAFT_QUERY_CENTER_LON,
          AIRCRAFT_QUERY_RADIUS_NM,
        ),
        { signal },
      );

      // 429 Too Many Requests 처리
      if (response.status === 429) {
        lastErrorTimeRef.current = Date.now();
        backoffRef.current = Math.min((backoffRef.current || 15000) * 2, 120000); // 최대 2분
        logger.warn('Aircraft', `API 429: backing off for ${backoffRef.current / 1000}s`);
        setDataHealth(prev => ({ ...prev, isConnected: false, errorCount: prev.errorCount + 1 }));
        return;
      }

      // 성공 시 백오프 리셋
      backoffRef.current = 0;

      const result = await response.json();
      const aircraftData = result.ac || [];

      const processed: AircraftData[] = aircraftData
        // 좌표 유효성 검사: 유효한 위도/경도 범위 내의 항공기만 포함
        .filter((ac: Record<string, unknown>) => isValidCoordinate(ac.lat, ac.lon))
        .map((ac: Record<string, unknown>) => ({
          hex: ac.hex as string,
          callsign: (ac.flight as string)?.trim() || (ac.hex as string),
          type: (ac.t as string) || 'Unknown',
          category: (ac.category as string) || 'A0',
          lat: ac.lat as number,
          lon: ac.lon as number,
          altitude_ft: (ac.alt_baro as number) ?? (ac.alt_geom as number) ?? 0,
          altitude_m: ftToM((ac.alt_baro as number) ?? (ac.alt_geom as number) ?? 0),
          ground_speed: (ac.gs as number) ?? 0,
          track: (ac.track as number) ?? 0,
          on_ground: ac.alt_baro === 'ground' || !!ac.ground,
          vertical_rate: (ac.baro_rate as number) ?? (ac.geom_rate as number) ?? 0,
          squawk: (ac.squawk as string) || '',
          emergency: (ac.emergency as string) || '',
          registration: (ac.r as string) || '',
          icao_type: (ac.t as string) || '',
          operator: (ac.ownOp as string) || '',
          origin: (ac.orig as string) || '',
          destination: (ac.dest as string) || '',
          nav_altitude: (ac.nav_altitude_mcp as number) ?? (ac.nav_altitude_fms as number) ?? null,
          nav_heading: (ac.nav_heading as number) ?? null,
          ias: (ac.ias as number) ?? 0,
          tas: (ac.tas as number) ?? 0,
          mach: (ac.mach as number) ?? 0,
          mag_heading: (ac.mag_heading as number) ?? (ac.track as number) ?? 0,
          true_heading: (ac.true_heading as number) ?? (ac.track as number) ?? 0,
          timestamp: Date.now(),
        }));

      // 새로운 항공기들의 trace 로드 (이미 로드한 항공기 제외)
      const newAircraft = processed.filter(ac => !tracesLoadedRef.current.has(ac.hex) && !ac.on_ground);
      if (newAircraft.length > 0) {
        // 처음 로드 시에도 5개로 제한 (외부 접속 성능 최적화)
        const isFirstLoad = tracesLoadedRef.current.size === 0;
        const maxLoad = isFirstLoad ? 5 : 3;
        const toLoad = newAircraft.slice(0, maxLoad);

        // 병렬로 trace 로드 (처음에는 모두, 이후에는 일부) - signal 전달하여 취소 가능
        const tracePromises = toLoad.map(ac => loadAircraftTrace(ac.hex, signal).then(trace => ({ hex: ac.hex, trace })));
        const traces = await Promise.all(tracePromises);

        // ref와 state 모두 업데이트 (ref는 fetchAircraftData 내부용, state는 외부 노출용)
        toLoad.forEach(ac => tracesLoadedRef.current.add(ac.hex));
        setTracesLoaded(prev => {
          const next = new Set(prev);
          toLoad.forEach(ac => next.add(ac.hex));
          return next;
        });

        setAircraftTrails(prev => {
          const trails = { ...prev };
          traces.forEach(({ hex, trace }) => {
            if (trace && trace.length > 0) {
              trails[hex] = trace;
            }
          });
          return trails;
        });
      }

      // Maximum trail points per aircraft to prevent memory issues
      const MAX_TRAIL_POINTS = 500;

      setAircraftTrails(prev => {
        const trails = { ...prev };
        processed.forEach(ac => {
          if (!trails[ac.hex]) trails[ac.hex] = [];
          const trail = trails[ac.hex];
          if (!trail) return;
          const last = trail[trail.length - 1];
          if (!last || last.lat !== ac.lat || last.lon !== ac.lon) {
            trail.push({ lat: ac.lat, lon: ac.lon, altitude_m: ac.altitude_m, altitude_ft: ac.altitude_ft, timestamp: ac.timestamp });
          }
          // Clean up old trail points by time
          let firstPoint = trail[0];
          while (trail.length > 0 && firstPoint && Date.now() - firstPoint.timestamp > trailDuration) {
            trail.shift();
            firstPoint = trail[0];
          }
          // Also limit by max points to prevent memory issues
          while (trail.length > MAX_TRAIL_POINTS) trail.shift();
        });
        const activeHexes = new Set(processed.map(ac => ac.hex));
        Object.keys(trails).forEach(hex => { if (!activeHexes.has(hex)) delete trails[hex]; });
        return trails;
      });

      // Clean up tracesLoaded for aircraft that left the area
      const activeHexes = new Set(processed.map(ac => ac.hex));
      setTracesLoaded(prev => {
        const next = new Set<string>();
        prev.forEach(hex => {
          if (activeHexes.has(hex)) next.add(hex);
        });
        return next;
      });
      // Also update the ref
      const newTracesLoaded = new Set<string>();
      tracesLoadedRef.current.forEach(hex => {
        if (activeHexes.has(hex)) newTracesLoaded.add(hex);
      });
      tracesLoadedRef.current = newTracesLoaded;
      setAircraft(processed);

      // 데이터 헬스 업데이트
      setDataHealth({
        isConnected: processed.length > 0,
        lastSuccessTime: Date.now(),
        aircraftCount: processed.length,
        errorCount: 0
      });
    } catch (e) {
      // AbortError는 정상적인 cleanup이므로 무시
      if (e instanceof Error && e.name === 'AbortError') return;
      logger.error('Aircraft', 'Fetch failed', e as Error);
      setDataHealth(prev => ({ ...prev, isConnected: false, errorCount: prev.errorCount + 1 }));
    }
  }, [data?.airport, trailDuration, loadAircraftTrace]);

  useEffect(() => {
    if (!showAircraft || !data?.airport || !mapLoaded) return;

    fetchAircraftData();
    aircraftIntervalRef.current = setInterval(fetchAircraftData, AIRCRAFT_UPDATE_INTERVAL);

    return () => {
      // Cleanup: interval 정리 및 진행 중인 요청 취소
      if (aircraftIntervalRef.current) clearInterval(aircraftIntervalRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [showAircraft, data?.airport, mapLoaded, fetchAircraftData]);

  return {
    aircraft,
    setAircraft,
    aircraftTrails,
    setAircraftTrails,
    tracesLoaded,
    setTracesLoaded,
    dataHealth
  };
}
