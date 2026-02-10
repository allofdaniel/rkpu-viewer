/**
 * TBAS (Trajectory-Based Awareness System) Application
 * 궤적기반 상황인식 시스템
 * DO-278A 요구사항 추적: SRS-APP-001
 *
 * Clean Architecture 기반 메인 애플리케이션 컴포넌트
 */

import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
console.log('=== APP.TSX LOADED ===');
import './index.css';

// Context Providers
import { MapProvider, useMapContext } from '@/presentation/contexts/MapContext';
import { AircraftProvider, useAircraftContext } from '@/presentation/contexts/AircraftContext';
import { WeatherProvider, useWeatherContext } from '@/presentation/contexts/WeatherContext';

// Map Components (eagerly loaded - critical for initial render)
import { MapContainer } from '@/presentation/components/map/MapContainer';
import { AircraftLayer } from '@/presentation/components/map/AircraftLayer';
import { TrailLayer } from '@/presentation/components/map/TrailLayer';
import type { ChartData } from '@/presentation/components/map/ChartLayer';

// Lazy-loaded Map Components (not immediately visible)
const WaypointLayer = lazy(() => import('@/presentation/components/map/WaypointLayer').then(m => ({ default: m.WaypointLayer })));
const AirspaceLayer = lazy(() => import('@/presentation/components/map/AirspaceLayer').then(m => ({ default: m.AirspaceLayer })));
const ChartLayer = lazy(() => import('@/presentation/components/map/ChartLayer').then(m => ({ default: m.ChartLayer })));
const MapContextMenu = lazy(() => import('@/presentation/components/map/MapContextMenu').then(m => ({ default: m.MapContextMenu })));

// Lazy-loaded Panel Components (shown on demand)
const AircraftInfoPanel = lazy(() => import('@/presentation/components/Panels/AircraftInfoPanel').then(m => ({ default: m.AircraftInfoPanel })));
const WeatherPanel = lazy(() => import('@/presentation/components/Panels/WeatherPanel').then(m => ({ default: m.WeatherPanel })));
const ControlPanel = lazy(() => import('@/presentation/components/Panels/ControlPanel').then(m => ({ default: m.ControlPanel })));
const AircraftListPanel = lazy(() => import('@/presentation/components/Panels/AircraftListPanel').then(m => ({ default: m.AircraftListPanel })));
const ChartPanel = lazy(() => import('@/presentation/components/Panels/ChartPanel').then(m => ({ default: m.ChartPanel })));

// Services
import { getAirportCharts, getMockChartData } from '@/services/chartService';
import { AIRPORT_COORDINATES } from '@/config/airports';

// Hooks
import { useGIS } from '@/presentation/hooks/useGIS';
import { useMapContextMenu } from '@/presentation/hooks/useMapContextMenu';

// Stores
import useUIStore from '@/stores/useUIStore';

// Components
import TimeWeatherBar from '@/components/TimeWeatherBar';

// Utils
import { parseMetar, parseMetarTime, MetarData as UtilMetarData } from '@/utils/weather';
import type { MetarData as ContextMetarData, TafData } from '@/types';

/**
 * WeatherContext의 MetarData를 TimeWeatherBar가 필요로 하는 형식으로 변환
 * DO-278A 요구사항 추적: SRS-TYPE-001 (타입 안전성)
 */
function toTimeWeatherBarProps(
  metar: ContextMetarData | null,
  taf: TafData | null
): { metar: UtilMetarData | null; taf: { rawTAF?: string } | null } | null {
  if (!metar && !taf) return null;

  // obsTime이 Date인 경우 문자열로 변환 (YYYYMMDDHHMM 형식)
  const convertObsTime = (obsTime: string | Date): string => {
    if (typeof obsTime === 'string') return obsTime;
    return obsTime.toISOString().replace(/[-:TZ]/g, '').slice(0, 12);
  };

  return {
    metar: metar ? {
      obsTime: convertObsTime(metar.obsTime),
      wdir: metar.wdir,
      wspd: metar.wspd,
      wgst: metar.wgst,
      visib: metar.visib,
      visibM: undefined, // @/types doesn't have visibM
      temp: metar.temp,
      dewp: metar.dewp,
      lRvr: metar.leftRvr,
      rRvr: metar.rightRvr,
      ceiling: metar.ceiling,
      humidity: metar.humidity,
      fltCat: metar.fltCat,
      altim: metar.altim,
      rawOb: metar.rawOb,
      icaoId: metar.icaoId,
    } : null,
    taf: taf ? { rawTAF: taf.rawTAF || taf.rawTaf || '' } : null,
  };
}

// Error Boundary
import ErrorBoundary from '@/components/ErrorBoundary';

// Config
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_TRAIL_DURATION,
  TRAIL_COLOR,
} from '@/config/constants';

/**
 * Android WebView에서 실제 화면 높이 계산
 */
function useWindowHeight() {
  const [height, setHeight] = useState(window.innerHeight);

  useEffect(() => {
    const updateHeight = () => {
      // 실제 화면 높이 계산 (Android WebView 호환)
      const vh = Math.max(
        document.documentElement.clientHeight || 0,
        window.innerHeight || 0,
        window.screen.availHeight || 0
      );
      setHeight(vh);

      // CSS 변수로도 설정
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
    };

    updateHeight();

    // 다양한 이벤트에서 높이 업데이트
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);
    window.addEventListener('load', updateHeight);

    // Android에서 초기 로딩 후 지연 업데이트
    const timeouts = [100, 300, 500, 1000, 2000].map(delay =>
      setTimeout(updateHeight, delay)
    );

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
      window.removeEventListener('load', updateHeight);
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return height;
}

/**
 * 메인 뷰어 컴포넌트
 */
function RKPUViewer() {
  const [trailDuration, setTrailDuration] = useState(DEFAULT_TRAIL_DURATION);
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [showAircraftList, setShowAircraftList] = useState(false);
  const [showWeather, setShowWeather] = useState(true);
  const [showCharts, setShowCharts] = useState(false);

  // Chart state
  const [selectedChartAirport, setSelectedChartAirport] = useState('RKPU');
  const [selectedChartTypes, setSelectedChartTypes] = useState<string[]>(['ADC', 'IAC', 'VAC']);
  const [chartOpacity, setChartOpacity] = useState(0.7);
  const [charts, setCharts] = useState<ChartData[]>([]);

  // TimeWeatherBar state
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showMetarPopup, setShowMetarPopup] = useState(false);
  const [metarPinned, setMetarPinned] = useState(false);
  const [showTafPopup, setShowTafPopup] = useState(false);
  const [tafPinned, setTafPinned] = useState(false);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Android WebView 높이 계산
  const windowHeight = useWindowHeight();

  // Stores
  const { theme, setTheme } = useUIStore();

  // Contexts
  const { selectedAircraftHex, selectAircraft, flyTo, mapRef, isMapLoaded } = useMapContext();
  const { aircraft, selectedAircraft } = useAircraftContext();
  const { metar, taf, weatherRisk, refreshWeather } = useWeatherContext();

  // Initialize theme on mount
  useEffect(() => {
    // Apply initial theme to document
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // GIS Data
  const { waypoints, airspaces, isLoading: isGISLoading } = useGIS({
    airport: 'RKPU',
    autoLoad: true,
  });

  // Context Menu
  const { contextMenu, closeContextMenu } = useMapContextMenu({
    enabled: true,
  });

  /**
   * 차트 데이터 로드
   */
  const loadCharts = useCallback(async () => {
    if (!selectedChartAirport || !showCharts) return;

    try {
      // Try to load from API first
      let loadedCharts = await getAirportCharts(
        selectedChartAirport,
        undefined,
        selectedChartTypes.length > 0 ? selectedChartTypes : undefined
      );

      // If no charts from API, use mock data for development
      if (loadedCharts.length === 0) {
        loadedCharts = getMockChartData(selectedChartAirport);
        if (selectedChartTypes.length > 0) {
          loadedCharts = loadedCharts.filter((c) => selectedChartTypes.includes(c.chart_type));
        }
      }

      setCharts(loadedCharts);
    } catch (error) {
      console.error('Failed to load charts:', error);
      // Fallback to mock data
      let mockCharts = getMockChartData(selectedChartAirport);
      if (selectedChartTypes.length > 0) {
        mockCharts = mockCharts.filter((c) => selectedChartTypes.includes(c.chart_type));
      }
      setCharts(mockCharts);
    }
  }, [selectedChartAirport, selectedChartTypes, showCharts]);

  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  /**
   * 공항 변경 시 지도 이동
   */
  const handleChartAirportChange = useCallback(
    (icao: string) => {
      setSelectedChartAirport(icao);
      const coords = AIRPORT_COORDINATES[icao];
      if (coords) {
        flyTo({ lat: coords.lat, lon: coords.lon }, { zoom: 11 });
      }
    },
    [flyTo]
  );

  /**
   * 항공기 선택 핸들러
   */
  const handleAircraftSelect = useCallback(
    (hex: string) => {
      selectAircraft(hex === selectedAircraftHex ? null : hex);

      // 선택된 항공기로 이동
      const ac = aircraft.find((a) => a.hex === hex);
      if (ac && ac.lat && ac.lon) {
        flyTo({ lat: ac.lat, lon: ac.lon }, { zoom: 12 });
      }
    },
    [selectAircraft, selectedAircraftHex, aircraft, flyTo]
  );

  /**
   * 항공기 선택 해제
   */
  const handleCloseAircraftInfo = useCallback(() => {
    selectAircraft(null);
  }, [selectAircraft]);

  /**
   * 키보드 단축키
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC: 선택 해제
      if (e.key === 'Escape') {
        selectAircraft(null);
      }
      // C: 컨트롤 패널 토글
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          setShowControlPanel((prev) => !prev);
        }
      }
      // L: 항공기 목록 토글
      if (e.key === 'l' || e.key === 'L') {
        setShowAircraftList((prev) => !prev);
      }
      // W: 기상 패널 토글
      if (e.key === 'w' || e.key === 'W') {
        setShowWeather((prev) => !prev);
      }
      // H: 차트 패널 토글
      if (e.key === 'h' || e.key === 'H') {
        setShowCharts((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectAircraft]);

  return (
    <div
      style={{
        width: '100%',
        height: `${windowHeight}px`,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      {/* 지도 */}
      <MapContainer style={{ width: '100%', height: `${windowHeight}px` }}>
        {showCharts && (
          <Suspense fallback={null}>
            <ChartLayer
              airport={selectedChartAirport}
              chartTypes={selectedChartTypes.length > 0 ? selectedChartTypes : undefined}
              opacity={chartOpacity}
              onChartLoad={setCharts}
            />
          </Suspense>
        )}
        <AircraftLayer colorBy="flightPhase" showLabels />
        <TrailLayer color={TRAIL_COLOR} />
        <Suspense fallback={null}>
          <WaypointLayer waypoints={waypoints} showLabels />
          <AirspaceLayer airspaces={airspaces} fillOpacity={0.15} />
        </Suspense>
      </MapContainer>

      {/* 상단 도구 모음 */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          display: 'flex',
          gap: '8px',
          zIndex: 100,
        }}
      >
        <ToolbarButton
          active={showControlPanel}
          onClick={() => setShowControlPanel(!showControlPanel)}
          title="Settings (C)"
        >
          Settings
        </ToolbarButton>
        <ToolbarButton
          active={showAircraftList}
          onClick={() => setShowAircraftList(!showAircraftList)}
          title="Aircraft List (L)"
        >
          Aircraft
        </ToolbarButton>
        <ToolbarButton
          active={showWeather}
          onClick={() => setShowWeather(!showWeather)}
          title="Weather (W)"
        >
          Weather
        </ToolbarButton>
        <ToolbarButton
          active={showCharts}
          onClick={() => setShowCharts(!showCharts)}
          title="AIP Charts (H)"
        >
          Charts
        </ToolbarButton>
      </div>

      {/* 상단 시간/기상 바 */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '60px',
          zIndex: 100,
        }}
      >
        <TimeWeatherBar
          currentTime={currentTime}
          weatherData={toTimeWeatherBarProps(metar, taf)}
          showMetarPopup={showMetarPopup}
          setShowMetarPopup={setShowMetarPopup}
          metarPinned={metarPinned}
          setMetarPinned={setMetarPinned}
          showTafPopup={showTafPopup}
          setShowTafPopup={setShowTafPopup}
          tafPinned={tafPinned}
          setTafPinned={setTafPinned}
          parseMetar={parseMetar}
          parseMetarTime={parseMetarTime}
        />
      </div>

      {/* 항공기 수 표시 */}
      <div
        style={{
          position: 'absolute',
          top: '60px',
          right: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: '6px 12px',
          borderRadius: '6px',
          color: '#fff',
          fontSize: '11px',
          zIndex: 100,
        }}
      >
        <span>AC: <strong>{aircraft.length}</strong></span>
        {isGISLoading && <span style={{ color: '#FF9800' }}>GIS...</span>}
      </div>

      {/* 컨트롤 패널 */}
      {showControlPanel && (
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: '16px',
            zIndex: 100,
          }}
        >
          <Suspense fallback={<PanelLoadingFallback />}>
            <ControlPanel
              trailDuration={trailDuration}
              onTrailDurationChange={setTrailDuration}
            />
          </Suspense>
        </div>
      )}

      {/* 항공기 목록 */}
      {showAircraftList && (
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: showControlPanel ? '236px' : '16px',
            width: '320px',
            zIndex: 100,
          }}
        >
          <Suspense fallback={<PanelLoadingFallback />}>
            <AircraftListPanel
              aircraft={aircraft}
              selectedHex={selectedAircraftHex}
              onSelect={handleAircraftSelect}
            />
          </Suspense>
        </div>
      )}

      {/* 기상 패널 */}
      {showWeather && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            zIndex: 100,
          }}
        >
          <Suspense fallback={<PanelLoadingFallback />}>
            <WeatherPanel
              metar={metar}
              taf={taf}
              weatherRisk={weatherRisk}
              onRefresh={refreshWeather}
            />
          </Suspense>
        </div>
      )}

      {/* 선택된 항공기 정보 */}
      {selectedAircraft && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            zIndex: 100,
          }}
        >
          <Suspense fallback={<PanelLoadingFallback />}>
            <AircraftInfoPanel
              aircraft={selectedAircraft}
              onClose={handleCloseAircraftInfo}
            />
          </Suspense>
        </div>
      )}

      {/* 차트 패널 */}
      {showCharts && (
        <div
          style={{
            position: 'absolute',
            top: '60px',
            right: '16px',
            zIndex: 100,
          }}
        >
          <Suspense fallback={<PanelLoadingFallback />}>
            <ChartPanel
              selectedAirport={selectedChartAirport}
              onAirportChange={handleChartAirportChange}
              selectedChartTypes={selectedChartTypes}
              onChartTypesChange={setSelectedChartTypes}
              chartOpacity={chartOpacity}
              onOpacityChange={setChartOpacity}
              charts={charts}
            />
          </Suspense>
        </div>
      )}

      {/* 하단 정보 */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          fontSize: '10px',
          color: 'rgba(255,255,255,0.5)',
          zIndex: 50,
        }}
      >
        TBAS Viewer | Keys: C (Settings), L (List), W (Weather), H (Charts), ESC (Deselect)
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <Suspense fallback={null}>
          <MapContextMenu
            position={contextMenu.position}
            coordinate={contextMenu.coordinate}
            airspaces={airspaces}
            onClose={closeContextMenu}
          />
        </Suspense>
      )}
    </div>
  );
}

/**
 * 패널 로딩 폴백 컴포넌트
 */
function PanelLoadingFallback() {
  return (
    <div
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: '8px',
        padding: '16px 24px',
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <span
        style={{
          width: '12px',
          height: '12px',
          border: '2px solid rgba(255,255,255,0.3)',
          borderTopColor: '#2196F3',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      Loading...
    </div>
  );
}

/**
 * 도구 모음 버튼 컴포넌트
 * DO-278A 요구사항 추적: SRS-UI-002 (접근성)
 * WCAG 2.1 AA 준수: 최소 터치 타겟 44px, ARIA 속성
 */
function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      tabIndex={0}
      role="button"
      style={{
        backgroundColor: active ? 'rgba(33, 150, 243, 0.8)' : 'rgba(0, 0, 0, 0.7)',
        border: active ? '2px solid #2196F3' : '1px solid rgba(255,255,255,0.2)',
        color: '#fff',
        padding: '12px 18px', // 최소 44px 터치 타겟 확보
        minHeight: '44px',
        minWidth: '44px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: active ? 'bold' : 'normal',
        outline: 'none',
        transition: 'background-color 0.2s, border-color 0.2s',
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(33, 150, 243, 0.5)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {children}
    </button>
  );
}

/**
 * 앱 루트 컴포넌트 (Provider 래핑)
 */
export function App() {
  return (
    <ErrorBoundary>
      <MapProvider initialCenter={DEFAULT_MAP_CENTER} initialZoom={10}>
        <AircraftProvider center={DEFAULT_MAP_CENTER} radiusNM={100} autoUpdate>
          <WeatherProvider icao="RKPU" autoUpdate>
            <RKPUViewer />
          </WeatherProvider>
        </AircraftProvider>
      </MapProvider>
    </ErrorBoundary>
  );
}

export default App;
