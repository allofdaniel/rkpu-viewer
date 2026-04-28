import { useState, useCallback, useEffect, useRef } from 'react';
import { NOTAM_CACHE_DURATION } from '../constants/config';
import type { NotamItem, NotamData } from './useNotam';
import { logger } from '../utils/logger';

interface CacheEntry {
  data: NotamData;
  timestamp: number;
}

/**
 * useNotamData - NOTAM ?곗씠??愿由???
 * - 硫붾え由?罹먯떆 愿由?
 * - ?곗씠??fetching
 * - 湲곌컙蹂??꾪꽣留?
 */

// NOTAM Memory Cache (module level for persistence)
const notamMemoryCache: Record<string, CacheEntry> = {};

// NOTAM 硫붾え由?罹먯떆 ?ы띁 ?⑥닔
const getNotamCache = (period: string): NotamData | null => {
  const cached = notamMemoryCache[period];
  if (!cached) return null;

  const now = Date.now();

  // 罹먯떆媛 ?좏슚?쒖? ?뺤씤 (10遺??대궡)
  if (now - cached.timestamp < NOTAM_CACHE_DURATION) {
    logger.debug('NOTAM', `Memory cache hit for period: ${period}, age: ${Math.round((now - cached.timestamp) / 1000)}s`);
    return cached.data;
  }

  // 留뚮즺??罹먯떆 ??젣
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
 * DO-278A ?붽뎄?ы빆 異붿쟻: SRS-DATA-001 (NOTAM ?곗씠??愿由?
 * - 硫붾え由?罹먯떆 愿由?(10遺??좏슚)
 * - ?먮룞 ?곗씠??fetching
 * - 湲곌컙蹂??꾪꽣留?
 */
export default function useNotamData(): UseNotamDataReturn {
  const [notamData, setNotamData] = useState<NotamData | null>(null);
  const [notamLoading, setNotamLoading] = useState(false);
  const [notamError, setNotamError] = useState<string | null>(null);
  const [notamCacheAge, setNotamCacheAge] = useState<number | null>(null);
  const [notamPeriod, setNotamPeriod] = useState('current'); // 'current', '1month', '1year', 'all'
  const [notamFilter, setNotamFilter] = useState(''); // ?꾪꽣留곸슜 寃?됱뼱
  const [notamLocationFilter, setNotamLocationFilter] = useState(''); // ?꾩껜 吏??
  const [notamExpanded, setNotamExpanded] = useState<Record<string, boolean>>({});
  const [notamLocationsOnMap, setNotamLocationsOnMap] = useState<Set<string>>(new Set()); // e.g., Set(['RKPU', 'RKTN'])
  const [notamHealth, setNotamHealth] = useState<NotamHealthStatus>({
    isConnected: false,
    lastSuccessTime: null,
    notamCount: 0,
    source: null
  });

  // NOTAM data fetching with caching - always use complete DB with period filtering
  // DO-278A ?붽뎄?ы빆 異붿쟻: SRS-DATA-002 (罹먯떆 諛??대갚 泥섎━)
  const fetchNotamData = useCallback(async (period: string, forceRefresh = false, silent = false): Promise<void> => {
    // 1. 癒쇱? 罹먯떆 ?뺤씤 (媛뺤젣 ?덈줈怨좎묠???꾨땶 寃쎌슦)
    if (!forceRefresh) {
      const cachedData = getNotamCache(period);
      if (cachedData) {
        if (!silent) {
          setNotamData(cachedData);
          setNotamCacheAge(getNotamCacheAge(period));
          setNotamLoading(false);
        }
        return;
      }
    }

    if (!silent) {
      setNotamLoading(true);
      setNotamError(null);
    }
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

        // Content-Type 寃利??꾪솕 (Vite dev server???쇰? ?섍꼍?먯꽌 ?ㅻ뜑媛 ?놁쓣 ???덉쓬)
        const contentType = response.headers.get('content-type');
        // Content-Type???덇퀬 紐낆떆?곸쑝濡?HTML??寃쎌슦留??먮윭
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
          full_text?: string;
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
          qcode: String(item.qcode || item.type || 'MISC'),
          qcode_mean: String((item as Record<string, unknown>).qcode_desc || item.type || 'Miscellaneous'),
          e_text: item.message || '',
          full_text: String(item.full_text || item.message || ''),
          effective_start: item.effectiveStart?.replace(/[-:TZ]/g, '').substring(2, 12) || '',
          effective_end: item.effectiveEnd?.replace(/[-:TZ]/g, '').substring(2, 12) || 'PERM',
          series: (item.series as string) || 'A',
          fir: (item.fir as string) || 'RKRR',
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

      // 2. 罹먯떆?????
      if (usedFallback) {
        json.source = 'local-demo';
        logger.info('NOTAM', 'Using local demo data');
      }
      setNotamCache(period, json);
      if (!silent) {
        setNotamCacheAge(0);
        setNotamData(json);
        setNotamHealth({
          isConnected: true,
          lastSuccessTime: Date.now(),
          notamCount: json.data?.length || 0,
          source: json.source || 'api'
        });
      }
    } catch (e) {
      logger.error('NOTAM', `Fetch failed (period=${period}, silent=${silent})`, e as Error);
      if (!silent) {
        setNotamError((e as Error).message);
        setNotamHealth(prev => ({ ...prev, isConnected: false }));
      }

      // 3. ?ㅽ듃?뚰겕 ?먮윭 ??留뚮즺??硫붾え由?罹먯떆?쇰룄 ?ъ슜 ?쒕룄
      // 네트워크 에러 시 만료된 메모리 캐시라도 사용 (silent 모드는 화면 안 건드림)
      if (!silent) {
        const expiredCache = notamMemoryCache[period];
        if (expiredCache) {
          setNotamData(expiredCache.data);
          setNotamError('캐시된 데이터 사용 중 (네트워크 오류)');
        }
      }
    } finally {
      if (!silent) setNotamLoading(false);
    }
  }, []);

  // Fetch NOTAM on page load and when period changes
  useEffect(() => {
    void fetchNotamData(notamPeriod);
  }, [notamPeriod, fetchNotamData]);

  // 백그라운드 prefetch — 첫 mount 시 한 번만 실행.
  // current 로딩 끝난 후 1month/1year/all을 캐시에 미리 채워둠.
  // 사용자가 period 드롭다운을 바꿔도 즉시 cache hit (네트워크 0초).
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    const t = setTimeout(() => {
      const w = window as unknown as {
        requestIdleCallback?: (cb: IdleRequestCallback, opts?: { timeout: number }) => number;
      };
      const idle = w.requestIdleCallback || ((cb: IdleRequestCallback) =>
        setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline), 50));
      ['1month', '1year', 'all']
        .filter(p => p !== notamPeriod)
        .forEach((p, i) => {
          setTimeout(() => {
            idle(() => { void fetchNotamData(p, false, true); }, { timeout: 5000 });
          }, i * 1500);
        });
    }, 2500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
