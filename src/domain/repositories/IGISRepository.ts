/**
 * GIS Repository Interface
 * DO-278A 요구사항 추적: SRS-GIS-002
 *
 * GIS 데이터 접근을 위한 추상화 인터페이스
 */

import type { Waypoint, Route, Airspace, FlightProcedure, Airport, Notam } from '@/types';

/**
 * ATC 섹터 데이터
 */
export interface AtcSectorData {
  CTR?: Airspace | Airspace[];
  TMA?: Airspace | Airspace[];
  ACC?: Airspace[];
  FIR?: Airspace;
}

/**
 * 항공 데이터 (aviation_data.json 구조)
 */
export interface AviationData {
  airport: Airport;
  waypoints: Waypoint[];
  navaids: Waypoint[];
  obstacles: ObstacleData[];
  procedures: {
    SID: Record<string, FlightProcedure>;
    STAR: Record<string, FlightProcedure>;
    APPROACH: Record<string, FlightProcedure>;
  };
}

/**
 * 장애물 데이터
 */
export interface ObstacleData {
  type: string;
  lat: number;
  lon: number;
  elevation_amsl_ft: number;
  height_agl_ft?: number;
  lighting?: string;
  remarks?: string;
}

/**
 * 전국 공역 데이터 (korea_airspace.json 구조)
 */
export interface KoreaAirspaceData {
  metadata: {
    source: string;
    airac: string;
    extracted: string;
    url: string;
  };
  waypoints: Waypoint[];
  routes: Route[];
  airspaces: Airspace[];
  navaids: Waypoint[];
}

/**
 * GIS Repository 인터페이스
 */
export interface IGISRepository {
  /**
   * 공항 기본 데이터 로드
   * @param icao ICAO 공항 코드
   */
  loadAviationData(icao: string): Promise<AviationData | null>;

  /**
   * 전국 공역 데이터 로드
   */
  loadKoreaAirspace(): Promise<KoreaAirspaceData | null>;

  /**
   * ATC 섹터 데이터 로드
   */
  loadAtcSectors(): Promise<AtcSectorData | null>;

  /**
   * 웨이포인트 목록 조회
   */
  getWaypoints(): Promise<Waypoint[]>;

  /**
   * 항로 목록 조회
   */
  getRoutes(): Promise<Route[]>;

  /**
   * 공역 목록 조회
   */
  getAirspaces(): Promise<Airspace[]>;

  /**
   * 비행절차 조회
   * @param icao ICAO 공항 코드
   */
  getProcedures(icao: string): Promise<{
    SID: FlightProcedure[];
    STAR: FlightProcedure[];
    APPROACH: FlightProcedure[];
  }>;
}

/**
 * NOTAM Repository 인터페이스
 */
export interface INotamRepository {
  /**
   * NOTAM 목록 조회
   * @param period 조회 기간 (예: '24h', '7d')
   */
  fetchNotams(period: string): Promise<Notam[]>;

  /**
   * 특정 공항의 NOTAM 조회
   * @param icao ICAO 공항 코드
   */
  fetchNotamsForAirport(icao: string): Promise<Notam[]>;

  /**
   * NOTAM 캐시 상태 확인
   * @param period 조회 기간
   */
  getCacheAge(period: string): number | null;
}

/**
 * 빈 GIS Repository (테스트/폴백용)
 */
export class NullGISRepository implements IGISRepository {
  async loadAviationData(): Promise<AviationData | null> {
    return null;
  }

  async loadKoreaAirspace(): Promise<KoreaAirspaceData | null> {
    return null;
  }

  async loadAtcSectors(): Promise<AtcSectorData | null> {
    return null;
  }

  async getWaypoints(): Promise<Waypoint[]> {
    return [];
  }

  async getRoutes(): Promise<Route[]> {
    return [];
  }

  async getAirspaces(): Promise<Airspace[]> {
    return [];
  }

  async getProcedures(): Promise<{
    SID: FlightProcedure[];
    STAR: FlightProcedure[];
    APPROACH: FlightProcedure[];
  }> {
    return { SID: [], STAR: [], APPROACH: [] };
  }
}

/**
 * 빈 NOTAM Repository (테스트/폴백용)
 */
export class NullNotamRepository implements INotamRepository {
  async fetchNotams(): Promise<Notam[]> {
    return [];
  }

  async fetchNotamsForAirport(): Promise<Notam[]> {
    return [];
  }

  getCacheAge(): number | null {
    return null;
  }
}
