/**
 * WeatherPanel Component
 * DO-278A 요구사항 추적: SRS-UI-011
 *
 * 기상 정보 표시 패널
 */

import React from 'react';
import type { MetarData, TafData } from '@/types';
import { FLIGHT_CATEGORY_COLORS } from '@/config/constants';

interface WeatherPanelProps {
  metar: MetarData | null;
  taf?: TafData | null;
  weatherRisk?: {
    level: 'low' | 'moderate' | 'high' | 'severe';
    factors: string[];
  } | null;
  onRefresh?: () => void;
  className?: string;
}

/**
 * 기상 정보 패널 컴포넌트
 */
export function WeatherPanel({
  metar,
  taf,
  weatherRisk,
  onRefresh,
  className = '',
}: WeatherPanelProps) {
  if (!metar) {
    return (
      <div
        className={`weather-panel ${className}`}
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          borderRadius: '8px',
          padding: '16px',
          color: '#fff',
        }}
      >
        <p style={{ margin: 0, color: '#888' }}>No weather data available</p>
      </div>
    );
  }

  const categoryColor =
    FLIGHT_CATEGORY_COLORS[metar.flightCategory] || '#9E9E9E';

  const riskColors: Record<string, string> = {
    low: '#4CAF50',
    moderate: '#FF9800',
    high: '#F44336',
    severe: '#9C27B0',
  };

  return (
    <div
      className={`weather-panel ${className}`}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: '8px',
        padding: '16px',
        color: '#fff',
        minWidth: '280px',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>{metar.icao}</h3>
          <span
            style={{
              backgroundColor: categoryColor,
              color: '#000',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {metar.flightCategory}
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            Refresh
          </button>
        )}
      </div>

      {/* 위험도 표시 */}
      {weatherRisk && (
        <div
          style={{
            backgroundColor: riskColors[weatherRisk.level] + '33',
            border: `1px solid ${riskColors[weatherRisk.level]}`,
            borderRadius: '4px',
            padding: '8px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
            }}
          >
            <span
              style={{
                backgroundColor: riskColors[weatherRisk.level],
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                textTransform: 'uppercase',
              }}
            >
              {weatherRisk.level} Risk
            </span>
          </div>
          {weatherRisk.factors.length > 0 && (
            <ul
              style={{
                margin: 0,
                paddingLeft: '16px',
                fontSize: '11px',
                color: '#ddd',
              }}
            >
              {weatherRisk.factors.map((factor, i) => (
                <li key={i}>{factor}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 주요 데이터 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <WeatherValue
          label="Wind"
          value={`${metar.windDirection}°/${metar.windSpeed}kt${metar.windGust ? `G${metar.windGust}` : ''}`}
        />
        <WeatherValue
          label="Visibility"
          value={`${metar.visibility >= 10 ? '>10' : metar.visibility} km`}
        />
        <WeatherValue
          label="Ceiling"
          value={metar.ceiling ? `${metar.ceiling} ft` : 'CLR'}
        />
        <WeatherValue
          label="Temperature"
          value={metar.temp !== undefined ? `${metar.temp}°C` : 'N/A'}
        />
        <WeatherValue
          label="Dewpoint"
          value={metar.dewpoint !== undefined ? `${metar.dewpoint}°C` : 'N/A'}
        />
        <WeatherValue label="QNH" value={`${metar.altimeter} hPa`} />
      </div>

      {/* RVR 정보 */}
      {(metar.leftRvr || metar.rightRvr) && (
        <div
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: '4px',
            padding: '8px',
            marginBottom: '12px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
            RVR
          </span>
          <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
            {metar.leftRvr && <span>L: {metar.leftRvr}m</span>}
            {metar.rightRvr && <span>R: {metar.rightRvr}m</span>}
          </div>
        </div>
      )}

      {/* Raw METAR */}
      <div
        style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: '4px',
          padding: '8px',
          marginBottom: taf ? '12px' : 0,
        }}
      >
        <span style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
          Raw METAR
        </span>
        <code style={{ fontSize: '11px', wordBreak: 'break-all', lineHeight: 1.4 }}>
          {metar.rawOb}
        </code>
      </div>

      {/* TAF */}
      {taf && taf.rawTaf && (
        <div
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: '4px',
            padding: '8px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
            TAF
          </span>
          <code style={{ fontSize: '11px', wordBreak: 'break-all', lineHeight: 1.4 }}>
            {taf.rawTaf}
          </code>
        </div>
      )}

      {/* 업데이트 시간 */}
      <div
        style={{
          marginTop: '12px',
          fontSize: '10px',
          color: '#666',
          textAlign: 'right',
        }}
      >
        Updated: {metar.obsTime?.toLocaleTimeString() || 'N/A'}
        {metar.source && ` (${metar.source})`}
      </div>
    </div>
  );
}

/**
 * 기상 값 컴포넌트
 */
function WeatherValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: '10px', color: '#888', display: 'block' }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default WeatherPanel;
