/**
 * Map Context
 * DO-278A 요구사항 추적: SRS-CTX-001
 *
 * 지도 상태 공유를 위한 React Context
 */

import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import type { Coordinate } from '@/types';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  DEFAULT_MAP_PITCH,
  DEFAULT_MAP_BEARING,
  MAP_STYLES,
} from '@/config/constants';

type MapStyle = keyof typeof MAP_STYLES;

interface MapViewState {
  center: Coordinate;
  zoom: number;
  pitch: number;
  bearing: number;
}

interface LayerVisibility {
  aircraft: boolean;
  trails: boolean;
  waypoints: boolean;
  routes: boolean;
  airspaces: boolean;
  procedures: boolean;
  navaids: boolean;
  obstacles: boolean;
  weather: boolean;
  terrain: boolean;
}

interface MapContextValue {
  // Map reference
  mapRef: React.MutableRefObject<mapboxgl.Map | null>;
  isMapLoaded: boolean;
  setMapLoaded: (loaded: boolean) => void;

  // View state
  viewState: MapViewState;
  setViewState: (state: Partial<MapViewState>) => void;

  // Map style
  mapStyle: MapStyle;
  setMapStyle: (style: MapStyle) => void;

  // Layer visibility
  layerVisibility: LayerVisibility;
  toggleLayer: (layer: keyof LayerVisibility) => void;
  setLayerVisibility: (layer: keyof LayerVisibility, visible: boolean) => void;

  // Selection
  selectedAircraftHex: string | null;
  selectAircraft: (hex: string | null) => void;
  selectedWaypointId: string | null;
  selectWaypoint: (id: string | null) => void;
  selectedProcedureId: string | null;
  selectProcedure: (id: string | null) => void;

  // Actions
  flyTo: (center: Coordinate, options?: { zoom?: number; pitch?: number; bearing?: number }) => void;
  resetView: () => void;
}

const defaultLayerVisibility: LayerVisibility = {
  aircraft: true,
  trails: true,
  waypoints: true,
  routes: true,
  airspaces: true,
  procedures: true,
  navaids: true,
  obstacles: false,
  weather: false,
  terrain: true,
};

const MapContext = createContext<MapContextValue | null>(null);

interface MapProviderProps {
  children: React.ReactNode;
  initialCenter?: Coordinate;
  initialZoom?: number;
  initialStyle?: MapStyle;
}

/**
 * Map Context Provider
 */
export function MapProvider({
  children,
  initialCenter = DEFAULT_MAP_CENTER,
  initialZoom = DEFAULT_MAP_ZOOM,
  initialStyle = 'dark',
}: MapProviderProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [isMapLoaded, setMapLoaded] = useState(false);

  const [viewState, setViewStateInternal] = useState<MapViewState>({
    center: initialCenter,
    zoom: initialZoom,
    pitch: DEFAULT_MAP_PITCH,
    bearing: DEFAULT_MAP_BEARING,
  });

  const [mapStyle, setMapStyleState] = useState<MapStyle>(initialStyle);
  const [layerVisibility, setLayerVisibilityState] = useState<LayerVisibility>(defaultLayerVisibility);

  const [selectedAircraftHex, setSelectedAircraftHex] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [selectedProcedureId, setSelectedProcedureId] = useState<string | null>(null);

  const setViewState = useCallback((state: Partial<MapViewState>) => {
    setViewStateInternal((prev) => ({ ...prev, ...state }));
  }, []);

  const setMapStyle = useCallback((style: MapStyle) => {
    if (mapRef.current) {
      const styleSpec = MAP_STYLES[style];
      mapRef.current.setStyle(
        typeof styleSpec === 'string' ? styleSpec : (styleSpec as mapboxgl.Style)
      );
    }
    setMapStyleState(style);
  }, []);

  const toggleLayer = useCallback((layer: keyof LayerVisibility) => {
    setLayerVisibilityState((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  }, []);

  const setLayerVisibility = useCallback((layer: keyof LayerVisibility, visible: boolean) => {
    setLayerVisibilityState((prev) => ({
      ...prev,
      [layer]: visible,
    }));
  }, []);

  const selectAircraft = useCallback((hex: string | null) => {
    setSelectedAircraftHex(hex);
  }, []);

  const selectWaypoint = useCallback((id: string | null) => {
    setSelectedWaypointId(id);
  }, []);

  const selectProcedure = useCallback((id: string | null) => {
    setSelectedProcedureId(id);
  }, []);

  const flyTo = useCallback(
    (center: Coordinate, options?: { zoom?: number; pitch?: number; bearing?: number }) => {
      if (!mapRef.current) return;

      mapRef.current.flyTo({
        center: [center.lon, center.lat],
        zoom: options?.zoom ?? viewState.zoom,
        pitch: options?.pitch ?? viewState.pitch,
        bearing: options?.bearing ?? viewState.bearing,
        duration: 1500,
      });
    },
    [viewState]
  );

  const resetView = useCallback(() => {
    if (!mapRef.current) return;

    mapRef.current.flyTo({
      center: [initialCenter.lon, initialCenter.lat],
      zoom: initialZoom,
      pitch: DEFAULT_MAP_PITCH,
      bearing: DEFAULT_MAP_BEARING,
      duration: 1500,
    });
  }, [initialCenter, initialZoom]);

  const value = useMemo<MapContextValue>(
    () => ({
      mapRef,
      isMapLoaded,
      setMapLoaded,
      viewState,
      setViewState,
      mapStyle,
      setMapStyle,
      layerVisibility,
      toggleLayer,
      setLayerVisibility,
      selectedAircraftHex,
      selectAircraft,
      selectedWaypointId,
      selectWaypoint,
      selectedProcedureId,
      selectProcedure,
      flyTo,
      resetView,
    }),
    [
      isMapLoaded,
      viewState,
      setViewState,
      mapStyle,
      setMapStyle,
      layerVisibility,
      toggleLayer,
      setLayerVisibility,
      selectedAircraftHex,
      selectAircraft,
      selectedWaypointId,
      selectWaypoint,
      selectedProcedureId,
      selectProcedure,
      flyTo,
      resetView,
    ]
  );

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

/**
 * Map Context Hook
 */
export function useMapContext(): MapContextValue {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapContext must be used within a MapProvider');
  }
  return context;
}

export default MapContext;
