import { useState, useCallback, useEffect } from 'react';
import { NOTAM_CACHE_DURATION } from '../constants/config';
import type { NotamItem, NotamData } from './useNotam';
import { logger } from '../utils/logger';

interface CacheEntry {
  data: NotamData;
  timestamp: number;
}

/**
 * useNotamData - NOTAM 데이터 관리 훅
 * - 메모리 캐시 관리
 * - 데이터 fetching
 * - 기간별 필터링
 */

// NOTAM Memory Cache (module level for persistence)
const notamMemoryCache: Record<string, CacheEntry> = {};

// NOTAM 메모리 캐시 헬퍼 함수
const getNotamCache = (period: string): NotamData | null => {
  const cached = notamMemoryCache[period];
  if (!cached) return null;

  const now = Date.now();

  // 캐시가 유효한지 확인 (10분 이내)
  if (now - cached.timestamp < NOTAM_CACHE_DURATION) {
    logger.debug('NOTAM', `Memory cache hit for period: ${period}, age: ${Math.round((now - cached.timestamp) / 1000)}s`);
    return cached.data;
  }

  // 만료된 캐시 삭제
  delete notamMemoryCache[period];
  return null;
};

const setNotamCache = (period: string, data: NotamData): void => {
  notamMemoryCache[period] = {
    data,
    timestamp: Date.now()
  };
  logger.debug('NOTAM', `Memory cache saved for period: ${period}, count: ${data?.data?.length || 0}`);
};

const getNotamCacheAge = (period: string): number | null => {
  const cached = notamMemoryCache[period];
  if (!cached) return null;
  return Date.now() - cached.timestamp;
};

export interface NotamHealthStatus {
  isConnected: boolean;
  lastSuccessTime: number | null;
  notamCount: number;
  source: string | null;
}

export interface UseNotamDataReturn {
  notamData: NotamData | null;
  setNotamData: React.Dispatch<React.SetStateAction<NotamData | null>>;
  notamLoading: boolean;
  notamError: string | null;
  notamCacheAge: number | null;
  notamPeriod: string;
  setNotamPeriod: React.Dispatch<React.SetStateAction<string>>;
  notamFilter: string;
  setNotamFilter: React.Dispatch<React.SetStateAction<string>>;
  notamLocationFilter: string;
  setNotamLocationFilter: React.Dispatch<React.SetStateAction<string>>;
  notamExpanded: Record<string, boolean>;
  setNotamExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  notamLocationsOnMap: Set<string>;
  setNotamLocationsOnMap: React.Dispatch<React.SetStateAction<Set<string>>>;
  fetchNotamData: (period: string, forceRefresh?: boolean) => Promise<void>;
  notamHealth: NotamHealthStatus;
}

/**
 * DO-278A 요구사항 추적: SRS-DATA-001 (NOTAM 데이터 관리)
 * - 메모리 캐시 관리 (10분 유효)
 * - 자동 데이터 fetching
 * - 기간별 필터링
 */
export default function useNotamData(): UseNotamDataReturn {
  const [notamData, setNotamData] = useState<NotamData | null>(null);
  const [notamLoading, setNotamLoading] = useState(false);
  const [notamError, setNotamError] = useState<string | null>(null);
  const [notamCacheAge, setNotamCacheAge] = useState<number | null>(null);
  const [notamPeriod, setNotamPeriod] = useState('current'); // 'current', '1month', '1year', 'all'
  const [notamFilter, setNotamFilter] = useState(''); // 필터링용 검색어
  const [notamLocationFilter, setNotamLocationFilter] = useState(''); // 전체 지역
  const [notamExpanded, setNotamExpanded] = useState<Record<string, boolean>>({});
  const [notamLocationsOnMap, setNotamLocationsOnMap] = useState<Set<string>>(new Set()); // e.g., Set(['RKPU', 'RKTN'])
  const [notamHealth, setNotamHealth] = useState<NotamHealthStatus>({
    isConnected: false,
    lastSuccessTime: null,
    notamCount: 0,
    source: null
  });

  // NOTAM data fetching with caching - always use complete DB with period filtering
  // DO-278A 요구사항 추적: SRS-DATA-002 (캐시 및 폴백 처리)
  const fetchNotamData = useCallback(async (period: string, forceRefresh = false): Promise<void> => {
    // 1. 먼저 캐시 확인 (강제 새로고침이 아닌 경우)
    if (!forceRefresh) {
      const cachedData = getNotamCache(period);
      if (cachedData) {
        setNotamData(cachedData);
        setNotamCacheAge(getNotamCacheAge(period));
        setNotamLoading(false);
        return;
      }
    }

    setNotamLoading(true);
    setNotamError(null);
    try {
      let response: Response;
      let usedFallback = false;

      // Try API first, fallback to local data if it fails
      try {
        const params = new URLSearchParams();
        params.set('source', 'complete');
        params.set('period', period);
        params.set('bounds', '32,123,44,146');
        const url = '/api/notam?' + params.toString();

        response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Content-Type 검증 완화 (Vite dev server나 일부 환경에서 헤더가 없을 수 있음)
        const contentType = response.headers.get('content-type');
        // Content-Type이 있고 명시적으로 HTML인 경우만 에러
        if (contentType && contentType.includes('text/html')) {
          throw new Error('Response is HTML, not JSON (likely dev server fallback)');
        }
      } catch (apiError) {
        logger.debug('NOTAM', 'API failed, trying local fallback', { error: (apiError as Error).message });
        // Fallback to local mock data
        response = await fetch('/data/notams.json');
        usedFallback = true;
        if (!response.ok) throw new Error(`Fallback also failed: HTTP ${response.status}`);
      }
      const rawData = await response.json();

      // Handle both API response format and direct S3 JSON array
      let json: NotamData;
      if (Array.isArray(rawData)) {
        // Local fallback or direct S3 response - transform field names to match expected interface
        interface LocalNotamItem {
          notam_id?: string;
          location?: string;
          icao?: string;
          effectiveStart?: string;
          effectiveEnd?: string;
          message?: string;
          type?: string;
          latitude?: number;
          longitude?: number;
          radius?: number;
          purpose?: string;
          [key: string]: unknown;
        }
        const transformedData: NotamItem[] = (rawData as LocalNotamItem[]).map((item, index) => ({
          id: item.notam_id || `local-${index}`,
          notam_number: item.notam_id || `LOCAL-${index}`,
          location: item.location || item.icao || 'UNKNOWN',
          qcode: item.type || 'MISC',
          qcode_mean: item.type || 'Miscellaneous',
          e_text: item.message || '',
          full_text: item.message || '',
          effective_start: item.effectiveStart?.replace(/[-:TZ]/g, '').substring(2, 12) || '',
          effective_end: item.effectiveEnd?.replace(/[-:TZ]/g, '').substring(2, 12) || 'PERM',
          series: 'A',
          fir: 'RKRR',
          q_lat: item.latitude,
          q_lon: item.longitude,
          q_radius: item.radius,
        }));
        json = {
          data: transformedData,
          count: transformedData.length,
          returned: transformedData.length,
          source: usedFallback ? 'local-demo' : 's3-direct'
        };
      } else {
        json = rawData as NotamData;
      }

      // 2. 캐시에 저장
      if (usedFallback) {
        json.source = 'local-demo';
        logger.info('NOTAM', 'Using local demo data');
      }
      setNotamCache(period, json);
      setNotamCacheAge(0);

      setNotamData(json);
      setNotamHealth({
        isConnected: true,
        lastSuccessTime: Date.now(),
        notamCount: json.data?.length || 0,
        source: json.source || 'api'
      });
    } catch (e) {
      logger.error('NOTAM', 'Fetch failed', e as Error);
      setNotamError((e as Error).message);
      setNotamHealth(prev => ({ ...prev, isConnected: false }));

      // 3. 네트워크 에러 시 만료된 메모리 캐시라도 사용 시도
      const expiredCache = notamMemoryCache[period];
      if (expiredCache) {
        setNotamData(expiredCache.data);
        setNotamError('캐시된 데이터 사용 중 (네트워크 오류)');
      }
    } finally {
      setNotamLoading(false);
    }
  }, []); // dependency 제거 - period는 인자로 전달

  // Fetch NOTAM on page load and when period changes
  // DO-278A 요구사항 추적: SRS-DATA-003 (자동 데이터 로드)
  useEffect(() => {
    // 페이지 로드 시 자동으로 NOTAM 데이터 fetch
    fetchNotamData(notamPeriod);
  }, [notamPeriod]); // fetchNotamData 제거 - 무한 루프 방지

  return {
    notamData,
    setNotamData,
    notamLoading,
    notamError,
    notamCacheAge,
    notamPeriod,
    setNotamPeriod,
    notamFilter,
    setNotamFilter,
    notamLocationFilter,
    setNotamLocationFilter,
    notamExpanded,
    setNotamExpanded,
    notamLocationsOnMap,
    setNotamLocationsOnMap,
    fetchNotamData,
    notamHealth,
  };
}
