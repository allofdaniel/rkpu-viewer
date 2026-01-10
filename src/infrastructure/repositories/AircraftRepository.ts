/**
 * Aircraft Repository Implementation
 * DO-278A 요구사항 추적: SRS-REPO-002
 *
 * IAircraftRepository 인터페이스 구현
 */

import type { IAircraftRepository } from '@/domain/repositories/IAircraftRepository';
import type {
  AircraftPosition,
  AircraftTrailPoint,
  AircraftDetails,
  Coordinate,
} from '@/types';
import {
  AircraftApiClient,
  getAircraftApiClient,
} from '../api/clients/AircraftApiClient';

/**
 * 항공기 Repository 구현체
 */
export class AircraftRepository implements IAircraftRepository {
  private apiClient: AircraftApiClient;

  constructor(apiClient?: AircraftApiClient) {
    this.apiClient = apiClient || getAircraftApiClient();
  }

  /**
   * 반경 내 항공기 위치 조회
   */
  async fetchNearby(
    center: Coordinate,
    radiusNM: number
  ): Promise<AircraftPosition[]> {
    return this.apiClient.fetchNearby(center, radiusNM);
  }

  /**
   * 특정 항공기 항적 조회
   */
  async fetchTrace(icao24: string): Promise<AircraftTrailPoint[]> {
    return this.apiClient.fetchTrace(icao24);
  }

  /**
   * 항공기 상세 정보 조회
   */
  async fetchDetails(icao24: string): Promise<AircraftDetails | null> {
    const position = await this.apiClient.fetchDetails(icao24);
    if (!position) return null;

    // AircraftPosition을 AircraftDetails로 확장
    const photoUrl = position.registration
      ? await this.apiClient.fetchPhotoUrl(position.registration)
      : null;

    return {
      ...position,
      photoUrl: photoUrl ?? undefined,
    };
  }

  /**
   * 항공기 사진 URL 조회
   */
  async fetchPhotoUrl(registration: string): Promise<string | null> {
    return this.apiClient.fetchPhotoUrl(registration);
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
let aircraftRepositoryInstance: AircraftRepository | null = null;

export function getAircraftRepository(): AircraftRepository {
  if (!aircraftRepositoryInstance) {
    aircraftRepositoryInstance = new AircraftRepository();
  }
  return aircraftRepositoryInstance;
}
