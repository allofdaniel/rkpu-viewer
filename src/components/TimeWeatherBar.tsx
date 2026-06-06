/**
 * TimeWeatherBar Component
 * 시간 및 날씨 표시 바
 * DO-278A 요구사항 추적: SRS-UI-001 (사용자 인터페이스 표시)
 */
import React, { useMemo } from 'react';
import { formatUTC, formatKST } from '../utils/format';
import type { MetarData, ParsedMetar } from '../utils/weather';
import type { DataHealthStatus } from '../hooks/useAircraftData';
import type { WeatherHealthStatus } from '../hooks/useWeatherData';
import type { NotamHealthStatus } from '../hooks/useNotamData';

interface WeatherDataState {
  metar: MetarData | null;
  taf: { rawTAF?: string } | null;
}

interface TimeDisplayProps {
  currentTime: Date;
}

interface WeatherCompactProps {
  weatherData: WeatherDataState | null;
  metarPinned: boolean;
  setMetarPinned: (pinned: boolean) => void;
  setShowMetarPopup: (show: boolean) => void;
  tafPinned: boolean;
  setTafPinned: (pinned: boolean) => void;
  setShowTafPopup: (show: boolean) => void;
  parseMetar: (metar: MetarData | null | undefined) => ParsedMetar | null;
  parseMetarTime: (metar: MetarData | null | undefined) => string;
}

interface MetarPopupProps {
  weatherData: WeatherDataState | null;
  showMetarPopup: boolean;
  metarPinned: boolean;
  parseMetar: (metar: MetarData | null | undefined) => ParsedMetar | null;
}

interface TafPopupProps {
  weatherData: WeatherDataState | null;
  showTafPopup: boolean;
  tafPinned: boolean;
}

interface TimeWeatherBarProps {
  currentTime: Date;
  weatherData: WeatherDataState | null;
  dataHealth?: DataHealthStatus;
  weatherHealth?: WeatherHealthStatus;
  notamHealth?: NotamHealthStatus;
  showMetarPopup: boolean;
  setShowMetarPopup: (show: boolean) => void;
  metarPinned: boolean;
  setMetarPinned: (pinned: boolean) => void;
  showTafPopup: boolean;
  setShowTafPopup: (show: boolean) => void;
  tafPinned: boolean;
  setTafPinned: (pinned: boolean) => void;
  parseMetar: (metar: MetarData | null | undefined) => ParsedMetar | null;
  parseMetarTime: (metar: MetarData | null | undefined) => string;
}

/**
 * Health Indicator
 * 데이터 피드 상태 표시 (ADS-B + METAR + NOTAM)
 */
interface HealthIndicatorProps {
  dataHealth?: DataHealthStatus;
  weatherHealth?: WeatherHealthStatus;
  notamHealth?: NotamHealthStatus;
}

const HealthIndicator: React.FC<HealthIndicatorProps> = React.memo(({ dataHealth, weatherHealth, notamHealth }) => {
  // 색상 결정 함수
  const getColor = (connected: boolean, stale: boolean) => {
    if (!connected) return '#ff4444';
    if (stale) return '#ffaa00';
    return '#00ff00';
  };

  // ADS-B 상태 (useMemo로 최적화)
  const adsbStatus = useMemo(() => {
    const connected = dataHealth?.isConnected ?? false;
    const count = dataHealth?.aircraftCount ?? 0;
    const lastUpdate = dataHealth?.lastSuccessTime ?? null;
    const timeSince = lastUpdate ? Math.floor((Date.now() - lastUpdate) / 1000) : null;
    const stale = timeSince !== null && timeSince > 30;
    return { connected, count, lastUpdate, timeSince, stale, color: getColor(connected, stale) };
  }, [dataHealth]);

  // METAR 상태 (useMemo로 최적화)
  const metarStatus = useMemo(() => {
    const connected = weatherHealth?.isConnected ?? false;
    const source = weatherHealth?.source ?? null;
    const lastUpdate = weatherHealth?.lastSuccessTime ?? null;
    const timeSince = lastUpdate ? Math.floor((Date.now() - lastUpdate) / 1000) : null;
    const stale = timeSince !== null && timeSince > 600; // 10분 이상이면 stale
    return { connected, source, lastUpdate, timeSince, stale, color: getColor(connected, stale) };
  }, [weatherHealth]);

  // NOTAM 상태 (useMemo로 최적화)
  const notamStatus = useMemo(() => {
    const connected = notamHealth?.isConnected ?? false;
    const count = notamHealth?.notamCount ?? 0;
    const source = notamHealth?.source ?? null;
    const lastUpdate = notamHealth?.lastSuccessTime ?? null;
    const timeSince = lastUpdate ? Math.floor((Date.now() - lastUpdate) / 1000) : null;
    const stale = timeSince !== null && timeSince > 1800; // 30분 이상이면 stale
    return { connected, count, source, lastUpdate, timeSince, stale, color: getColor(connected, stale) };
  }, [notamHealth]);

  return (
    <div className="health-indicator">
      {/* ADS-B 상태 */}
      <div
        className="health-item"
        title={`ADS-B 피드\n항공기: ${adsbStatus.count}대\n${adsbStatus.lastUpdate ? `업데이트: ${adsbStatus.timeSince}초 전` : '대기 중'}`}
      >
        <span
          className="health-dot"
          style={{ backgroundColor: adsbStatus.color, boxShadow: `0 0 6px ${adsbStatus.color}` }}
        />
        <span className="health-label">ADS-B</span>
        <span className="health-count">{adsbStatus.count}</span>
      </div>

      {/* METAR 상태 */}
      <div
        className="health-item"
        title={`METAR 데이터\n소스: ${metarStatus.source || '없음'}\n${metarStatus.timeSince !== null ? `업데이트: ${Math.floor(metarStatus.timeSince / 60)}분 전` : '대기 중'}`}
      >
        <span
          className="health-dot"
          style={{ backgroundColor: metarStatus.color, boxShadow: `0 0 6px ${metarStatus.color}` }}
        />
        <span className="health-label">WX</span>
      </div>

      {/* NOTAM 상태 */}
      <div
        className="health-item"
        title={`NOTAM 데이터\n${notamStatus.count}건\n소스: ${notamStatus.source || '없음'}\n${notamStatus.timeSince !== null ? `업데이트: ${Math.floor(notamStatus.timeSince / 60)}분 전` : '대기 중'}`}
      >
        <span
          className="health-dot"
          style={{ backgroundColor: notamStatus.color, boxShadow: `0 0 6px ${notamStatus.color}` }}
        />
        <span className="health-label">NOTAM</span>
      </div>
    </div>
  );
});
HealthIndicator.displayName = 'HealthIndicator';

/**
 * Time Display
 * DO-278A 요구사항 추적: SRS-PERF-001
 */
const TimeDisplay: React.FC<TimeDisplayProps> = React.memo(({ currentTime }) => (
  <div className="time-display">
    <span className="time-utc">{formatUTC(currentTime)}</span>
    <span className="time-separator">|</span>
    <span className="time-kst">{formatKST(currentTime)}</span>
  </div>
));
TimeDisplay.displayName = 'TimeDisplay';

/**
 * Weather Compact Display
 * DO-278A 요구사항 추적: SRS-WX-001 (기상정보 표시)
 */
const WeatherCompact: React.FC<WeatherCompactProps> = React.memo(({
  weatherData,
  metarPinned,
  setMetarPinned,
  setShowMetarPopup,
  tafPinned,
  setTafPinned,
  setShowTafPopup,
  parseMetar,
  parseMetarTime
}) => {
  if (!weatherData?.metar) return null;

  const parsedMetar = parseMetar(weatherData.metar);

  // 공항 코드 (RKPU, RKPK 등)
  const airportCode = weatherData.metar.icaoId || 'RKPU';

  return (
    <div className="weather-compact">
      <span className="wx-label">METAR</span>
      <span className="wx-airport" title={`기상 데이터 출처: ${airportCode}`}>{airportCode}</span>
      <span className={`wx-cat ${weatherData.metar.fltCat?.toLowerCase() || 'vfr'}`}>
        {weatherData.metar.fltCat || 'VFR'}
      </span>
      <span className="wx-time" title="관측시간 (KST)">
        {parseMetarTime(weatherData.metar)}
      </span>
      {parsedMetar?.wind && (
        <span className="wx-item" title={parsedMetar.windMs}>
          {parsedMetar.wind}
        </span>
      )}
      {parsedMetar?.visibility && (
        <span className="wx-item">{parsedMetar.visibility}</span>
      )}
      {parsedMetar?.rvr && (
        <span className="wx-item wx-rvr">{parsedMetar.rvr}</span>
      )}
      {parsedMetar?.temp && (
        <span className="wx-item">{parsedMetar.temp}</span>
      )}
      {weatherData.metar.altim && (
        <span className="wx-item">Q{weatherData.metar.altim}</span>
      )}
      <button
        className={`wx-metar-btn ${metarPinned ? 'pinned' : ''}`}
        onMouseEnter={() => !metarPinned && setShowMetarPopup(true)}
        onMouseLeave={() => !metarPinned && setShowMetarPopup(false)}
        onClick={() => { setMetarPinned(!metarPinned); setShowMetarPopup(!metarPinned); }}
        aria-label="METAR 기상 데이터 상세보기"
        aria-pressed={metarPinned}
        aria-expanded={metarPinned}
        tabIndex={0}
        type="button"
      >
        METAR
      </button>
      {weatherData?.taf && (
        <button
          className={`wx-metar-btn ${tafPinned ? 'pinned' : ''}`}
          onMouseEnter={() => !tafPinned && setShowTafPopup(true)}
          onMouseLeave={() => !tafPinned && setShowTafPopup(false)}
          onClick={() => { setTafPinned(!tafPinned); setShowTafPopup(!tafPinned); }}
          aria-label="TAF 예보 데이터 상세보기"
          aria-pressed={tafPinned}
          aria-expanded={tafPinned}
          tabIndex={0}
          type="button"
        >
          TAF
        </button>
      )}
    </div>
  );
});
WeatherCompact.displayName = 'WeatherCompact';

/**
 * METAR Popup
 * DO-278A 요구사항 추적: SRS-WX-002 (METAR 상세 표시)
 */
const MetarPopup: React.FC<MetarPopupProps> = React.memo(({ weatherData, showMetarPopup, metarPinned, parseMetar }) => {
  if (!(showMetarPopup || metarPinned) || !weatherData?.metar) return null;

  const parsedMetar = parseMetar(weatherData.metar);

  return (
    <div className="metar-popup metar-popup-compact">
      <div className="metar-compact-row">
        <span className="mc-item"><b>Wind</b> {parsedMetar?.wind} ({weatherData.metar.wspdMs}m/s)</span>
        <span className="mc-item"><b>Vis</b> {weatherData.metar.visibM}m</span>
        {(weatherData.metar.lRvr || weatherData.metar.rRvr) && (
          <span className="mc-item mc-rvr">
            <b>RVR</b> {weatherData.metar.lRvr || '-'}/{weatherData.metar.rRvr || '-'}m
          </span>
        )}
        <span className="mc-item"><b>Temp</b> {weatherData.metar.temp}/{weatherData.metar.dewp}°C</span>
        <span className="mc-item"><b>QNH</b> {weatherData.metar.altim}</span>
        {weatherData.metar.ceiling && (
          <span className="mc-item"><b>Ceil</b> {weatherData.metar.ceiling}ft</span>
        )}
      </div>
      <div className="metar-raw-line">{weatherData.metar.rawOb}</div>
    </div>
  );
});
MetarPopup.displayName = 'MetarPopup';

/**
 * TAF Popup
 * DO-278A 요구사항 추적: SRS-WX-003 (TAF 상세 표시)
 */
const TafPopup: React.FC<TafPopupProps> = React.memo(({ weatherData, showTafPopup, tafPinned }) => {
  if (!(showTafPopup || tafPinned) || !weatherData?.taf) return null;

  return (
    <div className="metar-popup taf-popup">
      <div className="metar-popup-section">
        <div className="metar-popup-label">TAF</div>
        <div className="metar-popup-text">{weatherData.taf.rawTAF}</div>
      </div>
    </div>
  );
});
TafPopup.displayName = 'TafPopup';

/**
 * Time Weather Bar Component
 * DO-278A 요구사항 추적: SRS-PERF-001
 */
const TimeWeatherBar: React.FC<TimeWeatherBarProps> = React.memo(({
  currentTime,
  weatherData,
  dataHealth,
  weatherHealth,
  notamHealth,
  showMetarPopup,
  setShowMetarPopup,
  metarPinned,
  setMetarPinned,
  showTafPopup,
  setShowTafPopup,
  tafPinned,
  setTafPinned,
  parseMetar,
  parseMetarTime
}) => {
  return (
    <div className="time-weather-display">
      <div className="time-health-row">
        <TimeDisplay currentTime={currentTime} />
        <HealthIndicator dataHealth={dataHealth} weatherHealth={weatherHealth} notamHealth={notamHealth} />
      </div>
      <WeatherCompact
        weatherData={weatherData}
        metarPinned={metarPinned}
        setMetarPinned={setMetarPinned}
        setShowMetarPopup={setShowMetarPopup}
        tafPinned={tafPinned}
        setTafPinned={setTafPinned}
        setShowTafPopup={setShowTafPopup}
        parseMetar={parseMetar}
        parseMetarTime={parseMetarTime}
      />
      <MetarPopup
        weatherData={weatherData}
        showMetarPopup={showMetarPopup}
        metarPinned={metarPinned}
        parseMetar={parseMetar}
      />
      <TafPopup
        weatherData={weatherData}
        showTafPopup={showTafPopup}
        tafPinned={tafPinned}
      />
    </div>
  );
});
TimeWeatherBar.displayName = 'TimeWeatherBar';

export default TimeWeatherBar;
