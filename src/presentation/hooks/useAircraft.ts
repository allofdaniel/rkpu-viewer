/**
 * useAircraft Hook
 * DO-278A 요구사항 추적: SRS-HOOK-001
 *
 * 항공기 데이터 관리를 위한 React Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AircraftPosition, AircraftTrailPoint, Coordinate } from '@/types';
import { getAircraftRepository } from '@/infrastructure/repositories/AircraftRepository';
import {
  filterAbnormalJumps,
  detectFlightPhase,
} from '@/domain/entities/Aircraft';
import {
  AIRCRAFT_UPDATE_INTERVAL,
  MAX_TRAIL_POINTS,
  DEFAULT_TRAIL_DURATION,
} from '@/config/constants';

interface UseAircraftOptions {
  center: Coordinate;
  radiusNM?: number;
  updateInterval?: number;
  autoUpdate?: boolean;
  trailDuration?: number;
}

interface UseAircraftReturn {
  aircraft: AircraftPosition[];
  selectedAircraft: AircraftPosition | null;
  trails: Map<string, AircraftTrailPoint[]>;
  isLoading: boolean;
  error: Error | null;
  lastUpdate: Date | null;
  selectAircraft: (hex: string | null) => void;
  refreshAircraft: () => Promise<void>;
  clearTrails: () => void;
}

/**
 * 항공기 데이터 관리 Hook
 */
export function useAircraft(options: UseAircraftOptions): UseAircraftReturn {
  const {
    center,
    radiusNM = 100,
    updateInterval = AIRCRAFT_UPDATE_INTERVAL,
    autoUpdate = true,
    trailDuration = DEFAULT_TRAIL_DURATION,
  } = options;

  const [aircraft, setAircraft] = useState<AircraftPosition[]>([]);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [trails, setTrails] = useState<Map<string, AircraftTrailPoint[]>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const repositoryRef = useRef(getAircraftRepository());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 항공기 데이터 갱신
   */
  const refreshAircraft = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const positions = await repositoryRef.current.fetchNearby(center, radiusNM);

      // 비행 단계 감지 추가
      const enrichedPositions = positions.map((ac) => ({
        ...ac,
        flightPhase: detectFlightPhase(ac, center),
      }));

      setAircraft(enrichedPositions);
      setLastUpdate(new Date());

      // 항적 업데이트
      updateTrails(enrichedPositions);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [center, radiusNM]);

  /**
   * 항적 업데이트
   */
  const updateTrails = useCallback(
    (currentAircraft: AircraftPosition[]) => {
      const now = Date.now();
      const cutoffTime = now - trailDuration;

      setTrails((prevTrails) => {
        const newTrails = new Map(prevTrails);

        currentAircraft.forEach((ac) => {
          if (ac.lat === undefined || ac.lon === undefined) return;

          const existingTrail = newTrails.get(ac.hex) || [];

          // 새 포인트 추가
          const newPoint: AircraftTrailPoint = {
            lat: ac.lat,
            lon: ac.lon,
            altitude: ac.altitude_baro,
            timestamp: now,
            ground_speed: ac.ground_speed,
            track: ac.track,
          };

          // 비정상 점프 필터링 및 시간 기반 필터링
          let updatedTrail = [...existingTrail, newPoint]
            .filter((p) => p.timestamp > cutoffTime)
            .slice(-MAX_TRAIL_POINTS);

          updatedTrail = filterAbnormalJumps(updatedTrail);

          newTrails.set(ac.hex, updatedTrail);
        });

        // 더 이상 추적되지 않는 항공기 제거
        const currentHexes = new Set(currentAircraft.map((ac) => ac.hex));
        for (const hex of newTrails.keys()) {
          if (!currentHexes.has(hex)) {
            const trail = newTrails.get(hex) || [];
            const lastPoint = trail[trail.length - 1];
            if (lastPoint && now - lastPoint.timestamp > trailDuration) {
              newTrails.delete(hex);
            }
          }
        }

        return newTrails;
      });
    },
    [trailDuration]
  );

  /**
   * 항공기 선택
   */
  const selectAircraft = useCallback((hex: string | null) => {
    setSelectedHex(hex);
  }, []);

  /**
   * 항적 초기화
   */
  const clearTrails = useCallback(() => {
    setTrails(new Map());
  }, []);

  /**
   * 선택된 항공기 계산
   */
  const selectedAircraft = selectedHex
    ? aircraft.find((ac) => ac.hex === selectedHex) || null
    : null;

  /**
   * 자동 갱신 설정
   */
  useEffect(() => {
    if (!autoUpdate) return;

    // 초기 로드
    refreshAircraft();

    // 주기적 갱신
    intervalRef.current = setInterval(refreshAircraft, updateInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoUpdate, updateInterval, refreshAircraft]);

  /**
   * 중심점 변경 시 항적 초기화
   */
  useEffect(() => {
    clearTrails();
  }, [center.lat, center.lon, clearTrails]);

  return {
    aircraft,
    selectedAircraft,
    trails,
    isLoading,
    error,
    lastUpdate,
    selectAircraft,
    refreshAircraft,
    clearTrails,
  };
}

export default useAircraft;
