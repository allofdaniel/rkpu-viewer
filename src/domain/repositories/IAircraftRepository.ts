/**
 * Aircraft Repository Interface
 * DO-278A 요구사항 추적: SRS-ACF-002
 *
 * 항공기 데이터 접근을 위한 추상화 인터페이스
 */

import type { AircraftPosition, AircraftDetails, AircraftTrailPoint, Coordinate } from '@/types';

/**
 * 항공기 조회 옵션
 */
export interface FetchAircraftOptions {
  center: Coordinate;
  radiusNM: number;
}

/**
 * 항공기 Repository 인터페이스
 */
export interface IAircraftRepository {
  /**
   * 특정 위치 주변의 항공기 목록 조회
   */
  fetchNearby(options: FetchAircraftOptions): Promise<AircraftPosition[]>;

  /**
   * 특정 항공기의 항적 조회
   * @param hex ICAO 24-bit 주소
   */
  fetchTrace(hex: string): Promise<AircraftTrailPoint[]>;

  /**
   * 특정 항공기의 상세 정보 조회
   * @param hex ICAO 24-bit 주소
   */
  fetchDetails(hex: string): Promise<AircraftDetails | null>;

  /**
   * 항공기 사진 URL 조회
   * @param hex ICAO 24-bit 주소
   * @param registration 등록번호
   */
  fetchPhotoUrl(hex: string, registration?: string): Promise<string | null>;
}

/**
 * 빈 항공기 Repository (테스트/폴백용)
 */
export class NullAircraftRepository implements IAircraftRepository {
  async fetchNearby(): Promise<AircraftPosition[]> {
    return [];
  }

  async fetchTrace(): Promise<AircraftTrailPoint[]> {
    return [];
  }

  async fetchDetails(): Promise<AircraftDetails | null> {
    return null;
  }

  async fetchPhotoUrl(): Promise<string | null> {
    return null;
  }
}
