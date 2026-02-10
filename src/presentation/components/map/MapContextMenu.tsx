/**
 * MapContextMenu Component
 * DO-278A 요구사항 추적: SRS-UI-003
 *
 * Navigraph 스타일의 지도 Context Menu
 */

import { useEffect, useRef } from 'react';
import type { Airspace, Coordinate } from '@/types';
import { findContainingAirspaces } from '@/domain/entities/Airspace';

interface MapContextMenuProps {
  position: { x: number; y: number };
  coordinate: Coordinate;
  airspaces: Airspace[];
  onClose: () => void;
}

/**
 * 위경도를 항공 형식으로 변환
 * 예: N3724.5E12656.8
 */
function formatAviationCoordinate(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';

  const absLat = Math.abs(lat);
  const absLon = Math.abs(lon);

  const latDeg = Math.floor(absLat);
  const latMin = ((absLat - latDeg) * 60).toFixed(1);

  const lonDeg = Math.floor(absLon);
  const lonMin = ((absLon - lonDeg) * 60).toFixed(1);

  return `${latDir}${String(latDeg).padStart(2, '0')}${latMin.padStart(4, '0')}${lonDir}${String(lonDeg).padStart(3, '0')}${lonMin.padStart(4, '0')}`;
}

/**
 * 좌표를 도분초(DMS) 형식으로 변환
 */
function formatDMS(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';

  const absLat = Math.abs(lat);
  const absLon = Math.abs(lon);

  const latDeg = Math.floor(absLat);
  const latMin = Math.floor((absLat - latDeg) * 60);
  const latSec = (((absLat - latDeg) * 60 - latMin) * 60).toFixed(1);

  const lonDeg = Math.floor(absLon);
  const lonMin = Math.floor((absLon - lonDeg) * 60);
  const lonSec = (((absLon - lonDeg) * 60 - lonMin) * 60).toFixed(1);

  return `${latDeg}°${latMin}'${latSec}"${latDir}, ${lonDeg}°${lonMin}'${lonSec}"${lonDir}`;
}

/**
 * 지도 Context Menu 컴포넌트
 */
export function MapContextMenu({
  position,
  coordinate,
  airspaces,
  onClose,
}: MapContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 클릭 외부 감지하여 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // ESC 키로 메뉴 닫기
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // 해당 위치의 공역 찾기
  const containingAirspaces = findContainingAirspaces(coordinate, airspaces);

  // 좌표 복사 핸들러
  const handleCopyCoordinates = async () => {
    const coordText = `${coordinate.lat.toFixed(6)}, ${coordinate.lon.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(coordText);
      onClose();
    } catch (err) {
      console.error('Failed to copy coordinates:', err);
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = coordText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      onClose();
    }
  };

  const aviationFormat = formatAviationCoordinate(coordinate.lat, coordinate.lon);
  const dmsFormat = formatDMS(coordinate.lat, coordinate.lon);

  return (
    <div
      ref={menuRef}
      className="map-context-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {/* Position Info */}
      <div className="map-context-menu-section">
        <div className="map-context-menu-label">Position</div>
        <div className="map-context-menu-value">
          {coordinate.lat.toFixed(6)}, {coordinate.lon.toFixed(6)}
        </div>
        <div className="map-context-menu-value-secondary">
          {dmsFormat}
        </div>
      </div>

      {/* Aviation Format */}
      <div className="map-context-menu-section">
        <div className="map-context-menu-label">Aviation Format</div>
        <div className="map-context-menu-value map-context-menu-aviation">
          {aviationFormat}
        </div>
      </div>

      {/* Airspaces */}
      <div className="map-context-menu-section">
        <div className="map-context-menu-label">Airspaces</div>
        {containingAirspaces.length > 0 ? (
          <div className="map-context-menu-airspaces">
            {containingAirspaces.map((airspace, idx) => (
              <div key={idx} className="map-context-menu-airspace-item">
                <span className="map-context-menu-airspace-type">{airspace.type}</span>
                <span className="map-context-menu-airspace-name">{airspace.name}</span>
                <span className="map-context-menu-airspace-altitude">
                  {airspace.floorFt ? `${Math.round(airspace.floorFt)}ft` : 'SFC'} - {' '}
                  {airspace.ceilingFt ? `${Math.round(airspace.ceilingFt)}ft` : 'UNL'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="map-context-menu-value-secondary">No airspaces at this location</div>
        )}
      </div>

      {/* Divider */}
      <div className="map-context-menu-divider" />

      {/* Actions */}
      <button
        className="map-context-menu-button"
        onClick={handleCopyCoordinates}
        title="Copy coordinates to clipboard"
      >
        Copy Coordinates
      </button>
    </div>
  );
}

export default MapContextMenu;
