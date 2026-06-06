/**
 * ViewControlsBar Component
 * 뷰 컨트롤 바 (2D/3D, 다크모드, 기상 드롭다운 등)
 * 관제 패널은 좌측 패널로 이동됨, 기상레이더 제거됨
 */
import React from 'react';
import NotamPanel from './NotamPanel';

interface NotamExpandedState {
  [key: string]: boolean;
}

interface NotamDataItem {
  id?: string;
  location?: string;
  notam_number?: string;
  e_text?: string;
  qcode?: string;
  qcode_mean?: string;
  full_text?: string;
  effective_start?: string;
  effective_end?: string;
  [key: string]: unknown;
}

interface NotamDataResponse {
  data?: NotamDataItem[];
  returned?: number;
}

interface ViewControlsBarProps {
  // 2D/3D Toggle
  is3DView: boolean;
  setIs3DView: (is3D: boolean) => void;
  // Dark Mode
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  // Satellite
  showSatellite: boolean;
  setShowSatellite: (show: boolean) => void;
  // Weather (pass-through to NotamPanel)
  showLightning: boolean;
  setShowLightning: (show: boolean) => void;
  showSigmet: boolean;
  setShowSigmet: (show: boolean) => void;
  sigmetData: unknown;
  lightningData: unknown;
  // NOTAM Panel props
  showNotamPanel: boolean;
  setShowNotamPanel: (show: boolean) => void;
  notamData: NotamDataResponse | null;
  notamLoading: boolean;
  notamError: string | null;
  notamPeriod: string;
  setNotamPeriod: (period: string) => void;
  notamFilter: string;
  setNotamFilter: (filter: string) => void;
  notamExpanded: NotamExpandedState;
  setNotamExpanded: React.Dispatch<React.SetStateAction<NotamExpandedState>>;
  notamLocationsOnMap: Set<string>;
  setNotamLocationsOnMap: (locations: Set<string>) => void;
  fetchNotamData: (period: string, forceRefresh?: boolean) => void;
}

/**
 * View Controls Bar Component
 * 관제 패널은 좌측 패널로 이동됨
 * DO-278A 요구사항 추적: SRS-PERF-003
 */
const ViewControlsBar: React.FC<ViewControlsBarProps> = React.memo(({
  // 2D/3D Toggle
  is3DView,
  setIs3DView,
  // Dark Mode
  isDarkMode,
  setIsDarkMode,
  // Satellite
  showSatellite,
  setShowSatellite,
  // Weather (pass-through to NotamPanel)
  showLightning,
  setShowLightning,
  showSigmet,
  setShowSigmet,
  sigmetData,
  lightningData,
  // NOTAM Panel props
  showNotamPanel,
  setShowNotamPanel,
  notamData,
  notamLoading,
  notamError,
  notamPeriod,
  setNotamPeriod,
  notamFilter,
  setNotamFilter,
  notamExpanded,
  setNotamExpanded,
  notamLocationsOnMap,
  setNotamLocationsOnMap,
  fetchNotamData
}) => {
  return (
    <div className="view-controls" role="toolbar" aria-label="지도 뷰 컨트롤">
      <button className="view-btn" onClick={() => setIs3DView(!is3DView)} aria-pressed={is3DView} aria-label={is3DView ? '2D 보기로 전환' : '3D 보기로 전환'}>{is3DView ? '3D' : '2D'}</button>
      <button
        className="view-btn icon-btn"
        onClick={() => setIsDarkMode(!isDarkMode)}
        title={isDarkMode ? '라이트 모드' : '다크 모드'}
        aria-label={isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
        aria-pressed={isDarkMode}
      >
        {isDarkMode ? '🌙' : '☀️'}
      </button>
      <button
        className={`view-btn icon-btn ${showSatellite ? 'active' : ''}`}
        onClick={() => setShowSatellite(!showSatellite)}
        title="위성 사진"
        aria-label="위성 사진 표시"
        aria-pressed={showSatellite}
      >
        🛰️
      </button>

      <NotamPanel
        showNotamPanel={showNotamPanel}
        setShowNotamPanel={setShowNotamPanel}
        notamData={notamData}
        notamLoading={notamLoading}
        notamError={notamError}
        notamPeriod={notamPeriod}
        setNotamPeriod={setNotamPeriod}
        notamFilter={notamFilter}
        setNotamFilter={setNotamFilter}
        notamExpanded={notamExpanded}
        setNotamExpanded={setNotamExpanded}
        notamLocationsOnMap={notamLocationsOnMap}
        setNotamLocationsOnMap={setNotamLocationsOnMap}
        fetchNotamData={fetchNotamData}
        showLightning={showLightning}
        setShowLightning={setShowLightning}
        showSigmet={showSigmet}
        setShowSigmet={setShowSigmet}
        sigmetData={sigmetData as never}
        lightningData={lightningData as never}
      />
    </div>
  );
});
ViewControlsBar.displayName = 'ViewControlsBar';

export default ViewControlsBar;
