/**
 * NotamPanel Component
 * NOTAM 드롭다운 패널 컴포넌트
 */
import React, { useState } from 'react';
import {
  AIRPORT_DATABASE,
  COUNTRY_INFO,
  AIRPORT_COORDINATES,
} from '../constants/airports';
import {
  getNotamType,
  getCancelledNotamRef,
  getNotamValidity,
  buildCancelledNotamSet,
} from '../utils/notam';

interface NotamDataItem {
  id?: string;
  location?: string;
  fir?: string;
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

interface NotamExpandedState {
  [key: string]: boolean;
}

interface SigmetItem {
  hazard?: string;
  seriesId?: string;
  rawSigmet?: string;
  firName?: string;
  base?: number;
  top?: number;
  dir?: string;
  spd?: number;
}

interface SigmetData {
  kma?: SigmetItem[];
  international?: SigmetItem[];
}

interface LightningStrike {
  lat?: number;
  lon?: number;
  amplitude?: number;
}

interface LightningData {
  strikes?: LightningStrike[];
  timeRange?: {
    start?: string;
    end?: string;
  };
}

interface NotamPanelProps {
  // Panel state
  showNotamPanel: boolean;
  setShowNotamPanel: (show: boolean) => void;

  // Data
  notamData: NotamDataResponse | null;
  notamLoading: boolean;
  notamError: string | null;

  // Filters
  notamPeriod: string;
  setNotamPeriod: (period: string) => void;
  notamFilter: string;
  setNotamFilter: (filter: string) => void;

  // Expansion
  notamExpanded: NotamExpandedState;
  setNotamExpanded: React.Dispatch<React.SetStateAction<NotamExpandedState>>;

  // Map layer
  notamLocationsOnMap: Set<string>;
  setNotamLocationsOnMap: (locations: Set<string>) => void;

  // Actions
  fetchNotamData: (period: string, forceRefresh?: boolean) => void;

  // Weather
  showLightning: boolean;
  setShowLightning: (show: boolean) => void;
  showSigmet: boolean;
  setShowSigmet: (show: boolean) => void;
  sigmetData: SigmetData | null;
  lightningData: LightningData | null;
}

interface MapToggleSectionProps {
  notamData: NotamDataResponse | null;
  notamLocationsOnMap: Set<string>;
  setNotamLocationsOnMap: (locations: Set<string>) => void;
}

interface NotamListProps {
  notamData: NotamDataResponse;
  notamFilter: string;
  notamLocationsOnMap: Set<string>;
  notamExpanded: NotamExpandedState;
  setNotamExpanded: React.Dispatch<React.SetStateAction<NotamExpandedState>>;
  pageSize: number;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  onFilteredCountChange: (count: number) => void;
}

interface NotamItemProps {
  notam: NotamDataItem;
  idx: number;
  cancelledSet: Set<string>;
  notamExpanded: NotamExpandedState;
  setNotamExpanded: React.Dispatch<React.SetStateAction<NotamExpandedState>>;
}

const NotamPanel: React.FC<NotamPanelProps> = ({
  // Panel state
  showNotamPanel,
  setShowNotamPanel,

  // Data
  notamData,
  notamLoading,
  notamError,

  // Filters
  notamPeriod,
  setNotamPeriod,
  notamFilter,
  setNotamFilter,

  // Expansion
  notamExpanded,
  setNotamExpanded,

  // Map layer
  notamLocationsOnMap,
  setNotamLocationsOnMap,

  // Actions
  fetchNotamData,

  // Weather
  showLightning,
  setShowLightning,
  showSigmet,
  setShowSigmet,
  sigmetData,
  lightningData,
}) => {
  const [activeTab, setActiveTab] = useState<'notam' | 'weather'>('notam');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [filteredCount, setFilteredCount] = useState(0);

  return (
    <div className="notam-dropdown-wrapper">
      <button
        className={`view-btn ${showNotamPanel ? 'active' : ''}`}
        onClick={() => setShowNotamPanel(!showNotamPanel)}
        title="NOTAM"
        aria-label="NOTAM 패널 열기/닫기"
        aria-expanded={showNotamPanel}
        aria-haspopup="dialog"
      >
        NOTAM
      </button>

      {showNotamPanel && (
        <div className="notam-dropdown" role="dialog" aria-label="NOTAM 패널">
          {/* Header */}
          <div className="notam-dropdown-header">
            <span className="notam-dropdown-title">NOTAM</span>
            <div className="notam-header-controls">
              <button
                className="notam-refresh-btn"
                onClick={() => fetchNotamData(notamPeriod, true)}
                title="새로고침 (캐시 무시)"
                aria-label="NOTAM 데이터 새로고침"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="notam-tab-bar">
            <button className={`notam-tab ${activeTab === 'notam' ? 'active' : ''}`} onClick={() => setActiveTab('notam')}>
              NOTAM
            </button>
            <button className={`notam-tab ${activeTab === 'weather' ? 'active' : ''}`} onClick={() => setActiveTab('weather')}>
              기상
              {((sigmetData?.kma?.length || 0) + (sigmetData?.international?.length || 0)) > 0 && (
                <span className="notam-tab-badge">{(sigmetData?.kma?.length || 0) + (sigmetData?.international?.length || 0)}</span>
              )}
            </button>
          </div>

          {activeTab === 'notam' && (<>
          {/* Search */}
          <div className="notam-search">
            <input
              type="text"
              placeholder="검색 (NOTAM 번호, 내용...)"
              value={notamFilter}
              onChange={(e) => setNotamFilter(e.target.value)}
              className="notam-search-input"
              aria-label="NOTAM 검색"
            />
          </div>

          {/* Period Selector */}
          <div className="notam-period-selector">
            <span className="notam-period-label">기간:</span>
            <div className="notam-period-buttons">
              {[
                { value: 'current', label: '현재 유효', tooltip: '지금 시점에 활성화된 NOTAM (시작일 ≤ 현재 ≤ 종료일)' },
                { value: '1month', label: '1개월', tooltip: '과거 30일 ~ 미래 30일 범위의 NOTAM' },
                { value: '1year', label: '1년', tooltip: '과거 365일 ~ 미래 365일 범위의 NOTAM' },
                { value: 'all', label: '전체', tooltip: '기간 제한 없이 DB의 모든 NOTAM' },
              ].map(({ value, label, tooltip }) => (
                <button
                  key={value}
                  className={`notam-period-btn ${notamPeriod === value ? 'active' : ''}`}
                  onClick={() => setNotamPeriod(value)}
                  aria-pressed={notamPeriod === value}
                  title={tooltip}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Map Toggle Section */}
          <MapToggleSection
            notamData={notamData}
            notamLocationsOnMap={notamLocationsOnMap}
            setNotamLocationsOnMap={setNotamLocationsOnMap}
          />

          {/* Legend */}
          <div className="notam-map-legend">
            <span className="notam-legend-item notam-legend-active">
              <span className="notam-legend-dot" style={{ background: '#FF9800' }}></span>
              활성 NOTAM
            </span>
            <span className="notam-legend-item notam-legend-future">
              <span className="notam-legend-dot" style={{ background: '#2196F3' }}></span>
              예정 NOTAM
            </span>
            <span className="notam-legend-info">
              {notamLocationsOnMap.size === 0 ? '공항 선택 시 지도 표시' : `${notamLocationsOnMap.size}개 공항 표시 중`}
            </span>
          </div>

          {/* Page Size Selector */}
          <div className="notam-page-size-selector">
            <span className="notam-page-size-label">표시:</span>
            <div className="notam-page-size-buttons">
              {[5, 10, 20, 50].map(size => (
                <button
                  key={size}
                  className={`notam-page-size-btn ${pageSize === size ? 'active' : ''}`}
                  onClick={() => { setPageSize(size); setCurrentPage(1); }}
                >
                  {size}개
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="notam-content">
            {notamLoading && <div className="notam-loading">로딩 중...</div>}
            {notamError && <div className="notam-error">오류: {notamError}</div>}
            {notamData && !notamLoading && (
              <NotamList
                notamData={notamData}
                notamFilter={notamFilter}
                notamLocationsOnMap={notamLocationsOnMap}
                notamExpanded={notamExpanded}
                setNotamExpanded={setNotamExpanded}
                pageSize={pageSize}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                onFilteredCountChange={setFilteredCount}
              />
            )}
          </div>

          {/* Footer with Pagination */}
          <div className="notam-footer">
            {notamData && (
              <>
                <span className="notam-count">
                  {notamPeriod === 'current' ? '현재 유효' :
                   notamPeriod === '1month' ? '1개월 범위' :
                   notamPeriod === '1year' ? '1년 범위' : '전체'} NOTAM {filteredCount.toLocaleString()}건
                  {notamLocationsOnMap.size > 0 && ` (${notamLocationsOnMap.size}개 공항 선택)`}
                </span>
                {filteredCount > pageSize && (
                  <div className="notam-pagination">
                    <button
                      className="notam-page-btn"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      aria-label="첫 페이지"
                    >
                      ««
                    </button>
                    <button
                      className="notam-page-btn"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      aria-label="이전 페이지"
                    >
                      «
                    </button>
                    <span className="notam-page-info">{currentPage} / {Math.ceil(filteredCount / pageSize)}</span>
                    <button
                      className="notam-page-btn"
                      onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredCount / pageSize), p + 1))}
                      disabled={currentPage >= Math.ceil(filteredCount / pageSize)}
                      aria-label="다음 페이지"
                    >
                      »
                    </button>
                    <button
                      className="notam-page-btn"
                      onClick={() => setCurrentPage(Math.ceil(filteredCount / pageSize))}
                      disabled={currentPage >= Math.ceil(filteredCount / pageSize)}
                      aria-label="마지막 페이지"
                    >
                      »»
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          </>)}

          {activeTab === 'weather' && (
            <div className="notam-weather-content">
              {/* Map Layer Toggles */}
              <div className="wx-layer-toggles">
                <label className="wx-toggle-item">
                  <input type="checkbox" checked={showLightning} onChange={() => setShowLightning(!showLightning)} />
                  <span>낙뢰 표시</span>
                </label>
                <label className="wx-toggle-item">
                  <input type="checkbox" checked={showSigmet} onChange={() => setShowSigmet(!showSigmet)} />
                  <span>SIGMET 표시</span>
                </label>
              </div>

              {/* SIGMET Section - Korean FIR */}
              <div className="wx-inline-section">
                <div className="wx-section-title">
                  <span>한국 FIR SIGMET</span>
                  <span className="wx-count">{sigmetData?.kma?.length || 0}건</span>
                </div>
                {(!sigmetData?.kma || sigmetData.kma.length === 0) ? (
                  <div className="wx-no-data">현재 발효중인 SIGMET 없음</div>
                ) : (
                  sigmetData.kma.map((sig: SigmetItem, i: number) => (
                    <div key={i} className={`wx-sigmet-item hazard-${(sig.hazard || 'unknown').toLowerCase()}`}>
                      <div className="sigmet-header">
                        <span className="sigmet-type">{sig.hazard || 'SIGMET'}</span>
                        <span className="sigmet-id">{sig.seriesId}</span>
                      </div>
                      <div className="sigmet-raw">{sig.rawSigmet}</div>
                    </div>
                  ))
                )}
              </div>

              {/* SIGMET Section - International */}
              {sigmetData?.international && sigmetData.international.length > 0 && (
                <div className="wx-inline-section">
                  <div className="wx-section-title">
                    <span>국제 SIGMET</span>
                    <span className="wx-count">{sigmetData.international.length}건</span>
                  </div>
                  {sigmetData.international.slice(0, 15).map((sig: SigmetItem, i: number) => (
                    <div key={i} className={`wx-sigmet-item hazard-${(sig.hazard || 'unknown').toLowerCase()}`}>
                      <div className="sigmet-header">
                        <span className="sigmet-type">{sig.hazard || 'SIGMET'}</span>
                        <span className="sigmet-fir">{sig.firName?.split(' ')[0]}</span>
                        <span className="sigmet-id">{sig.seriesId}</span>
                      </div>
                      <div className="sigmet-info">
                        {sig.base != null && sig.top != null && <span>FL{Math.round(sig.base/100)}-{Math.round(sig.top/100)}</span>}
                        {sig.dir && sig.spd && <span> MOV {sig.dir} {sig.spd}kt</span>}
                      </div>
                      <div className="sigmet-raw">{sig.rawSigmet?.slice(0, 200)}{(sig.rawSigmet?.length || 0) > 200 ? '...' : ''}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Lightning Section */}
              <div className="wx-inline-section">
                <div className="wx-section-title">
                  <span>낙뢰 정보 (1시간)</span>
                  <span className="wx-count">{lightningData?.strikes?.length || 0}건</span>
                </div>
                {(!lightningData?.strikes || lightningData.strikes.length === 0) ? (
                  <div className="wx-no-data">최근 1시간 내 낙뢰 발생 없음</div>
                ) : (
                  <>
                    {lightningData.timeRange && (
                      <div className="wx-lightning-time">
                        관측기간: {lightningData.timeRange.start?.slice(8, 12)} - {lightningData.timeRange.end?.slice(8, 12)}
                      </div>
                    )}
                    {lightningData.strikes.slice(0, 50).map((strike: LightningStrike, i: number) => (
                      <div key={i} className="wx-lightning-item">
                        <span className="lightning-pos">{strike.lat?.toFixed(3)}N {strike.lon?.toFixed(3)}E</span>
                        {strike.amplitude && <span className="lightning-amp">{strike.amplitude}kA</span>}
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* SIGMET Legend */}
              <div className="wx-legend-inline">
                <div className="legend-title">SIGMET 유형</div>
                <div className="legend-items">
                  <span className="legend-item"><span className="legend-color turb"></span>TURB 난류</span>
                  <span className="legend-item"><span className="legend-color ice"></span>ICE 착빙</span>
                  <span className="legend-item"><span className="legend-color ts"></span>TS 뇌우</span>
                  <span className="legend-item"><span className="legend-color va"></span>VA 화산재</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Helper: Get effective location for a NOTAM
 * If location has no coordinates, fall back to fir (typically RKRR for Korean FIR)
 */
const getEffectiveLocation = (n: NotamDataItem): string => {
  const loc = n.location || '';
  // If location has coordinates, use it; otherwise fall back to fir (typically RKRR)
  if (loc && AIRPORT_COORDINATES[loc]) return loc;
  return n.fir || loc || '';
};

/**
 * Map Toggle Section Component
 */
const MapToggleSection: React.FC<MapToggleSectionProps> = ({ notamData, notamLocationsOnMap, setNotamLocationsOnMap }) => {

  // Calculate NOTAM counts (period filtering is done server-side by API)
  const getNotamCounts = (): Record<string, number> => {
    const counts: Record<string, number> = {};
    const cancelledSet = buildCancelledNotamSet(notamData?.data || []);
    notamData?.data?.forEach(n => {
      // Skip cancelled NOTAMs (C type)
      const notamType = getNotamType(n.full_text);
      if (notamType === 'C') return;
      // Skip NOTAMs that have been cancelled by another NOTAM
      if (n.notam_number && cancelledSet.has(n.notam_number)) return;
      const effectiveLoc = getEffectiveLocation(n);
      counts[effectiveLoc] = (counts[effectiveLoc] || 0) + 1;
    });
    return counts;
  };
  const notamCounts = getNotamCounts();

  // Get unique locations (including FIR fallbacks)
  const locations = [...new Set(notamData?.data?.map(n => getEffectiveLocation(n)).filter(Boolean) as string[])];
  // Only show locations with coordinates AND with NOTAMs in the current period
  const locationsWithCoords = locations.filter(loc => AIRPORT_COORDINATES[loc] && (notamCounts[loc] || 0) > 0);

  // Group by country
  const byCountry: Record<string, string[]> = {};
  locationsWithCoords.forEach(loc => {
    const info = AIRPORT_DATABASE[loc];
    const country = info?.country || 'OTHER';
    if (!byCountry[country]) byCountry[country] = [];
    byCountry[country].push(loc);
  });

  const countryOrder = ['KR', 'JP', 'CN', 'TW', 'HK', 'VN', 'TH', 'SG', 'PH', 'US', 'OTHER'];
  const sortedCountries = Object.keys(byCountry).sort((a, b) => {
    const ai = countryOrder.indexOf(a);
    const bi = countryOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const toggleLocation = (loc: string): void => {
    const newSet = new Set(notamLocationsOnMap);
    if (newSet.has(loc)) {
      newSet.delete(loc);
    } else {
      newSet.add(loc);
    }
    setNotamLocationsOnMap(newSet);
  };

  const toggleAll = (locs: string[]): void => {
    const newSet = new Set(notamLocationsOnMap);
    const allSelected = locs.every(loc => newSet.has(loc));
    locs.forEach(loc => allSelected ? newSet.delete(loc) : newSet.add(loc));
    setNotamLocationsOnMap(newSet);
  };

  const renderChips = (locs: string[], label: string): React.ReactNode => locs.length > 0 && (
    <div className="notam-country-subgroup" key={label}>
      <span className="notam-subgroup-label">{label}</span>
      <div className="notam-map-location-chips">
        {locs.map(loc => {
          const isActive = notamLocationsOnMap.has(loc);
          const info = AIRPORT_DATABASE[loc];
          const shortName = info?.name?.replace('국제공항', '').replace('공항', '').replace('비행장', '') || loc;
          const count = notamCounts[loc] || 0;
          return (
            <button
              key={loc}
              className={`notam-map-chip ${isActive ? 'active' : ''} ${info?.type || 'other'}`}
              onClick={() => toggleLocation(loc)}
              title={`${loc} ${info?.name || ''} (${count}건) - 지도에 ${isActive ? '숨기기' : '표시'}`}
              aria-pressed={isActive}
              aria-label={`${loc} ${info?.name || ''} (${count}건)`}
            >
              {loc} {shortName !== loc ? shortName : ''} ({count})
            </button>
          );
        })}
        <button className="notam-select-all-btn" onClick={() => toggleAll(locs)} aria-label={`${label} ${locs.every(loc => notamLocationsOnMap.has(loc)) ? '전체 해제' : '전체 선택'}`}>
          {locs.every(loc => notamLocationsOnMap.has(loc)) ? '전체해제' : '전체선택'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="notam-map-toggle-section">
      <span className="notam-map-toggle-label">지도 표시 필터 (좌표 있는 공항만):</span>

      {sortedCountries.map(country => {
        const countryInfo = COUNTRY_INFO[country];
        const countryName = countryInfo?.name || '기타';
        const countryFlag = countryInfo?.flag || '🌐';
        const countryAirports = byCountry[country];
        if (!countryAirports) return null;
        const airportsInCountry = countryAirports.sort();

        if (country === 'KR') {
          const hub = airportsInCountry.filter(loc => AIRPORT_DATABASE[loc]?.type === 'hub');
          const general = airportsInCountry.filter(loc => AIRPORT_DATABASE[loc]?.type === 'general');
          const military = airportsInCountry.filter(loc => AIRPORT_DATABASE[loc]?.type === 'military');
          const fir = airportsInCountry.filter(loc => AIRPORT_DATABASE[loc]?.type === 'fir');
          const other = airportsInCountry.filter(loc => !['hub', 'general', 'military', 'fir'].includes(AIRPORT_DATABASE[loc]?.type || ''));

          return (
            <div className="notam-country-group" key={country}>
              <div className="notam-country-header">{countryFlag} {countryName}</div>
              {renderChips(hub, '거점공항')}
              {renderChips(general, '일반공항')}
              {renderChips(military, '군공항')}
              {renderChips(fir, 'FIR/ACC')}
              {renderChips(other, '기타')}
            </div>
          );
        }

        return (
          <div className="notam-country-group" key={country}>
            <div className="notam-country-header">{countryFlag} {countryName}</div>
            <div className="notam-map-location-chips">
              {airportsInCountry.map(loc => {
                const isActive = notamLocationsOnMap.has(loc);
                const info = AIRPORT_DATABASE[loc];
                const shortName = info?.name?.replace('공항', '').replace('국제', '') || loc;
                const count = notamCounts[loc] || 0;
                return (
                  <button
                    key={loc}
                    className={`notam-map-chip ${isActive ? 'active' : ''} ${info?.type || 'other'}`}
                    onClick={() => toggleLocation(loc)}
                    title={`${loc} ${info?.name || ''} (${count}건) - 지도에 ${isActive ? '숨기기' : '표시'}`}
                    aria-pressed={isActive}
                    aria-label={`${loc} ${info?.name || ''} (${count}건)`}
                  >
                    {loc} {shortName !== loc ? shortName : ''} ({count})
                  </button>
                );
              })}
              <button className="notam-select-all-btn" onClick={() => toggleAll(airportsInCountry)} aria-label={`${countryName} ${airportsInCountry.every(loc => notamLocationsOnMap.has(loc)) ? '전체 해제' : '전체 선택'}`}>
                {airportsInCountry.every(loc => notamLocationsOnMap.has(loc)) ? '전체해제' : '전체선택'}
              </button>
            </div>
          </div>
        );
      })}

      {notamLocationsOnMap.size > 0 && (
        <button
          className="notam-map-clear-btn"
          onClick={() => setNotamLocationsOnMap(new Set())}
          aria-label={`지도 필터 해제 (${notamLocationsOnMap.size}개 선택됨)`}
        >
          필터 해제 ({notamLocationsOnMap.size}개 선택됨)
        </button>
      )}
    </div>
  );
};

/**
 * NOTAM List Component
 */
const NotamList: React.FC<NotamListProps> = ({
  notamData, notamFilter, notamLocationsOnMap,
  notamExpanded, setNotamExpanded,
  pageSize, currentPage, setCurrentPage, onFilteredCountChange
}) => {
  const cancelledSet = buildCancelledNotamSet(notamData.data || []);

  const filtered = React.useMemo(() => {
    return notamData.data?.filter(n => {
      // Use effective location (fir fallback for NOTAMs without coordinate-mapped airports)
      const effectiveLoc = getEffectiveLocation(n);
      const matchMapFilter = notamLocationsOnMap.size === 0 || notamLocationsOnMap.has(effectiveLoc);
      const matchSearch = !notamFilter ||
        n.notam_number?.toLowerCase().includes(notamFilter.toLowerCase()) ||
        n.location?.toLowerCase().includes(notamFilter.toLowerCase()) ||
        n.e_text?.toLowerCase().includes(notamFilter.toLowerCase()) ||
        n.qcode_mean?.toLowerCase().includes(notamFilter.toLowerCase());
      // Skip cancelled NOTAMs (C type)
      const notamType = getNotamType(n.full_text);
      if (notamType === 'C') return false;
      // Skip NOTAMs that have been cancelled by another NOTAM
      if (n.notam_number && cancelledSet.has(n.notam_number)) return false;
      // Note: Period filtering is done server-side by API, so we don't filter by period here
      return matchMapFilter && matchSearch;
    }) || [];
  }, [notamData.data, notamLocationsOnMap, notamFilter, cancelledSet]);

  // Report filtered count to parent
  React.useEffect(() => {
    onFilteredCountChange(filtered.length);
  }, [filtered.length, onFilteredCountChange]);

  // Reset to page 1 when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [notamFilter, notamLocationsOnMap.size, setCurrentPage]);

  if (filtered.length === 0) {
    return <div className="notam-empty">해당 조건의 NOTAM이 없습니다.</div>;
  }

  // Paginate
  const startIdx = (currentPage - 1) * pageSize;
  const paginatedNotams = filtered.slice(startIdx, startIdx + pageSize);

  return (
    <div className="notam-list">
      {paginatedNotams.map((n, idx) => (
        <NotamItem
          key={n.id || (startIdx + idx)}
          notam={n}
          idx={startIdx + idx}
          cancelledSet={cancelledSet}
          notamExpanded={notamExpanded}
          setNotamExpanded={setNotamExpanded}
        />
      ))}
    </div>
  );
};

/**
 * NOTAM Item Component
 */
const NotamItem: React.FC<NotamItemProps> = ({ notam, idx, cancelledSet, notamExpanded, setNotamExpanded }) => {
  const n = notam;
  const notamType = getNotamType(n.full_text || '');
  const typeLabel = notamType === 'R' ? 'REPLACE' : notamType === 'C' ? 'CANCEL' : 'NEW';
  const cancelledRef = getCancelledNotamRef(n.full_text || '');
  const validity = getNotamValidity(n, cancelledSet);
  const validityLabel = validity === 'future' ? '예정' : '활성';
  const itemKey = n.id || String(idx);

  return (
    <div className={`notam-item notam-type-${notamType} notam-validity-${validity}`}>
      <div
        className="notam-item-header"
        onClick={() => setNotamExpanded(p => ({ ...p, [itemKey]: !p[itemKey] }))}
        role="button"
        tabIndex={0}
        aria-expanded={notamExpanded[itemKey] || false}
        aria-label={`${n.location} ${n.notam_number} - ${validityLabel} ${typeLabel}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setNotamExpanded(p => ({ ...p, [itemKey]: !p[itemKey] }));
          }
        }}
      >
        <span className="notam-location">{n.location}</span>
        <span className="notam-number">{n.notam_number}</span>
        <span className={`notam-validity-badge notam-validity-${validity}`}>{validityLabel}</span>
        <span className={`notam-type-badge notam-type-${notamType}`}>{typeLabel}</span>
        <span className={`notam-expand-icon ${notamExpanded[itemKey] ? 'expanded' : ''}`}>▼</span>
      </div>

      {notamExpanded[itemKey] && (
        <div className="notam-item-detail">
          {notamType === 'R' && cancelledRef && (
            <div className="notam-detail-row notam-replaced-ref">
              <span className="notam-label">대체 대상:</span>
              <span>{cancelledRef}</span>
            </div>
          )}
          <div className="notam-detail-row">
            <span className="notam-label">Q-Code:</span>
            <span>{n.qcode} - {n.qcode_mean}</span>
          </div>
          <div className="notam-detail-row">
            <span className="notam-label">유효기간:</span>
            <span>{n.effective_start || '-'} ~ {n.effective_end || 'PERM'}</span>
          </div>
          <div className="notam-detail-row">
            <span className="notam-label">내용:</span>
          </div>
          <div className="notam-e-text">{n.e_text}</div>
          {n.full_text && (
            <>
              <div className="notam-detail-row">
                <span className="notam-label">전문:</span>
              </div>
              <div className="notam-full-text">{n.full_text}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NotamPanel;
