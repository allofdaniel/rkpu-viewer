/**
 * useGIS Hook
 * DO-278A 요구사항 추적: SRS-HOOK-003
 *
 * GIS 데이터 관리를 위한 React Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Waypoint,
  Route,
  Airspace,
  FlightProcedure,
  Navaid,
  Coordinate,
} from '@/types';
import { getGISRepository } from '@/infrastructure/repositories/GISRepository';

interface UseGISOptions {
  airport?: string;
  loadNational?: boolean;
  autoLoad?: boolean;
}

interface UseGISReturn {
  waypoints: Waypoint[];
  routes: Route[];
  airspaces: Airspace[];
  procedures: FlightProcedure[];
  navaids: Navaid[];
  obstacles: Array<{
    id: string;
    name?: string;
    type: string;
    lat: number;
    lon: number;
    heightAgl: number;
    heightMsl: number;
    lighting?: boolean;
  }>;
  runways: Array<{
    id: string;
    name: string;
    heading: number;
    length: number;
    width: number;
    surface?: string;
    threshold: Coordinate;
    end: Coordinate;
    elevation?: number;
  }>;
  nationalWaypoints: Waypoint[];
  nationalRoutes: Route[];
  nationalAirspaces: Airspace[];
  isLoading: boolean;
  error: Error | null;
  loadLocalData: () => Promise<void>;
  loadNationalData: () => Promise<void>;
  getWaypointById: (id: string) => Waypoint | undefined;
  getProceduresByRunway: (runway: string) => FlightProcedure[];
  getAirspacesByType: (type: string) => Airspace[];
}

/**
 * GIS 데이터 관리 Hook
 */
export function useGIS(options: UseGISOptions = {}): UseGISReturn {
  const { airport = 'RKPU', loadNational = false, autoLoad = true } = options;

  // 로컬 데이터 상태
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [airspaces, setAirspaces] = useState<Airspace[]>([]);
  const [procedures, setProcedures] = useState<FlightProcedure[]>([]);
  const [navaids, setNavaids] = useState<Navaid[]>([]);
  const [obstacles, setObstacles] = useState<
    Array<{
      id: string;
      name?: string;
      type: string;
      lat: number;
      lon: number;
      heightAgl: number;
      heightMsl: number;
      lighting?: boolean;
    }>
  >([]);
  const [runways, setRunways] = useState<
    Array<{
      id: string;
      name: string;
      heading: number;
      length: number;
      width: number;
      surface?: string;
      threshold: Coordinate;
      end: Coordinate;
      elevation?: number;
    }>
  >([]);

  // 전국 데이터 상태
  const [nationalWaypoints, setNationalWaypoints] = useState<Waypoint[]>([]);
  const [nationalRoutes, setNationalRoutes] = useState<Route[]>([]);
  const [nationalAirspaces, setNationalAirspaces] = useState<Airspace[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const repositoryRef = useRef(getGISRepository());

  /**
   * 로컬 항공 데이터 로드
   */
  const loadLocalData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [aviationData, obstacleData, runwayData] = await Promise.all([
        repositoryRef.current.loadAviationData(airport),
        repositoryRef.current.getObstacles(),
        repositoryRef.current.getRunways(),
      ]);

      setWaypoints(aviationData.waypoints);
      setRoutes(aviationData.routes);
      setAirspaces(aviationData.airspaces);
      setProcedures(aviationData.procedures);
      setNavaids(aviationData.navaids);
      setObstacles(obstacleData);
      setRunways(runwayData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [airport]);

  /**
   * 전국 공역 데이터 로드
   */
  const loadNationalData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const nationalData = await repositoryRef.current.loadKoreaAirspace();

      setNationalWaypoints(nationalData.waypoints);
      setNationalRoutes(nationalData.routes);
      setNationalAirspaces(nationalData.airspaces);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * ID로 웨이포인트 조회
   */
  const getWaypointById = useCallback(
    (id: string): Waypoint | undefined => {
      return (
        waypoints.find((w) => w.id === id) ||
        nationalWaypoints.find((w) => w.id === id)
      );
    },
    [waypoints, nationalWaypoints]
  );

  /**
   * 활주로별 비행절차 조회
   */
  const getProceduresByRunway = useCallback(
    (runway: string): FlightProcedure[] => {
      return procedures.filter((p) => p.runway === runway);
    },
    [procedures]
  );

  /**
   * 타입별 공역 조회
   */
  const getAirspacesByType = useCallback(
    (type: string): Airspace[] => {
      const localFiltered = airspaces.filter((a) => a.type === type);
      const nationalFiltered = nationalAirspaces.filter((a) => a.type === type);
      return [...localFiltered, ...nationalFiltered];
    },
    [airspaces, nationalAirspaces]
  );

  /**
   * 자동 로드
   */
  useEffect(() => {
    if (!autoLoad) return;

    loadLocalData();

    if (loadNational) {
      loadNationalData();
    }
  }, [autoLoad, loadNational, loadLocalData, loadNationalData]);

  return {
    waypoints,
    routes,
    airspaces,
    procedures,
    navaids,
    obstacles,
    runways,
    nationalWaypoints,
    nationalRoutes,
    nationalAirspaces,
    isLoading,
    error,
    loadLocalData,
    loadNationalData,
    getWaypointById,
    getProceduresByRunway,
    getAirspacesByType,
  };
}

export default useGIS;
