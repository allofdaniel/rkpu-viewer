import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Import Zustand stores
import {
  useMapStore,
  useUIStore,
  useAircraftStore,
  useAtcStore,
  useLayerStore,
} from './stores';

// Import constants
import {
  MAPBOX_ACCESS_TOKEN,
  PROCEDURE_CHARTS,
} from './constants/config';

import { AIRPORT_DATABASE } from './constants/airports';

// Import weather utilities
import { parseMetar, parseMetarTime } from './utils/weather';

// Import aircraft constants
import { getAircraftImage } from './constants/aircraft';

// Import flight utilities
import {
  detectFlightPhase,
  detectCurrentAirspace,
  findNearestWaypoints,
  detectCurrentProcedure,
} from './utils/flight';

// Import components
import {
  AltitudeLegend,
  Accordion,
  ToggleItem,
  SidPanel,
  StarPanel,
  ApproachPanel,
  ChartOverlayPanel,
  AircraftDetailPanel,
  TimeWeatherBar,
  ViewControlsBar,
  AircraftControlPanel,
  KoreaAirspacePanel,
  GlobalDataPanel,
} from './components';

// Import hooks
import {
  useChartOverlay,
  useMapStyle,
  useAtcRadarRings,
  useAtcSectors,
  useKoreaAirspace,
  useWeatherLayers,
  useAircraftVisualization,
  useAircraftData,
  useSelectedAircraft,
  useAircraftClickHandler,
  useProcedureRendering,
  useNotamLayer,
  useNotamData,
  useWeatherData,
  useAirspaceLayers,
  useMapInit,
  useDataLoading,
  useWindowHeight,
  useGlobalData,
  useGlobalLayers,
} from './hooks';

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

function App() {
  const mapContainer = useRef(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // ============================================
  // Zustand Stores
  // ============================================

  // Map store
  const {
    is3DView, setIs3DView,
    isDarkMode, setIsDarkMode,
    showSatellite, setShowSatellite,
    showBuildings,
    showTerrain, setShowTerrain,
    show3DAltitude, setShow3DAltitude,
  } = useMapStore();

  // UI store
  const {
    isPanelOpen, setIsPanelOpen,
    layersExpanded, setLayersExpanded,
    aircraftExpanded, setAircraftExpanded,
    sidExpanded, setSidExpanded,
    starExpanded, setStarExpanded,
    apchExpanded, setApchExpanded,
    chartExpanded, setChartExpanded,
    koreaRoutesExpanded, setKoreaRoutesExpanded,
    showAtcPanel, setShowAtcPanel,
    atcExpanded, setAtcExpanded, toggleAtcSection,
    showWxPanel, setShowWxPanel,
    wxPanelTab, setWxPanelTab,
    wxLayersExpanded, setWxLayersExpanded,
    showNotamPanel, setShowNotamPanel,
    showMetarPopup, setShowMetarPopup,
    showTafPopup, setShowTafPopup,
    metarPinned, setMetarPinned,
    tafPinned, setTafPinned,
    sectionExpanded, toggleSection,
    globalExpanded, setGlobalExpanded,
  } = useUIStore();

  // Aircraft store
  const {
    showAircraft, setShowAircraft,
    showAircraftTrails, setShowAircraftTrails,
    show3DAircraft, setShow3DAircraft,
    trailDuration, setTrailDuration,
    headingPrediction, setHeadingPrediction,
    labelOffset, setLabelOffset,
    isDraggingLabel, setIsDraggingLabel,
    selectedAircraft, setSelectedAircraft,
    graphHoverData, setGraphHoverData,
  } = useAircraftStore();

  // ATC store
  const {
    atcOnlyMode, setAtcOnlyMode,
    radarRange, setRadarRange,
    radarBlackBackground, setRadarBlackBackground,
    selectedAtcSectors, setSelectedAtcSectors,
    toggleSectorGroup,
  } = useAtcStore();

  // Layer store
  const {
    showWaypoints, setShowWaypoints,
    showObstacles, setShowObstacles,
    showAirspace, setShowAirspace,
    showLightning, setShowLightning,
    showSigmet, setShowSigmet,
    showKoreaRoutes, setShowKoreaRoutes,
    showKoreaWaypoints, setShowKoreaWaypoints,
    showKoreaNavaids, setShowKoreaNavaids,
    showKoreaAirspaces, setShowKoreaAirspaces,
    showKoreaAirports, setShowKoreaAirports,
    showKoreaHoldings, setShowKoreaHoldings,
    showKoreaTerminalWaypoints, setShowKoreaTerminalWaypoints,
    showKoreaSids, setShowKoreaSids,
    showKoreaStars, setShowKoreaStars,
    showKoreaIaps, setShowKoreaIaps,
    selectedKoreaAirport, setSelectedKoreaAirport,
    showGlobalAirports, setShowGlobalAirports,
    showGlobalNavaids, setShowGlobalNavaids,
    showGlobalHeliports, setShowGlobalHeliports,
    showGlobalWaypoints, setShowGlobalWaypoints,
    showGlobalAirways, setShowGlobalAirways,
    showGlobalHoldings, setShowGlobalHoldings,
    showGlobalCtrlAirspace, setShowGlobalCtrlAirspace,
    showGlobalRestrAirspace, setShowGlobalRestrAirspace,
    showGlobalFirUir, setShowGlobalFirUir,
  } = useLayerStore();

  // ============================================
  // Local State (남은 것들 - 데이터 관련)
  // ============================================

  const [activeCharts, setActiveCharts] = useState({});
  const [selectedChartAirport, setSelectedChartAirport] = useState('RKPU');

  // ============================================
  // Custom Hooks
  // ============================================

  // Map initialization hook
  const { map, mapLoaded, setMapLoaded } = useMapInit(mapContainer);

  // Data loading hook
  const {
    data,
    sidVisible, setSidVisible,
    starVisible, setStarVisible,
    apchVisible, setApchVisible,
    procColors,
    chartBounds,
    allChartBounds,
    chartOpacities, setChartOpacities,
    atcData,
    koreaAirspaceData,
  } = useDataLoading();

  // Window height hook (Android WebView fix)
  const windowHeight = useWindowHeight(map);

  // Map style hook
  useMapStyle({
    map, mapLoaded, setMapLoaded,
    isDarkMode, showSatellite, radarBlackBackground,
    is3DView, setIs3DView, showTerrain, show3DAltitude
  });

  // Chart overlay hook
  useChartOverlay(map, mapLoaded, activeCharts, chartOpacities, allChartBounds, selectedChartAirport);

  // ATC hooks
  useAtcRadarRings(map, mapLoaded, atcOnlyMode, radarRange, radarBlackBackground);
  useAtcSectors(map, mapLoaded, atcData, selectedAtcSectors);
  useKoreaAirspace(map, mapLoaded, koreaAirspaceData, showKoreaRoutes, showKoreaWaypoints, showKoreaNavaids, showKoreaAirspaces, showKoreaAirports, is3DView, show3DAltitude, showKoreaHoldings, showKoreaTerminalWaypoints);

  // Aircraft data hook
  const { aircraft, aircraftTrails, dataHealth } = useAircraftData(data, mapLoaded, showAircraft, trailDuration);

  // Selected aircraft details hook
  const {
    aircraftPhoto, aircraftPhotoLoading,
    aircraftDetails, aircraftDetailsLoading,
    flightSchedule, flightScheduleLoading,
    flightTrack, flightTrackLoading,
    showAircraftPanel, setShowAircraftPanel,
  } = useSelectedAircraft(selectedAircraft);

  // Procedure rendering hook
  const { hasActiveProcedure } = useProcedureRendering(
    map, mapLoaded, data, sidVisible, starVisible, apchVisible, procColors, is3DView, show3DAltitude
  );

  // Aircraft visualization hook
  useAircraftVisualization(
    map, mapLoaded, aircraft, aircraftTrails, showAircraft, showAircraftTrails,
    show3DAircraft, is3DView, show3DAltitude, trailDuration, headingPrediction, selectedAircraft, labelOffset
  );

  // Aircraft click handler hook
  useAircraftClickHandler(map, mapLoaded, aircraft, selectedAircraft, setSelectedAircraft);

  // Weather data hook
  const { weatherData, lightningData, sigmetData, weatherHealth } = useWeatherData(
    data?.airport, false, false, showLightning, showSigmet, showWxPanel
  );

  // NOTAM data hook
  const {
    notamData, notamLoading, notamError, notamCacheAge,
    notamPeriod, setNotamPeriod,
    notamFilter, setNotamFilter,
    notamLocationFilter, setNotamLocationFilter,
    notamExpanded: notamItemExpanded, setNotamExpanded: setNotamItemExpanded,
    notamLocationsOnMap, setNotamLocationsOnMap,
    fetchNotamData,
    notamHealth,
  } = useNotamData();

  // Weather layers hook
  useWeatherLayers(map, mapLoaded, weatherData, data, false, showLightning, lightningData, showSigmet, sigmetData);

  // NOTAM layer hook
  useNotamLayer(map, mapLoaded, notamLocationsOnMap, notamData, is3DView);

  // Airspace layers hook
  useAirspaceLayers(map, mapLoaded, data, showWaypoints, showObstacles, showAirspace, show3DAltitude, is3DView, hasActiveProcedure);

  // Global data hooks
  const { data: globalData, counts: globalCounts, loading: globalLoading } = useGlobalData(
    showGlobalAirports, showGlobalNavaids, showGlobalHeliports, showGlobalWaypoints,
    showGlobalAirways, showGlobalHoldings, showGlobalCtrlAirspace, showGlobalRestrAirspace, showGlobalFirUir
  );
  useGlobalLayers(
    map, mapLoaded, globalData,
    showGlobalAirports, showGlobalNavaids, showGlobalHeliports, showGlobalWaypoints,
    showGlobalAirways, showGlobalHoldings, showGlobalCtrlAirspace, showGlobalRestrAirspace, showGlobalFirUir
  );

  // ============================================
  // Effects
  // ============================================

  // Current time update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle terrain toggle
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (is3DView && showTerrain && !show3DAltitude) {
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
    } else {
      map.current.setTerrain(null);
    }
  }, [showTerrain, is3DView, show3DAltitude, mapLoaded]);

  // Handle 3D buildings visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    try {
      if (map.current.getLayer('3d-buildings')) {
        map.current.setLayoutProperty('3d-buildings', 'visibility', showBuildings && is3DView ? 'visible' : 'none');
      }
    } catch (e) {}
  }, [showBuildings, is3DView, mapLoaded]);

  // ============================================
  // Handlers
  // ============================================

  const toggleChart = (chartId) => setActiveCharts(prev => ({ ...prev, [chartId]: !prev[chartId] }));
  const updateChartOpacity = (chartId, opacity) => setChartOpacities(prev => ({ ...prev, [chartId]: opacity }));

  const flyToAirport = () => {
    map.current?.flyTo({
      center: [129.3518, 35.5934],
      zoom: 12,
      pitch: is3DView ? 60 : 0,
      bearing: is3DView ? -30 : 0,
      duration: 2000
    });
  };

  const handleAtcModeToggle = (enabled) => {
    setAtcOnlyMode(enabled);
    // 카메라 이동 없이 레이더 모드만 토글
  };

  const chartsByRunway = {
    '18': Object.entries(PROCEDURE_CHARTS).filter(([_, c]) => c.runway === '18'),
    '36': Object.entries(PROCEDURE_CHARTS).filter(([_, c]) => c.runway === '36'),
  };

  // ============================================
  // Render
  // ============================================

  // Mapbox 토큰 검증
  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <div
        className="app-container dark-mode"
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a2e',
          color: '#fff',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h2 style={{ color: '#ff6b6b', marginBottom: '1rem' }}>Mapbox 설정 오류</h2>
        <p style={{ marginBottom: '0.5rem' }}>VITE_MAPBOX_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.</p>
        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
          .env 파일에 Mapbox 토큰을 추가하세요.
        </p>
        <code style={{
          backgroundColor: '#2a2a3e',
          padding: '1rem',
          borderRadius: '8px',
          marginTop: '1rem',
          fontSize: '0.85rem'
        }}>
          VITE_MAPBOX_ACCESS_TOKEN=pk.your_token_here
        </code>
      </div>
    );
  }

  return (
    <div
      className={`app-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`}
      style={{
        height: `${windowHeight}px`,
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        overflow: 'hidden'
      }}
    >
      <div ref={mapContainer} id="map" style={{ height: `${windowHeight}px` }} />

      {/* Time & Weather Display */}
      <TimeWeatherBar
        currentTime={currentTime}
        weatherData={weatherData}
        dataHealth={dataHealth}
        weatherHealth={weatherHealth}
        notamHealth={notamHealth}
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

      {/* View Controls */}
      <ViewControlsBar
        is3DView={is3DView}
        setIs3DView={setIs3DView}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        showSatellite={showSatellite}
        setShowSatellite={setShowSatellite}
        showLightning={showLightning}
        setShowLightning={setShowLightning}
        showSigmet={showSigmet}
        setShowSigmet={setShowSigmet}
        sigmetData={sigmetData}
        lightningData={lightningData}
        showNotamPanel={showNotamPanel}
        setShowNotamPanel={setShowNotamPanel}
        notamData={notamData}
        notamLoading={notamLoading}
        notamError={notamError}
        notamCacheAge={notamCacheAge}
        notamPeriod={notamPeriod}
        setNotamPeriod={setNotamPeriod}
        notamLocationFilter={notamLocationFilter}
        setNotamLocationFilter={setNotamLocationFilter}
        notamFilter={notamFilter}
        setNotamFilter={setNotamFilter}
        notamExpanded={notamItemExpanded}
        setNotamExpanded={setNotamItemExpanded}
        notamLocationsOnMap={notamLocationsOnMap}
        setNotamLocationsOnMap={setNotamLocationsOnMap}
        fetchNotamData={fetchNotamData}
      />

      {/* Mobile Menu Toggle Button */}
      {!isPanelOpen && (
        <button
          className="mobile-menu-toggle"
          onClick={() => setIsPanelOpen(true)}
          aria-label="메뉴 열기"
        >
          ☰
        </button>
      )}

      {/* Control Panel */}
      <div className={`control-panel ${isPanelOpen ? 'open' : 'closed'}`}>
        <div className="panel-header">
          <span className="panel-title">TBAS</span>
          <button className="panel-close-btn" onClick={() => setIsPanelOpen(false)} aria-label="패널 닫기">✕</button>
        </div>

        <div className="panel-content">
          <AltitudeLegend />

          {/* 울산공항 레이어 */}
          <Accordion title="울산공항 (RKPU)" expanded={layersExpanded} onToggle={() => setLayersExpanded(!layersExpanded)}>
            <ToggleItem label="웨이포인트" checked={showWaypoints} onChange={setShowWaypoints} disabled={hasActiveProcedure} hint={hasActiveProcedure ? "(절차별)" : null} />
            <ToggleItem label="장애물" checked={showObstacles} onChange={setShowObstacles} />
            <ToggleItem label="공역" checked={showAirspace} onChange={setShowAirspace} />
            {is3DView && <ToggleItem label="3D 고도 표시" checked={show3DAltitude} onChange={setShow3DAltitude} />}
            {is3DView && <ToggleItem label="지형" checked={showTerrain} onChange={setShowTerrain} />}
            {is3DView && <ToggleItem label="3D 건물" checked={showBuildings} onChange={(v) => useMapStore.getState().setShowBuildings(v)} />}
          </Accordion>

          {/* 관제구역 - ATC Sectors */}
          <Accordion
            title={`관제구역${selectedAtcSectors.size > 0 ? ` (${selectedAtcSectors.size})` : ''}`}
            expanded={showAtcPanel}
            onToggle={() => setShowAtcPanel(!showAtcPanel)}
          >
            {atcData && (
              <>
                {/* 레이더 뷰 토글 */}
                <div className="toggle-item" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', marginBottom: '8px' }}>
                  <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={atcOnlyMode} onChange={(e) => handleAtcModeToggle(e.target.checked)} />
                    <span>레이더 뷰 ({radarRange}nm)</span>
                  </label>
                </div>

                {atcOnlyMode && (
                  <div style={{ marginBottom: '12px', padding: '8px', background: 'rgba(0,255,0,0.1)', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                      <span>범위</span>
                      <span>{radarRange}nm</span>
                    </div>
                    <input type="range" min="50" max="500" step="50" value={radarRange} onChange={(e) => setRadarRange(parseInt(e.target.value))} style={{ width: '100%' }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '11px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={radarBlackBackground} onChange={(e) => setRadarBlackBackground(e.target.checked)} />
                      검은 배경
                    </label>
                  </div>
                )}

                {/* ACC/TMA/CTR 일괄 선택 */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                  {['ACC', 'TMA', 'CTR'].map(type => (
                    <button
                      key={type}
                      className={`mini-btn ${atcData[type].every(s => selectedAtcSectors.has(s.id)) ? 'active' : ''}`}
                      onClick={() => toggleSectorGroup(atcData[type].map(s => s.id))}
                    >
                      {type} ({atcData[type].length})
                    </button>
                  ))}
                </div>

                {/* 섹터 목록 */}
                {['ACC', 'TMA', 'CTR'].map(type => (
                  <div key={type} style={{ marginBottom: '8px' }}>
                    <div
                      style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      onClick={() => toggleAtcSection(type)}
                    >
                      <span>{type}</span>
                      <span style={{ fontSize: '10px' }}>{atcExpanded[type] ? '▼' : '▶'}</span>
                    </div>
                    {atcExpanded[type] && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {atcData[type].map(s => (
                          <label
                            key={s.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', fontSize: '10px',
                              background: selectedAtcSectors.has(s.id) ? 'rgba(0,255,0,0.3)' : 'rgba(255,255,255,0.1)',
                              borderRadius: '4px', cursor: 'pointer'
                            }}
                            title={s.name}
                          >
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }}></span>
                            <input
                              type="checkbox"
                              checked={selectedAtcSectors.has(s.id)}
                              onChange={e => {
                                const newSet = new Set(selectedAtcSectors);
                                e.target.checked ? newSet.add(s.id) : newSet.delete(s.id);
                                setSelectedAtcSectors(newSet);
                              }}
                              style={{ display: 'none' }}
                            />
                            <span>{s.name.split(' - ').pop().replace(/ (ACC|TMA|CTR)$/, '').substring(0, 8)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </Accordion>

          {/* Korea Airspace Panel */}
          <KoreaAirspacePanel
            koreaAirspaceData={koreaAirspaceData}
            koreaRoutesExpanded={koreaRoutesExpanded}
            setKoreaRoutesExpanded={setKoreaRoutesExpanded}
            showKoreaRoutes={showKoreaRoutes}
            setShowKoreaRoutes={setShowKoreaRoutes}
            showKoreaWaypoints={showKoreaWaypoints}
            setShowKoreaWaypoints={setShowKoreaWaypoints}
            showKoreaNavaids={showKoreaNavaids}
            setShowKoreaNavaids={setShowKoreaNavaids}
            showKoreaAirspaces={showKoreaAirspaces}
            setShowKoreaAirspaces={setShowKoreaAirspaces}
            showKoreaAirports={showKoreaAirports}
            setShowKoreaAirports={setShowKoreaAirports}
            showKoreaHoldings={showKoreaHoldings}
            setShowKoreaHoldings={setShowKoreaHoldings}
            showKoreaTerminalWaypoints={showKoreaTerminalWaypoints}
            setShowKoreaTerminalWaypoints={setShowKoreaTerminalWaypoints}
            showKoreaSids={showKoreaSids}
            setShowKoreaSids={setShowKoreaSids}
            showKoreaStars={showKoreaStars}
            setShowKoreaStars={setShowKoreaStars}
            showKoreaIaps={showKoreaIaps}
            setShowKoreaIaps={setShowKoreaIaps}
            selectedKoreaAirport={selectedKoreaAirport}
            setSelectedKoreaAirport={setSelectedKoreaAirport}
          />

          {/* Global Data Panel - Disabled for Korea-only view
          <GlobalDataPanel
            globalExpanded={globalExpanded}
            setGlobalExpanded={setGlobalExpanded}
            counts={globalCounts}
            loading={globalLoading}
            showGlobalAirports={showGlobalAirports}
            setShowGlobalAirports={setShowGlobalAirports}
            showGlobalNavaids={showGlobalNavaids}
            setShowGlobalNavaids={setShowGlobalNavaids}
            showGlobalHeliports={showGlobalHeliports}
            setShowGlobalHeliports={setShowGlobalHeliports}
            showGlobalWaypoints={showGlobalWaypoints}
            setShowGlobalWaypoints={setShowGlobalWaypoints}
            showGlobalAirways={showGlobalAirways}
            setShowGlobalAirways={setShowGlobalAirways}
            showGlobalHoldings={showGlobalHoldings}
            setShowGlobalHoldings={setShowGlobalHoldings}
            showGlobalCtrlAirspace={showGlobalCtrlAirspace}
            setShowGlobalCtrlAirspace={setShowGlobalCtrlAirspace}
            showGlobalRestrAirspace={showGlobalRestrAirspace}
            setShowGlobalRestrAirspace={setShowGlobalRestrAirspace}
            showGlobalFirUir={showGlobalFirUir}
            setShowGlobalFirUir={setShowGlobalFirUir}
          />
          */}

          {/* Aircraft Control Panel */}
          <AircraftControlPanel
            aircraftExpanded={aircraftExpanded}
            setAircraftExpanded={setAircraftExpanded}
            showAircraft={showAircraft}
            setShowAircraft={setShowAircraft}
            showAircraftTrails={showAircraftTrails}
            setShowAircraftTrails={setShowAircraftTrails}
            show3DAircraft={show3DAircraft}
            setShow3DAircraft={setShow3DAircraft}
            is3DView={is3DView}
            trailDuration={trailDuration}
            setTrailDuration={setTrailDuration}
            headingPrediction={headingPrediction}
            setHeadingPrediction={setHeadingPrediction}
            labelOffset={labelOffset}
            setLabelOffset={setLabelOffset}
            isDraggingLabel={isDraggingLabel}
            setIsDraggingLabel={setIsDraggingLabel}
          />

          {/* SID 출발절차 */}
          <SidPanel
            procedures={data?.procedures?.SID}
            expanded={sidExpanded}
            onToggle={() => setSidExpanded(!sidExpanded)}
            visible={sidVisible}
            setVisible={setSidVisible}
            colors={procColors.SID}
          />

          {/* STAR 도착절차 */}
          <StarPanel
            procedures={data?.procedures?.STAR}
            expanded={starExpanded}
            onToggle={() => setStarExpanded(!starExpanded)}
            visible={starVisible}
            setVisible={setStarVisible}
            colors={procColors.STAR}
          />

          {/* APCH 접근절차 */}
          <ApproachPanel
            procedures={data?.procedures?.APPROACH}
            expanded={apchExpanded}
            onToggle={() => setApchExpanded(!apchExpanded)}
            visible={apchVisible}
            setVisible={setApchVisible}
            colors={procColors.APPROACH}
          />

          {/* 차트 오버레이 */}
          <ChartOverlayPanel
            chartsByRunway={chartsByRunway}
            expanded={chartExpanded}
            onToggle={() => setChartExpanded(!chartExpanded)}
            activeCharts={activeCharts}
            toggleChart={toggleChart}
            chartOpacities={chartOpacities}
            updateChartOpacity={updateChartOpacity}
            allChartBounds={allChartBounds}
            selectedAirport={selectedChartAirport}
            setSelectedAirport={setSelectedChartAirport}
            map={map}
          />

          <div className="section">
            <button className="fly-btn" onClick={flyToAirport}>공항으로 이동</button>
          </div>
        </div>
      </div>

      {/* Aircraft Detail Panel */}
      <AircraftDetailPanel
        showAircraftPanel={showAircraftPanel}
        setShowAircraftPanel={setShowAircraftPanel}
        selectedAircraft={selectedAircraft}
        setSelectedAircraft={setSelectedAircraft}
        aircraft={aircraft}
        aircraftPhoto={aircraftPhoto}
        aircraftPhotoLoading={aircraftPhotoLoading}
        aircraftDetails={aircraftDetails}
        aircraftDetailsLoading={aircraftDetailsLoading}
        flightSchedule={flightSchedule}
        flightScheduleLoading={flightScheduleLoading}
        flightTrack={flightTrack}
        flightTrackLoading={flightTrackLoading}
        aircraftTrails={aircraftTrails}
        sectionExpanded={sectionExpanded}
        toggleSection={toggleSection}
        graphHoverData={graphHoverData}
        setGraphHoverData={setGraphHoverData}
        data={data}
        atcData={atcData}
        getAircraftImage={getAircraftImage}
        detectFlightPhase={detectFlightPhase}
        detectCurrentAirspace={detectCurrentAirspace}
        findNearestWaypoints={findNearestWaypoints}
        detectCurrentProcedure={detectCurrentProcedure}
        AIRPORT_DATABASE={AIRPORT_DATABASE}
      />

    </div>
  );
}

export default App;
// Build trigger: 1768659592
