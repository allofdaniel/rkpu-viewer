/**
 * ControlPanel Component
 * DO-278A 요구사항 추적: SRS-UI-012
 *
 * 지도 컨트롤 패널
 */

import React from 'react';
import { useMapContext } from '../../contexts/MapContext';
import { MAP_STYLES, TRAIL_DURATION_OPTIONS } from '@/config/constants';

type MapStyle = keyof typeof MAP_STYLES;

interface ControlPanelProps {
  trailDuration?: number;
  onTrailDurationChange?: (duration: number) => void;
  className?: string;
}

/**
 * 컨트롤 패널 컴포넌트
 */
export function ControlPanel({
  trailDuration,
  onTrailDurationChange,
  className = '',
}: ControlPanelProps) {
  const {
    mapStyle,
    setMapStyle,
    layerVisibility,
    toggleLayer,
    resetView,
  } = useMapContext();

  const mapStyleOptions: { value: MapStyle; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'satellite', label: 'Satellite' },
    { value: 'black', label: 'Radar' },
  ];

  const layerOptions: { key: keyof typeof layerVisibility; label: string }[] = [
    { key: 'aircraft', label: 'Aircraft' },
    { key: 'trails', label: 'Trails' },
    { key: 'waypoints', label: 'Waypoints' },
    { key: 'routes', label: 'Routes' },
    { key: 'airspaces', label: 'Airspaces' },
    { key: 'procedures', label: 'Procedures' },
    { key: 'navaids', label: 'NAVAIDs' },
    { key: 'obstacles', label: 'Obstacles' },
    { key: 'weather', label: 'Weather' },
    { key: 'terrain', label: '3D Terrain' },
  ];

  return (
    <div
      className={`control-panel ${className}`}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: '8px',
        padding: '16px',
        color: '#fff',
        minWidth: '200px',
      }}
    >
      {/* 지도 스타일 */}
      <Section title="Map Style">
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {mapStyleOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setMapStyle(option.value)}
              style={{
                backgroundColor:
                  mapStyle === option.value
                    ? 'rgba(33, 150, 243, 0.8)'
                    : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      {/* 항적 시간 */}
      {onTrailDurationChange && (
        <Section title="Trail Duration">
          <select
            value={trailDuration}
            onChange={(e) => onTrailDurationChange(Number(e.target.value))}
            style={{
              width: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              padding: '6px 8px',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            {TRAIL_DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Section>
      )}

      {/* 레이어 토글 */}
      <Section title="Layers">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {layerOptions.map((option) => (
            <label
              key={option.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              <input
                type="checkbox"
                checked={layerVisibility[option.key]}
                onChange={() => toggleLayer(option.key)}
                style={{ accentColor: '#2196F3' }}
              />
              <span style={{ fontSize: '12px' }}>{option.label}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* 뷰 리셋 */}
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={resetView}
          style={{
            width: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            padding: '8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Reset View
        </button>
      </div>
    </div>
  );
}

/**
 * 섹션 컴포넌트
 */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h4
        style={{
          margin: '0 0 8px 0',
          fontSize: '12px',
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

export default ControlPanel;
