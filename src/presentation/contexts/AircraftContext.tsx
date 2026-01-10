/**
 * Aircraft Context
 * DO-278A 요구사항 추적: SRS-CTX-002
 *
 * 항공기 데이터 공유를 위한 React Context
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { AircraftPosition, AircraftTrailPoint, Coordinate } from '@/types';
import { useAircraft } from '../hooks/useAircraft';
import { DEFAULT_MAP_CENTER, AIRCRAFT_UPDATE_INTERVAL, DEFAULT_TRAIL_DURATION } from '@/config/constants';

interface AircraftContextValue {
  aircraft: AircraftPosition[];
  selectedAircraft: AircraftPosition | null;
  trails: Map<string, AircraftTrailPoint[]>;
  isLoading: boolean;
  error: Error | null;
  lastUpdate: Date | null;
  selectAircraft: (hex: string | null) => void;
  refreshAircraft: () => Promise<void>;
  clearTrails: () => void;
  getAircraftByHex: (hex: string) => AircraftPosition | undefined;
  getTrailByHex: (hex: string) => AircraftTrailPoint[] | undefined;
}

const AircraftContext = createContext<AircraftContextValue | null>(null);

interface AircraftProviderProps {
  children: React.ReactNode;
  center?: Coordinate;
  radiusNM?: number;
  updateInterval?: number;
  trailDuration?: number;
  autoUpdate?: boolean;
}

/**
 * Aircraft Context Provider
 */
export function AircraftProvider({
  children,
  center = DEFAULT_MAP_CENTER,
  radiusNM = 100,
  updateInterval = AIRCRAFT_UPDATE_INTERVAL,
  trailDuration = DEFAULT_TRAIL_DURATION,
  autoUpdate = true,
}: AircraftProviderProps) {
  const {
    aircraft,
    selectedAircraft,
    trails,
    isLoading,
    error,
    lastUpdate,
    selectAircraft,
    refreshAircraft,
    clearTrails,
  } = useAircraft({
    center,
    radiusNM,
    updateInterval,
    trailDuration,
    autoUpdate,
  });

  const getAircraftByHex = (hex: string): AircraftPosition | undefined => {
    return aircraft.find((ac) => ac.hex === hex);
  };

  const getTrailByHex = (hex: string): AircraftTrailPoint[] | undefined => {
    return trails.get(hex);
  };

  const value = useMemo<AircraftContextValue>(
    () => ({
      aircraft,
      selectedAircraft,
      trails,
      isLoading,
      error,
      lastUpdate,
      selectAircraft,
      refreshAircraft,
      clearTrails,
      getAircraftByHex,
      getTrailByHex,
    }),
    [aircraft, selectedAircraft, trails, isLoading, error, lastUpdate, selectAircraft, refreshAircraft, clearTrails]
  );

  return (
    <AircraftContext.Provider value={value}>
      {children}
    </AircraftContext.Provider>
  );
}

/**
 * Aircraft Context Hook
 */
export function useAircraftContext(): AircraftContextValue {
  const context = useContext(AircraftContext);
  if (!context) {
    throw new Error('useAircraftContext must be used within an AircraftProvider');
  }
  return context;
}

export default AircraftContext;
