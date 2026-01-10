/**
 * Aircraft API Client
 * DO-278A 요구사항 추적: SRS-API-002
 *
 * airplanes.live API 연동 클라이언트
 */

import { BaseApiClient, SimpleCache } from './BaseApiClient';
import type { AircraftPosition, AircraftTrailPoint, Coordinate } from '@/types';
import { API_BASE_URL } from '@/config/constants';

/**
 * API 응답 형식
 */
interface AircraftApiResponse {
  ac: AircraftApiItem[];
  msg?: string;
  now?: number;
  total?: number;
  ctime?: number;
  ptime?: number;
}

interface AircraftApiItem {
  hex: string;
  type?: string;
  flight?: string;
  r?: string; // registration
  t?: string; // aircraft type
  desc?: string;
  ownOp?: string;
  year?: number;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number; // ground speed (knots)
  tas?: number; // true airspeed
  ias?: number; // indicated airspeed
  mach?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  nav_qnh?: number;
  nav_altitude_mcp?: number;
  nav_heading?: number;
  nic?: number;
  rc?: number;
  seen?: number;
  seen_pos?: number;
  rssi?: number;
  messages?: number;
  dst?: number; // distance from center point
}

interface PhotoApiResponse {
  photos?: {
    thumbnail?: { src: string };
    thumbnail_large?: { src: string };
    medium?: { src: string };
    large?: { src: string };
  }[];
}

/**
 * 항공기 API 클라이언트
 */
export class AircraftApiClient extends BaseApiClient {
  private positionCache: SimpleCache<AircraftPosition[]>;
  private trailCache: SimpleCache<AircraftTrailPoint[]>;
  private photoCache: SimpleCache<string>;

  constructor(options?: { timeout?: number; retries?: number }) {
    super(API_BASE_URL, options);
    this.positionCache = new SimpleCache<AircraftPosition[]>(3000); // 3초 캐시
    this.trailCache = new SimpleCache<AircraftTrailPoint[]>(5000); // 5초 캐시
    this.photoCache = new SimpleCache<string>(3600000); // 1시간 캐시
  }

  /**
   * 특정 반경 내 항공기 위치 조회
   */
  async fetchNearby(
    center: Coordinate,
    radiusNM: number = 100
  ): Promise<AircraftPosition[]> {
    const cacheKey = `nearby-${center.lat.toFixed(2)}-${center.lon.toFixed(2)}-${radiusNM}`;
    const cached = this.positionCache.get(cacheKey);
    if (cached) return cached;

    const queryString = this.buildQueryString({
      lat: center.lat,
      lon: center.lon,
      radius: radiusNM,
    });

    const response = await this.get<AircraftApiResponse>(`/api/aircraft${queryString}`);
    const positions = this.mapToPositions(response.ac || []);

    this.positionCache.set(cacheKey, positions);
    return positions;
  }

  /**
   * 특정 항공기의 항적 조회
   */
  async fetchTrace(hex: string): Promise<AircraftTrailPoint[]> {
    const cacheKey = `trace-${hex}`;
    const cached = this.trailCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.get<AircraftApiResponse>(`/api/aircraft-trace?hex=${hex}`);

    if (!response.ac || response.ac.length === 0) {
      return [];
    }

    const aircraft = response.ac[0];
    if (!aircraft) return [];
    const trailPoints = this.extractTrailPoints(aircraft);

    this.trailCache.set(cacheKey, trailPoints);
    return trailPoints;
  }

  /**
   * 항공기 상세 정보 조회 (hex 기반)
   */
  async fetchDetails(hex: string): Promise<AircraftPosition | null> {
    const response = await this.get<AircraftApiResponse>(`/api/aircraft-trace?hex=${hex}`);

    if (!response.ac || response.ac.length === 0) {
      return null;
    }

    const positions = this.mapToPositions(response.ac);
    return positions[0] || null;
  }

  /**
   * 항공기 사진 URL 조회
   */
  async fetchPhotoUrl(registration: string): Promise<string | null> {
    if (!registration) return null;

    const cacheKey = `photo-${registration}`;
    const cached = this.photoCache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.get<PhotoApiResponse>(
        `/api/aircraft-photo?reg=${registration}`
      );

      const photoUrl =
        response.photos?.[0]?.thumbnail_large?.src ||
        response.photos?.[0]?.medium?.src ||
        response.photos?.[0]?.thumbnail?.src ||
        null;

      if (photoUrl) {
        this.photoCache.set(cacheKey, photoUrl);
      }
      return photoUrl;
    } catch {
      return null;
    }
  }

  /**
   * API 응답을 AircraftPosition으로 변환
   */
  private mapToPositions(items: AircraftApiItem[]): AircraftPosition[] {
    return items
      .filter((ac) => ac.lat !== undefined && ac.lon !== undefined)
      .map((ac) => ({
        hex: ac.hex,
        lat: ac.lat!,
        lon: ac.lon!,
        altitude_baro: ac.alt_baro === 'ground' ? 0 : ac.alt_baro,
        altitude_geom: ac.alt_geom,
        ground_speed: ac.gs,
        true_airspeed: ac.tas,
        indicated_airspeed: ac.ias,
        mach: ac.mach,
        track: ac.track,
        baro_rate: ac.baro_rate,
        geom_rate: ac.geom_rate,
        squawk: ac.squawk,
        emergency: ac.emergency,
        category: ac.category as AircraftPosition['category'],
        nav_qnh: ac.nav_qnh,
        nav_altitude_mcp: ac.nav_altitude_mcp,
        seen: ac.seen,
        seen_pos: ac.seen_pos,
        rssi: ac.rssi,
        messages: ac.messages,
        flight: ac.flight?.trim(),
        registration: ac.r,
        aircraft_type: ac.t,
        description: ac.desc,
        owner_operator: ac.ownOp,
        year_built: ac.year,
        distance: ac.dst,
      }));
  }

  /**
   * 항공기 데이터에서 항적 포인트 추출
   */
  private extractTrailPoints(aircraft: AircraftApiItem): AircraftTrailPoint[] {
    // airplanes.live는 현재 위치만 반환하므로 단일 포인트로 처리
    if (aircraft.lat === undefined || aircraft.lon === undefined) {
      return [];
    }

    return [
      {
        lat: aircraft.lat,
        lon: aircraft.lon,
        altitude: aircraft.alt_baro === 'ground' ? 0 : aircraft.alt_baro,
        timestamp: Date.now(),
        ground_speed: aircraft.gs,
        track: aircraft.track,
      },
    ];
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    this.positionCache.clear();
    this.trailCache.clear();
    this.photoCache.clear();
  }
}

/**
 * 싱글톤 인스턴스
 */
let aircraftApiClientInstance: AircraftApiClient | null = null;

export function getAircraftApiClient(): AircraftApiClient {
  if (!aircraftApiClientInstance) {
    aircraftApiClientInstance = new AircraftApiClient();
  }
  return aircraftApiClientInstance;
}
