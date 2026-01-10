/**
 * GIS API Client
 * DO-278A 요구사항 추적: SRS-API-004
 *
 * GIS 데이터 (웨이포인트, 항로, 공역, 비행절차 등) API 클라이언트
 */

import { BaseApiClient, SimpleCache } from './BaseApiClient';
import type {
  Waypoint,
  Route,
  Airspace,
  FlightProcedure,
  Navaid,
  Coordinate,
} from '@/types';
import { API_BASE_URL } from '@/config/constants';

/**
 * 공항 항공 데이터 응답 형식
 */
interface AviationDataResponse {
  waypoints?: WaypointRaw[];
  navaids?: NavaidRaw[];
  routes?: RouteRaw[];
  airspaces?: AirspaceRaw[];
  procedures?: {
    sids?: ProcedureRaw[];
    stars?: ProcedureRaw[];
    approaches?: ProcedureRaw[];
  };
  runways?: RunwayRaw[];
  obstacles?: ObstacleRaw[];
}

interface WaypointRaw {
  id: string;
  name: string;
  type?: string;
  lat: number;
  lon: number;
  ident?: string;
  usage?: string;
}

interface NavaidRaw {
  id: string;
  name: string;
  type: string; // VOR, NDB, DME, ILS, etc.
  lat: number;
  lon: number;
  freq?: number;
  ident?: string;
  elevation?: number;
}

interface RouteRaw {
  id: string;
  name: string;
  type?: string;
  waypoints: Array<{
    id: string;
    lat: number;
    lon: number;
    name?: string;
  }>;
}

interface AirspaceRaw {
  id: string;
  name: string;
  type: string; // TMA, CTR, P, R, D, etc.
  class?: string;
  lower?: number;
  upper?: number;
  polygon: Array<{ lat: number; lon: number }>;
}

interface ProcedureRaw {
  id: string;
  name: string;
  type: string;
  runway?: string;
  waypoints: Array<{
    id: string;
    lat: number;
    lon: number;
    name?: string;
    altitude?: number;
    speed?: number;
  }>;
  transitions?: Array<{
    name: string;
    waypoints: Array<{
      id: string;
      lat: number;
      lon: number;
    }>;
  }>;
}

interface RunwayRaw {
  id: string;
  name: string;
  heading: number;
  length: number;
  width: number;
  surface?: string;
  threshold: { lat: number; lon: number };
  end: { lat: number; lon: number };
  elevation?: number;
}

interface ObstacleRaw {
  id: string;
  name?: string;
  type: string;
  lat: number;
  lon: number;
  height_agl: number;
  height_msl: number;
  lighting?: boolean;
}

/**
 * 전국 공역 데이터 응답 형식
 */
interface KoreaAirspaceResponse {
  waypoints?: WaypointRaw[];
  routes?: RouteRaw[];
  airspaces?: AirspaceRaw[];
  navaids?: NavaidRaw[];
}

/**
 * 비행 경로 조회 응답 형식
 */
interface FlightRouteResponse {
  route?: {
    departure: string;
    arrival: string;
    waypoints: Array<{
      id: string;
      name: string;
      lat: number;
      lon: number;
      type?: string;
    }>;
  };
  error?: string;
}

/**
 * GIS API 클라이언트
 */
export class GISApiClient extends BaseApiClient {
  private aviationDataCache: SimpleCache<AviationDataResponse>;
  private koreaAirspaceCache: SimpleCache<KoreaAirspaceResponse>;
  private flightRouteCache: SimpleCache<FlightRouteResponse>;

  constructor(options?: { timeout?: number; retries?: number }) {
    super(API_BASE_URL, options);
    // GIS 데이터는 자주 변경되지 않으므로 긴 캐시 시간
    this.aviationDataCache = new SimpleCache<AviationDataResponse>(3600000); // 1시간
    this.koreaAirspaceCache = new SimpleCache<KoreaAirspaceResponse>(3600000); // 1시간
    this.flightRouteCache = new SimpleCache<FlightRouteResponse>(300000); // 5분
  }

  /**
   * 공항 항공 데이터 로드 (로컬 JSON)
   */
  async loadAviationData(airport: string = 'RKPU'): Promise<AviationDataResponse> {
    const cacheKey = `aviation-${airport}`;
    const cached = this.aviationDataCache.get(cacheKey);
    if (cached) return cached;

    // 로컬 JSON 파일에서 로드
    const response = await fetch('/aviation_data.json');
    if (!response.ok) {
      throw new Error('Failed to load aviation data');
    }

    const data = await response.json();
    this.aviationDataCache.set(cacheKey, data);
    return data;
  }

  /**
   * 전국 공역 데이터 로드 (로컬 JSON)
   */
  async loadKoreaAirspace(): Promise<KoreaAirspaceResponse> {
    const cacheKey = 'korea-airspace';
    const cached = this.koreaAirspaceCache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch('/data/korea_airspace.json');
    if (!response.ok) {
      throw new Error('Failed to load Korea airspace data');
    }

    const data = await response.json();
    this.koreaAirspaceCache.set(cacheKey, data);
    return data;
  }

  /**
   * 비행 경로 조회 (API)
   */
  async fetchFlightRoute(
    departure: string,
    arrival: string,
    via?: string[]
  ): Promise<FlightRouteResponse> {
    const cacheKey = `route-${departure}-${arrival}-${via?.join(',') || ''}`;
    const cached = this.flightRouteCache.get(cacheKey);
    if (cached) return cached;

    const queryString = this.buildQueryString({
      dep: departure,
      arr: arrival,
      via: via?.join(','),
    });

    const response = await this.get<FlightRouteResponse>(
      `/api/flight-route${queryString}`
    );

    this.flightRouteCache.set(cacheKey, response);
    return response;
  }

  /**
   * 웨이포인트 목록 조회
   */
  async getWaypoints(source: 'local' | 'national' = 'local'): Promise<Waypoint[]> {
    if (source === 'national') {
      const data = await this.loadKoreaAirspace();
      return this.mapToWaypoints(data.waypoints || []);
    }

    const data = await this.loadAviationData();
    return this.mapToWaypoints(data.waypoints || []);
  }

  /**
   * 항로 목록 조회
   */
  async getRoutes(source: 'local' | 'national' = 'local'): Promise<Route[]> {
    if (source === 'national') {
      const data = await this.loadKoreaAirspace();
      return this.mapToRoutes(data.routes || []);
    }

    const data = await this.loadAviationData();
    return this.mapToRoutes(data.routes || []);
  }

  /**
   * 공역 목록 조회
   */
  async getAirspaces(source: 'local' | 'national' = 'local'): Promise<Airspace[]> {
    if (source === 'national') {
      const data = await this.loadKoreaAirspace();
      return this.mapToAirspaces(data.airspaces || []);
    }

    const data = await this.loadAviationData();
    return this.mapToAirspaces(data.airspaces || []);
  }

  /**
   * 비행절차 목록 조회
   */
  async getProcedures(
    type?: 'SID' | 'STAR' | 'APPROACH',
    runway?: string
  ): Promise<FlightProcedure[]> {
    const data = await this.loadAviationData();
    const procedures: FlightProcedure[] = [];

    if (!type || type === 'SID') {
      procedures.push(
        ...this.mapToProcedures(data.procedures?.sids || [], 'SID')
      );
    }
    if (!type || type === 'STAR') {
      procedures.push(
        ...this.mapToProcedures(data.procedures?.stars || [], 'STAR')
      );
    }
    if (!type || type === 'APPROACH') {
      procedures.push(
        ...this.mapToProcedures(data.procedures?.approaches || [], 'APPROACH')
      );
    }

    // 활주로 필터링
    if (runway) {
      return procedures.filter((p) => p.runway === runway);
    }

    return procedures;
  }

  /**
   * NAVAID 목록 조회
   */
  async getNavaids(source: 'local' | 'national' = 'local'): Promise<Navaid[]> {
    if (source === 'national') {
      const data = await this.loadKoreaAirspace();
      return this.mapToNavaids(data.navaids || []);
    }

    const data = await this.loadAviationData();
    return this.mapToNavaids(data.navaids || []);
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
    const data = await this.loadAviationData();
    return (data.obstacles || []).map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      lat: o.lat,
      lon: o.lon,
      heightAgl: o.height_agl,
      heightMsl: o.height_msl,
      lighting: o.lighting,
    }));
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
    const data = await this.loadAviationData();
    return (data.runways || []).map((r) => ({
      id: r.id,
      name: r.name,
      heading: r.heading,
      length: r.length,
      width: r.width,
      surface: r.surface,
      threshold: r.threshold,
      end: r.end,
      elevation: r.elevation,
    }));
  }

  /**
   * Raw 데이터를 Waypoint로 변환
   */
  private mapToWaypoints(raw: WaypointRaw[]): Waypoint[] {
    return raw.map((w) => ({
      ident: w.ident || w.id || w.name,
      name: w.name || w.ident || w.id,
      type: (w.type as Waypoint['type']) || 'waypoint',
      lat: w.lat,
      lon: w.lon,
    }));
  }

  /**
   * Raw 데이터를 Route로 변환
   */
  private mapToRoutes(raw: RouteRaw[]): Route[] {
    return raw.map((r) => ({
      name: r.name,
      type: (r.type as Route['type']) || 'OTHER',
      points: r.waypoints.map((w) => ({
        ident: w.id || w.name,
        name: w.name || w.id,
        type: 'waypoint' as const,
        lat: w.lat,
        lon: w.lon,
      })),
    }));
  }

  /**
   * Raw 데이터를 Airspace로 변환
   */
  private mapToAirspaces(raw: AirspaceRaw[]): Airspace[] {
    return raw.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type as Airspace['type'],
      class: a.class,
      lowerLimit: a.lower,
      upperLimit: a.upper,
      polygon: a.polygon,
    }));
  }

  /**
   * Raw 데이터를 FlightProcedure로 변환
   */
  private mapToProcedures(
    raw: ProcedureRaw[],
    type: FlightProcedure['type']
  ): FlightProcedure[] {
    return raw.map((p) => ({
      name: p.name,
      displayName: `${p.name} RWY${p.runway || ''}`,
      type,
      runway: p.runway || '',
      segments: [
        {
          name: 'main',
          coordinates: p.waypoints.map((w) => ({
            lat: w.lat,
            lon: w.lon,
            altitude: w.altitude,
          })),
        },
        ...(p.transitions || []).map((t) => ({
          name: t.name,
          coordinates: t.waypoints.map((w) => ({
            lat: w.lat,
            lon: w.lon,
          })),
        })),
      ],
    }));
  }

  /**
   * Raw 데이터를 Navaid로 변환
   */
  private mapToNavaids(raw: NavaidRaw[]): Navaid[] {
    return raw.map((n) => ({
      ident: n.ident || n.id || n.name,
      name: n.name,
      type: 'navaid' as const,
      navaidType: (n.type as Navaid['navaidType']) || 'VOR',
      lat: n.lat,
      lon: n.lon,
      frequency: n.freq,
    }));
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    this.aviationDataCache.clear();
    this.koreaAirspaceCache.clear();
    this.flightRouteCache.clear();
  }
}

/**
 * 싱글톤 인스턴스
 */
let gisApiClientInstance: GISApiClient | null = null;

export function getGISApiClient(): GISApiClient {
  if (!gisApiClientInstance) {
    gisApiClientInstance = new GISApiClient();
  }
  return gisApiClientInstance;
}
