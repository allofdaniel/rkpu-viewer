/**
 * AircraftListPanel Component
 * DO-278A 요구사항 추적: SRS-UI-013
 *
 * 항공기 목록 패널
 */

import React, { useState, useMemo } from 'react';
import type { AircraftPosition } from '@/types';
import { FLIGHT_PHASE_COLORS } from '@/config/constants';

type SortField = 'flight' | 'altitude' | 'speed' | 'distance';
type SortDirection = 'asc' | 'desc';

interface AircraftListPanelProps {
  aircraft: AircraftPosition[];
  selectedHex?: string | null;
  onSelect?: (hex: string) => void;
  className?: string;
}

/**
 * 항공기 목록 패널 컴포넌트
 */
export function AircraftListPanel({
  aircraft,
  selectedHex,
  onSelect,
  className = '',
}: AircraftListPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('distance');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  /**
   * 필터링 및 정렬된 항공기 목록
   */
  const filteredAircraft = useMemo(() => {
    let result = [...aircraft];

    // 검색 필터
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (ac) =>
          ac.flight?.toLowerCase().includes(term) ||
          ac.hex.toLowerCase().includes(term) ||
          ac.registration?.toLowerCase().includes(term) ||
          ac.aircraft_type?.toLowerCase().includes(term)
      );
    }

    // 정렬
    result.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'flight':
          aVal = a.flight || a.hex;
          bVal = b.flight || b.hex;
          break;
        case 'altitude':
          aVal = a.altitude_baro ?? -1;
          bVal = b.altitude_baro ?? -1;
          break;
        case 'speed':
          aVal = a.ground_speed ?? -1;
          bVal = b.ground_speed ?? -1;
          break;
        case 'distance':
          aVal = a.distance ?? Infinity;
          bVal = b.distance ?? Infinity;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return result;
  }, [aircraft, searchTerm, sortField, sortDirection]);

  /**
   * 정렬 토글
   */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  /**
   * 정렬 아이콘
   */
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>;
  };

  return (
    <div
      className={`aircraft-list-panel ${className}`}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: '8px',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '400px',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '14px' }}>
            Aircraft ({filteredAircraft.length})
          </h3>
        </div>
        <input
          type="text"
          placeholder="Search callsign, registration..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            padding: '6px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* 테이블 헤더 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 70px 60px 50px',
          padding: '8px 16px',
          fontSize: '10px',
          color: '#888',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer',
        }}
      >
        <span onClick={() => handleSort('flight')}>
          CALLSIGN
          <SortIcon field="flight" />
        </span>
        <span onClick={() => handleSort('altitude')}>
          ALT
          <SortIcon field="altitude" />
        </span>
        <span onClick={() => handleSort('speed')}>
          SPD
          <SortIcon field="speed" />
        </span>
        <span onClick={() => handleSort('distance')}>
          DIST
          <SortIcon field="distance" />
        </span>
      </div>

      {/* 목록 */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
        }}
      >
        {filteredAircraft.length === 0 ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: '#666',
              fontSize: '12px',
            }}
          >
            No aircraft found
          </div>
        ) : (
          filteredAircraft.map((ac) => (
            <AircraftRow
              key={ac.hex}
              aircraft={ac}
              isSelected={ac.hex === selectedHex}
              onClick={() => onSelect?.(ac.hex)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * 항공기 행 컴포넌트
 */
function AircraftRow({
  aircraft,
  isSelected,
  onClick,
}: {
  aircraft: AircraftPosition;
  isSelected: boolean;
  onClick: () => void;
}) {
  const phaseColor = aircraft.flightPhase
    ? FLIGHT_PHASE_COLORS[aircraft.flightPhase] || '#9E9E9E'
    : '#9E9E9E';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 70px 60px 50px',
        padding: '8px 16px',
        fontSize: '12px',
        cursor: 'pointer',
        backgroundColor: isSelected ? 'rgba(33, 150, 243, 0.2)' : 'transparent',
        borderLeft: `3px solid ${isSelected ? '#2196F3' : 'transparent'}`,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: phaseColor,
            flexShrink: 0,
          }}
        />
        {aircraft.flight || aircraft.hex}
      </span>
      <span style={{ color: aircraft.altitude_baro === 0 ? '#888' : '#fff' }}>
        {aircraft.altitude_baro === 0
          ? 'GND'
          : aircraft.altitude_baro
            ? `${Math.round(aircraft.altitude_baro / 100)}FL`
            : '-'}
      </span>
      <span>
        {aircraft.ground_speed ? `${Math.round(aircraft.ground_speed)}` : '-'}
      </span>
      <span style={{ color: '#888' }}>
        {aircraft.distance ? `${Math.round(aircraft.distance)}` : '-'}
      </span>
    </div>
  );
}

export default AircraftListPanel;
