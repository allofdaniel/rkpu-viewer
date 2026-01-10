/**
 * Weather Repository Implementation
 * DO-278A 요구사항 추적: SRS-REPO-003
 *
 * IWeatherRepository 인터페이스 구현
 */

import type { IWeatherRepository } from '@/domain/repositories/IWeatherRepository';
import type {
  MetarData,
  TafData,
  SigmetData,
  UpperWindData,
  Coordinate,
} from '@/types';
import {
  WeatherApiClient,
  getWeatherApiClient,
} from '../api/clients/WeatherApiClient';

/**
 * 기상 Repository 구현체
 */
export class WeatherRepository implements IWeatherRepository {
  private apiClient: WeatherApiClient;

  constructor(apiClient?: WeatherApiClient) {
    this.apiClient = apiClient || getWeatherApiClient();
  }

  /**
   * METAR 데이터 조회
   */
  async fetchMetar(icao?: string): Promise<MetarData[]> {
    return this.apiClient.fetchMetar(icao);
  }

  /**
   * TAF 데이터 조회
   */
  async fetchTaf(icao?: string): Promise<TafData[]> {
    return this.apiClient.fetchTaf(icao);
  }

  /**
   * SIGMET 데이터 조회
   */
  async fetchSigmet(): Promise<SigmetData[]> {
    return this.apiClient.fetchSigmet();
  }

  /**
   * AIRMET 데이터 조회
   */
  async fetchAirmet(): Promise<SigmetData[]> {
    return this.apiClient.fetchAirmet();
  }

  /**
   * 상층풍 데이터 조회
   */
  async fetchUpperWind(): Promise<UpperWindData> {
    return this.apiClient.fetchUpperWind();
  }

  /**
   * LLWS 데이터 조회
   */
  async fetchLLWS(): Promise<
    Array<{
      station: string;
      time: string;
      runway: string;
      type: string;
      value: string | null;
      raw: string;
    }>
  > {
    return this.apiClient.fetchLLWS();
  }

  /**
   * 레이더 이미지 URL 조회
   */
  async fetchRadar(): Promise<{
    composite: string;
    echoTop: string;
    vil: string;
    time: string;
    bounds: number[][];
  }> {
    return this.apiClient.fetchRadar();
  }

  /**
   * 위성 이미지 URL 조회
   */
  async fetchSatellite(): Promise<{
    vis: string;
    ir: string;
    wv: string;
    enhir: string;
    time: string;
    bounds: number[][];
  }> {
    return this.apiClient.fetchSatellite();
  }

  /**
   * 낙뢰 데이터 조회
   */
  async fetchLightning(): Promise<{
    strikes: Array<{
      time: string;
      lat: number;
      lon: number;
      amplitude: number | null;
      type: string;
    }>;
    timeRange: { start: string; end: string };
  }> {
    return this.apiClient.fetchLightning();
  }

  /**
   * SIGWX 차트 URL 조회
   */
  async fetchSigwx(): Promise<{
    low: string;
    mid: string;
    high: string;
    intl: string;
  }> {
    return this.apiClient.fetchSigwx();
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
let weatherRepositoryInstance: WeatherRepository | null = null;

export function getWeatherRepository(): WeatherRepository {
  if (!weatherRepositoryInstance) {
    weatherRepositoryInstance = new WeatherRepository();
  }
  return weatherRepositoryInstance;
}
