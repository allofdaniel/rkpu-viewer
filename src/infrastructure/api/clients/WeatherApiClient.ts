/**
 * Weather API Client
 * DO-278A 요구사항 추적: SRS-API-003
 *
 * 기상 정보 API 연동 클라이언트
 * KMA (기상청), aviationweather.gov, Open-Meteo 통합
 */

import { BaseApiClient, SimpleCache } from './BaseApiClient';
import type {
  MetarData,
  TafData,
  SigmetData,
  UpperWindData,
} from '@/types';
import { API_BASE_URL } from '@/config/constants';

/**
 * METAR API 응답 형식
 */
interface MetarApiResponse {
  icaoId: string;
  obsTime: string;
  temp: number | null;
  dewp: number | null;
  humidity?: number | null;
  altim: number;
  altimLocal?: number;
  wdir: number;
  wspd: number;
  wspdMs?: string;
  wgst: number | null;
  visib: number;
  visibM?: number | null;
  lVis?: number | null;
  rVis?: number | null;
  lRvr?: number | null;
  rRvr?: number | null;
  ceiling: number | null;
  ceilingM?: number | null;
  cloud?: number | null;
  rain?: number | null;
  fltCat: string;
  rawOb: string;
  source: string;
}

/**
 * TAF API 응답 형식
 */
interface TafApiResponse {
  icaoId: string;
  rawTAF?: string;
  rawOb?: string;
  issueTime?: string;
  validTimeFrom?: string;
  validTimeTo?: string;
  forecast?: Array<{
    timeFrom?: string;
    timeTo?: string;
    changeIndicator?: string;
    windDirDegrees?: number;
    windSpeedKt?: number;
    windGustKt?: number;
    visibility?: string;
    weather?: string;
    clouds?: Array<{ cover: string; base: number }>;
  }>;
}

/**
 * SIGMET API 응답 형식
 */
interface SigmetApiResponse {
  kma: Array<{
    raw: string;
    type: string;
    coords: number[][];
  }>;
  international: Array<{
    validTimeFrom?: string;
    validTimeTo?: string;
    rawSigmet?: string;
    hazard?: string;
    geom?: { coordinates: number[][][] };
  }>;
}

/**
 * 상층풍 API 응답 형식
 */
interface UpperWindApiResponse {
  time: string;
  grid: Array<{
    lat: number;
    lon: number;
    name: string;
    levels: Record<
      string,
      {
        altitude_m: number;
        wind_dir: number;
        wind_spd_kt: number;
      }
    >;
  }>;
  levels: Record<
    string,
    {
      altitude_m: number;
      wind_dir: number;
      wind_spd_kt: number;
    }
  >;
  source: string;
}

/**
 * 레이더 API 응답 형식
 */
interface RadarApiResponse {
  composite: string;
  echoTop: string;
  vil: string;
  time: string;
  bounds: number[][];
}

/**
 * 위성 API 응답 형식
 */
interface SatelliteApiResponse {
  vis: string;
  ir: string;
  wv: string;
  enhir: string;
  time: string;
  bounds: number[][];
}

/**
 * 낙뢰 API 응답 형식
 */
interface LightningApiResponse {
  strikes: Array<{
    time: string;
    lat: number;
    lon: number;
    amplitude: number | null;
    type: string;
  }>;
  timeRange: { start: string; end: string };
}

/**
 * 기상 API 클라이언트
 */
export class WeatherApiClient extends BaseApiClient {
  private metarCache: SimpleCache<MetarData[]>;
  private tafCache: SimpleCache<TafData[]>;
  private sigmetCache: SimpleCache<SigmetData[]>;
  private upperWindCache: SimpleCache<UpperWindData>;
  private radarCache: SimpleCache<RadarApiResponse>;
  private satelliteCache: SimpleCache<SatelliteApiResponse>;
  private lightningCache: SimpleCache<LightningApiResponse>;

  constructor(options?: { timeout?: number; retries?: number }) {
    super(API_BASE_URL, options);
    this.metarCache = new SimpleCache<MetarData[]>(30000); // 30초
    this.tafCache = new SimpleCache<TafData[]>(300000); // 5분
    this.sigmetCache = new SimpleCache<SigmetData[]>(60000); // 1분
    this.upperWindCache = new SimpleCache<UpperWindData>(1800000); // 30분
    this.radarCache = new SimpleCache<RadarApiResponse>(60000); // 1분
    this.satelliteCache = new SimpleCache<SatelliteApiResponse>(300000); // 5분
    this.lightningCache = new SimpleCache<LightningApiResponse>(30000); // 30초
  }

  /**
   * METAR 데이터 조회
   */
  async fetchMetar(icao?: string): Promise<MetarData[]> {
    const cacheKey = `metar-${icao || 'default'}`;
    const cached = this.metarCache.get(cacheKey);
    if (cached) return cached;

    const queryString = icao ? `?type=amos&icao=${icao}` : '?type=amos';
    const response = await this.get<MetarApiResponse[]>(
      `/api/weather${queryString}`
    );

    const metarData = this.mapToMetarData(response);
    this.metarCache.set(cacheKey, metarData);
    return metarData;
  }

  /**
   * TAF 데이터 조회
   */
  async fetchTaf(icao?: string): Promise<TafData[]> {
    const cacheKey = `taf-${icao || 'default'}`;
    const cached = this.tafCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.get<TafApiResponse[]>('/api/weather?type=taf');
    const tafData = this.mapToTafData(response, icao);

    this.tafCache.set(cacheKey, tafData);
    return tafData;
  }

  /**
   * SIGMET 데이터 조회
   */
  async fetchSigmet(): Promise<SigmetData[]> {
    const cacheKey = 'sigmet';
    const cached = this.sigmetCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.get<SigmetApiResponse>(
      '/api/weather?type=sigmet'
    );
    const sigmetData = this.mapToSigmetData(response);

    this.sigmetCache.set(cacheKey, sigmetData);
    return sigmetData;
  }

  /**
   * AIRMET 데이터 조회
   */
  async fetchAirmet(): Promise<SigmetData[]> {
    const response = await this.get<
      Array<{
        hazard?: string;
        coords?: Array<{ lat: number; lon: number }>;
        validTimeFrom?: string;
        validTimeTo?: string;
      }>
    >('/api/weather?type=airmet');

    return response.map((item) => ({
      type: 'AIRMET',
      hazard: item.hazard || 'UNKNOWN',
      polygon: item.coords?.map((c) => ({ lat: c.lat, lon: c.lon })) || [],
      validFrom: item.validTimeFrom ? new Date(item.validTimeFrom) : undefined,
      validTo: item.validTimeTo ? new Date(item.validTimeTo) : undefined,
      raw: '',
    }));
  }

  /**
   * 상층풍 데이터 조회
   */
  async fetchUpperWind(): Promise<UpperWindData> {
    const cacheKey = 'upperwind';
    const cached = this.upperWindCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.get<UpperWindApiResponse>(
      '/api/weather?type=upperwind'
    );
    const upperWindData = this.mapToUpperWindData(response);

    this.upperWindCache.set(cacheKey, upperWindData);
    return upperWindData;
  }

  /**
   * LLWS (저층 윈드시어) 데이터 조회
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
    return this.get('/api/weather?type=llws');
  }

  /**
   * 레이더 이미지 URL 조회
   */
  async fetchRadar(): Promise<RadarApiResponse> {
    const cacheKey = 'radar';
    const cached = this.radarCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.get<RadarApiResponse>(
      '/api/weather?type=radar'
    );
    this.radarCache.set(cacheKey, response);
    return response;
  }

  /**
   * 위성 이미지 URL 조회
   */
  async fetchSatellite(): Promise<SatelliteApiResponse> {
    const cacheKey = 'satellite';
    const cached = this.satelliteCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.get<SatelliteApiResponse>(
      '/api/weather?type=satellite'
    );
    this.satelliteCache.set(cacheKey, response);
    return response;
  }

  /**
   * 낙뢰 데이터 조회
   */
  async fetchLightning(): Promise<LightningApiResponse> {
    const cacheKey = 'lightning';
    const cached = this.lightningCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.get<LightningApiResponse>(
      '/api/weather?type=lightning'
    );
    this.lightningCache.set(cacheKey, response);
    return response;
  }

  /**
   * SIGWX (중요기상도) 차트 URL 조회
   */
  async fetchSigwx(): Promise<{
    low: string;
    mid: string;
    high: string;
    intl: string;
  }> {
    return this.get('/api/weather?type=sigwx');
  }

  /**
   * API 응답을 MetarData로 변환
   */
  private mapToMetarData(response: MetarApiResponse[]): MetarData[] {
    return response.map((item) => ({
      icao: item.icaoId,
      obsTime: new Date(item.obsTime),
      temp: item.temp ?? undefined,
      dewpoint: item.dewp ?? undefined,
      humidity: item.humidity ?? undefined,
      altimeter: item.altim,
      windDirection: item.wdir,
      windSpeed: item.wspd,
      windGust: item.wgst ?? undefined,
      visibility: item.visib,
      visibilityMeters: item.visibM ?? undefined,
      ceiling: item.ceiling ?? undefined,
      ceilingMeters: item.ceilingM ?? undefined,
      flightCategory: item.fltCat as 'VFR' | 'MVFR' | 'IFR' | 'LIFR',
      rawOb: item.rawOb,
      source: item.source,
      leftVisibility: item.lVis ?? undefined,
      rightVisibility: item.rVis ?? undefined,
      leftRvr: item.lRvr ?? undefined,
      rightRvr: item.rRvr ?? undefined,
    }));
  }

  /**
   * API 응답을 TafData로 변환
   */
  private mapToTafData(
    response: TafApiResponse[],
    filterIcao?: string
  ): TafData[] {
    return response
      .filter((item) => !filterIcao || item.icaoId === filterIcao)
      .map((item) => ({
        icao: item.icaoId,
        rawTaf: item.rawTAF || item.rawOb || '',
        issueTime: item.issueTime ? new Date(item.issueTime) : undefined,
        validFrom: item.validTimeFrom
          ? new Date(item.validTimeFrom)
          : undefined,
        validTo: item.validTimeTo ? new Date(item.validTimeTo) : undefined,
        forecast: item.forecast?.map((f) => ({
          from: f.timeFrom ? new Date(f.timeFrom) : undefined,
          to: f.timeTo ? new Date(f.timeTo) : undefined,
          changeIndicator: f.changeIndicator,
          windDirection: f.windDirDegrees,
          windSpeed: f.windSpeedKt,
          windGust: f.windGustKt,
          visibility: f.visibility,
          weather: f.weather,
          clouds: f.clouds,
        })),
      }));
  }

  /**
   * API 응답을 SigmetData로 변환
   */
  private mapToSigmetData(response: SigmetApiResponse): SigmetData[] {
    const result: SigmetData[] = [];

    // KMA SIGMET
    if (response.kma) {
      result.push(
        ...response.kma.map((item) => ({
          type: 'SIGMET' as const,
          hazard: item.type,
          polygon: item.coords.map((c) => ({
            lat: c[1] || 0,
            lon: c[0] || 0,
          })),
          raw: item.raw,
        }))
      );
    }

    // International SIGMET
    if (response.international) {
      result.push(
        ...response.international.map((item) => ({
          type: 'SIGMET' as const,
          hazard: item.hazard || 'UNKNOWN',
          polygon:
            item.geom?.coordinates?.[0]?.map((c) => ({
              lat: c[1] || 0,
              lon: c[0] || 0,
            })) || [],
          validFrom: item.validTimeFrom
            ? new Date(item.validTimeFrom)
            : undefined,
          validTo: item.validTimeTo ? new Date(item.validTimeTo) : undefined,
          raw: item.rawSigmet || '',
        }))
      );
    }

    return result;
  }

  /**
   * API 응답을 UpperWindData로 변환
   */
  private mapToUpperWindData(response: UpperWindApiResponse): UpperWindData {
    return {
      time: new Date(response.time),
      grid: response.grid.map((point) => ({
        lat: point.lat,
        lon: point.lon,
        name: point.name,
        levels: Object.entries(point.levels).reduce(
          (acc, [level, data]) => ({
            ...acc,
            [level]: {
              altitude_m: data.altitude_m,
              windDirection: data.wind_dir,
              windSpeed: data.wind_spd_kt,
            },
          }),
          {}
        ),
      })),
      source: response.source,
    };
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    this.metarCache.clear();
    this.tafCache.clear();
    this.sigmetCache.clear();
    this.upperWindCache.clear();
    this.radarCache.clear();
    this.satelliteCache.clear();
    this.lightningCache.clear();
  }
}

/**
 * 싱글톤 인스턴스
 */
let weatherApiClientInstance: WeatherApiClient | null = null;

export function getWeatherApiClient(): WeatherApiClient {
  if (!weatherApiClientInstance) {
    weatherApiClientInstance = new WeatherApiClient();
  }
  return weatherApiClientInstance;
}
