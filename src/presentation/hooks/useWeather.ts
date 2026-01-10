/**
 * useWeather Hook
 * DO-278A 요구사항 추적: SRS-HOOK-002
 *
 * 기상 데이터 관리를 위한 React Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MetarData, TafData, SigmetData, UpperWindData } from '@/types';
import { getWeatherRepository } from '@/infrastructure/repositories/WeatherRepository';
import { assessWeatherRisk } from '@/domain/entities/Weather';
import { WEATHER_UPDATE_INTERVAL } from '@/config/constants';

interface UseWeatherOptions {
  icao?: string;
  autoUpdate?: boolean;
  updateInterval?: number;
}

interface WeatherRisk {
  level: 'low' | 'moderate' | 'high' | 'severe';
  factors: string[];
}

interface UseWeatherReturn {
  metar: MetarData | null;
  taf: TafData | null;
  sigmets: SigmetData[];
  airmets: SigmetData[];
  upperWind: UpperWindData | null;
  llws: Array<{
    station: string;
    time: string;
    runway: string;
    type: string;
    value: string | null;
    raw: string;
  }>;
  radar: {
    composite: string;
    echoTop: string;
    vil: string;
    time: string;
    bounds: number[][];
  } | null;
  satellite: {
    vis: string;
    ir: string;
    wv: string;
    enhir: string;
    time: string;
    bounds: number[][];
  } | null;
  lightning: {
    strikes: Array<{
      time: string;
      lat: number;
      lon: number;
      amplitude: number | null;
      type: string;
    }>;
    timeRange: { start: string; end: string };
  } | null;
  weatherRisk: WeatherRisk | null;
  isLoading: boolean;
  error: Error | null;
  lastUpdate: Date | null;
  refreshWeather: () => Promise<void>;
  refreshRadar: () => Promise<void>;
  refreshSatellite: () => Promise<void>;
  refreshLightning: () => Promise<void>;
}

/**
 * 기상 데이터 관리 Hook
 */
export function useWeather(options: UseWeatherOptions = {}): UseWeatherReturn {
  const {
    icao = 'RKPU',
    autoUpdate = true,
    updateInterval = WEATHER_UPDATE_INTERVAL,
  } = options;

  const [metar, setMetar] = useState<MetarData | null>(null);
  const [taf, setTaf] = useState<TafData | null>(null);
  const [sigmets, setSigmets] = useState<SigmetData[]>([]);
  const [airmets, setAirmets] = useState<SigmetData[]>([]);
  const [upperWind, setUpperWind] = useState<UpperWindData | null>(null);
  const [llws, setLlws] = useState<
    Array<{
      station: string;
      time: string;
      runway: string;
      type: string;
      value: string | null;
      raw: string;
    }>
  >([]);
  const [radar, setRadar] = useState<{
    composite: string;
    echoTop: string;
    vil: string;
    time: string;
    bounds: number[][];
  } | null>(null);
  const [satellite, setSatellite] = useState<{
    vis: string;
    ir: string;
    wv: string;
    enhir: string;
    time: string;
    bounds: number[][];
  } | null>(null);
  const [lightning, setLightning] = useState<{
    strikes: Array<{
      time: string;
      lat: number;
      lon: number;
      amplitude: number | null;
      type: string;
    }>;
    timeRange: { start: string; end: string };
  } | null>(null);
  const [weatherRisk, setWeatherRisk] = useState<WeatherRisk | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const repositoryRef = useRef(getWeatherRepository());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 기본 기상 데이터 갱신 (METAR, TAF, SIGMET, AIRMET, 상층풍)
   */
  const refreshWeather = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [metarData, tafData, sigmetData, airmetData, upperWindData, llwsData] =
        await Promise.all([
          repositoryRef.current.fetchMetar(icao),
          repositoryRef.current.fetchTaf(icao),
          repositoryRef.current.fetchSigmet(),
          repositoryRef.current.fetchAirmet(),
          repositoryRef.current.fetchUpperWind(),
          repositoryRef.current.fetchLLWS(),
        ]);

      const targetMetar =
        metarData.find((m) => m.icao === icao) || metarData[0] || null;
      const targetTaf =
        tafData.find((t) => t.icao === icao) || tafData[0] || null;

      setMetar(targetMetar);
      setTaf(targetTaf);
      setSigmets(sigmetData);
      setAirmets(airmetData);
      setUpperWind(upperWindData);
      setLlws(llwsData);
      setLastUpdate(new Date());

      // 기상 위험도 평가
      if (targetMetar) {
        const risk = assessWeatherRisk({
          metar: targetMetar,
          sigmets: sigmetData,
        });
        setWeatherRisk(risk);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [icao]);

  /**
   * 레이더 데이터 갱신
   */
  const refreshRadar = useCallback(async () => {
    try {
      const radarData = await repositoryRef.current.fetchRadar();
      setRadar(radarData);
    } catch (err) {
      console.error('Radar fetch error:', err);
    }
  }, []);

  /**
   * 위성 데이터 갱신
   */
  const refreshSatellite = useCallback(async () => {
    try {
      const satelliteData = await repositoryRef.current.fetchSatellite();
      setSatellite(satelliteData);
    } catch (err) {
      console.error('Satellite fetch error:', err);
    }
  }, []);

  /**
   * 낙뢰 데이터 갱신
   */
  const refreshLightning = useCallback(async () => {
    try {
      const lightningData = await repositoryRef.current.fetchLightning();
      setLightning(lightningData);
    } catch (err) {
      console.error('Lightning fetch error:', err);
    }
  }, []);

  /**
   * 자동 갱신 설정
   */
  useEffect(() => {
    if (!autoUpdate) return;

    // 초기 로드
    refreshWeather();

    // 주기적 갱신
    intervalRef.current = setInterval(refreshWeather, updateInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoUpdate, updateInterval, refreshWeather]);

  return {
    metar,
    taf,
    sigmets,
    airmets,
    upperWind,
    llws,
    radar,
    satellite,
    lightning,
    weatherRisk,
    isLoading,
    error,
    lastUpdate,
    refreshWeather,
    refreshRadar,
    refreshSatellite,
    refreshLightning,
  };
}

export default useWeather;
