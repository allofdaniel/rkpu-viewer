/**
 * Weather Repository Interface
 * DO-278A 요구사항 추적: SRS-WX-002
 *
 * 기상 데이터 접근을 위한 추상화 인터페이스
 */

import type { MetarData, TafData, SigmetData, LightningStrike } from '@/types';

/**
 * 기상 데이터 타입
 */
export type WeatherDataType =
  | 'metar'
  | 'taf'
  | 'sigmet'
  | 'airmet'
  | 'llws'
  | 'upperwind'
  | 'radar'
  | 'satellite'
  | 'lightning';

/**
 * 상층풍 데이터
 */
export interface UpperWindData {
  time: string;
  grid: UpperWindGridPoint[];
  source: string;
}

export interface UpperWindGridPoint {
  lat: number;
  lon: number;
  name: string;
  levels: Record<string, UpperWindLevel>;
}

export interface UpperWindLevel {
  altitude_m: number;
  wind_dir: number;
  wind_spd_kt: number;
}

/**
 * 레이더 이미지 데이터
 */
export interface RadarData {
  composite: string;
  echoTop: string;
  vil: string;
  time: string;
  bounds: [[number, number], [number, number]];
}

/**
 * 위성 이미지 데이터
 */
export interface SatelliteData {
  vis: string;
  ir: string;
  wv: string;
  enhir: string;
  time: string;
  bounds: [[number, number], [number, number]];
}

/**
 * LLWS (Low Level Wind Shear) 데이터
 */
export interface LlwsData {
  station: string;
  time: string;
  runway: string;
  type: string;
  value: string | null;
  raw: string;
}

/**
 * Weather Repository 인터페이스
 */
export interface IWeatherRepository {
  /**
   * METAR 데이터 조회
   * @param icao ICAO 공항 코드
   */
  fetchMetar(icao: string): Promise<MetarData | null>;

  /**
   * TAF 데이터 조회
   * @param icao ICAO 공항 코드
   */
  fetchTaf(icao: string): Promise<TafData | null>;

  /**
   * SIGMET 데이터 조회
   */
  fetchSigmet(): Promise<SigmetData[]>;

  /**
   * 상층풍 데이터 조회
   */
  fetchUpperWind(): Promise<UpperWindData | null>;

  /**
   * 레이더 이미지 데이터 조회
   */
  fetchRadar(): Promise<RadarData | null>;

  /**
   * 위성 이미지 데이터 조회
   */
  fetchSatellite(): Promise<SatelliteData | null>;

  /**
   * 낙뢰 데이터 조회
   */
  fetchLightning(): Promise<LightningStrike[]>;

  /**
   * LLWS 데이터 조회
   */
  fetchLlws(): Promise<LlwsData[]>;
}

/**
 * 빈 기상 Repository (테스트/폴백용)
 */
export class NullWeatherRepository implements IWeatherRepository {
  async fetchMetar(): Promise<MetarData | null> {
    return null;
  }

  async fetchTaf(): Promise<TafData | null> {
    return null;
  }

  async fetchSigmet(): Promise<SigmetData[]> {
    return [];
  }

  async fetchUpperWind(): Promise<UpperWindData | null> {
    return null;
  }

  async fetchRadar(): Promise<RadarData | null> {
    return null;
  }

  async fetchSatellite(): Promise<SatelliteData | null> {
    return null;
  }

  async fetchLightning(): Promise<LightningStrike[]> {
    return [];
  }

  async fetchLlws(): Promise<LlwsData[]> {
    return [];
  }
}
