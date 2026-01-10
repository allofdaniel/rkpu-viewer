/**
 * GIS Repository Implementation
 * DO-278A 요구사항 추적: SRS-REPO-004
 *
 * IGISRepository 인터페이스 구현
 */

import type { IGISRepository } from '@/domain/repositories/IGISRepository';
import type {
  Waypoint,
  Route,
  Airspace,
  FlightProcedure,
  Navaid,
  Coordinate,
} from '@/types';
import { GISApiClient, getGISApiClient } from '../api/clients/GISApiClient';

/**
 * GIS Repository 구현체
 */
export class GISRepository implements IGISRepository {
  private apiClient: GISApiClient;

  constructor(apiClient?: GISApiClient) {
    this.apiClient = apiClient || getGISApiClient();
  }

  /**
   * 공항 항공 데이터 로드
   */
  async loadAviationData(airport?: string): Promise<{
    waypoints: Waypoint[];
    routes: Route[];
    airspaces: Airspace[];
    procedures: FlightProcedure[];
    navaids: Navaid[];
  }> {
    const [waypoints, routes, airspaces, sids, stars, approaches, navaids] =
      await Promise.all([
        this.apiClient.getWaypoints('local'),
        this.apiClient.getRoutes('local'),
        this.apiClient.getAirspaces('local'),
        this.apiClient.getProcedures('SID'),
        this.apiClient.getProcedures('STAR'),
        this.apiClient.getProcedures('APPROACH'),
        this.apiClient.getNavaids('local'),
      ]);

    return {
      waypoints,
      routes,
      airspaces,
      procedures: [...sids, ...stars, ...approaches],
      navaids,
    };
  }

  /**
   * 전국 공역 데이터 로드
   */
  async loadKoreaAirspace(): Promise<{
    waypoints: Waypoint[];
    routes: Route[];
    airspaces: Airspace[];
    navaids: Navaid[];
  }> {
    const [waypoints, routes, airspaces, navaids] = await Promise.all([
      this.apiClient.getWaypoints('national'),
      this.apiClient.getRoutes('national'),
      this.apiClient.getAirspaces('national'),
      this.apiClient.getNavaids('national'),
    ]);

    return {
      waypoints,
      routes,
      airspaces,
      navaids,
    };
  }

  /**
   * 웨이포인트 목록 조회
   */
  async getWaypoints(options?: {
    type?: string;
    bounds?: { ne: Coordinate; sw: Coordinate };
  }): Promise<Waypoint[]> {
    const waypoints = await this.apiClient.getWaypoints('local');

    let filtered = waypoints;

    // 타입 필터링
    if (options?.type) {
      filtered = filtered.filter((w) => w.type === options.type);
    }

    // 범위 필터링
    if (options?.bounds) {
      const { ne, sw } = options.bounds;
      filtered = filtered.filter(
        (w) =>
          w.lat >= sw.lat && w.lat <= ne.lat && w.lon >= sw.lon && w.lon <= ne.lon
      );
    }

    return filtered;
  }

  /**
   * 항로 목록 조회
   */
  async getRoutes(options?: { type?: string }): Promise<Route[]> {
    const routes = await this.apiClient.getRoutes('local');

    if (options?.type) {
      return routes.filter((r) => r.type === options.type);
    }

    return routes;
  }

  /**
   * 공역 목록 조회
   */
  async getAirspaces(options?: {
    type?: string;
    bounds?: { ne: Coordinate; sw: Coordinate };
  }): Promise<Airspace[]> {
    const airspaces = await this.apiClient.getAirspaces('local');

    let filtered = airspaces;

    // 타입 필터링
    if (options?.type) {
      filtered = filtered.filter((a) => a.type === options.type);
    }

    // 범위 필터링 (공역 중심점 기준)
    if (options?.bounds) {
      const { ne, sw } = options.bounds;
      filtered = filtered.filter((a) => {
        // 폴리곤 중심점 계산
        const center = this.calculatePolygonCenter(a.polygon);
        return (
          center.lat >= sw.lat &&
          center.lat <= ne.lat &&
          center.lon >= sw.lon &&
          center.lon <= ne.lon
        );
      });
    }

    return filtered;
  }

  /**
   * 비행절차 목록 조회
   */
  async getProcedures(options?: {
    type?: 'SID' | 'STAR' | 'APPROACH';
    runway?: string;
  }): Promise<FlightProcedure[]> {
    return this.apiClient.getProcedures(options?.type, options?.runway);
  }

  /**
   * NAVAID 목록 조회
   */
  async getNavaids(options?: {
    type?: string;
    bounds?: { ne: Coordinate; sw: Coordinate };
  }): Promise<Navaid[]> {
    const navaids = await this.apiClient.getNavaids('local');

    let filtered = navaids;

    if (options?.type) {
      filtered = filtered.filter((n) => n.type === options.type);
    }

    if (options?.bounds) {
      const { ne, sw } = options.bounds;
      filtered = filtered.filter(
        (n) =>
          n.lat >= sw.lat && n.lat <= ne.lat && n.lon >= sw.lon && n.lon <= ne.lon
      );
    }

    return filtered;
  }

  /**
   * 장애물 목록 조회
   */
  async getObstacles(): Promise<
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
  > {
    return this.apiClient.getObstacles();
  }

  /**
   * 활주로 목록 조회
   */
  async getRunways(): Promise<
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
  > {
    return this.apiClient.getRunways();
  }

  /**
   * 비행 경로 조회
   */
  async fetchFlightRoute(
    departure: string,
    arrival: string,
    via?: string[]
  ): Promise<{
    waypoints: Waypoint[];
    distance?: number;
  }> {
    const response = await this.apiClient.fetchFlightRoute(
      departure,
      arrival,
      via
    );

    if (!response.route) {
      return { waypoints: [] };
    }

    return {
      waypoints: response.route.waypoints.map((w) => ({
        id: w.id,
        name: w.name,
        type: (w.type as Waypoint['type']) || 'waypoint',
        lat: w.lat,
        lon: w.lon,
      })),
    };
  }

  /**
   * 폴리곤 중심점 계산
   */
  private calculatePolygonCenter(polygon: Coordinate[]): Coordinate {
    if (polygon.length === 0) {
      return { lat: 0, lon: 0 };
    }

    const sum = polygon.reduce(
      (acc, point) => ({
        lat: acc.lat + point.lat,
        lon: acc.lon + point.lon,
      }),
      { lat: 0, lon: 0 }
    );

    return {
      lat: sum.lat / polygon.length,
      lon: sum.lon / polygon.length,
    };
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    this.apiClient.clearCache();
  }
}

/**
 * 싱글톤 인스턴스
 */
let gisRepositoryInstance: GISRepository | null = null;

export function getGISRepository(): GISRepository {
  if (!gisRepositoryInstance) {
    gisRepositoryInstance = new GISRepository();
  }
  return gisRepositoryInstance;
}
