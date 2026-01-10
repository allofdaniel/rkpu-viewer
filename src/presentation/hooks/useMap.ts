/**
 * useMap Hook
 * DO-278A 요구사항 추적: SRS-HOOK-004
 *
 * Mapbox GL 지도 관리를 위한 React Hook
 */

import { useState, useCallback, useRef, useEffect } from 'react';
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

interface UseMapOptions {
  initialCenter?: Coordinate;
  initialZoom?: number;
  initialPitch?: number;
  initialBearing?: number;
  initialStyle?: MapStyle;
}

interface UseMapReturn {
  mapRef: React.MutableRefObject<mapboxgl.Map | null>;
  viewState: MapViewState;
  mapStyle: MapStyle;
  isMapLoaded: boolean;
  setCenter: (center: Coordinate, animate?: boolean) => void;
  setZoom: (zoom: number, animate?: boolean) => void;
  setPitch: (pitch: number, animate?: boolean) => void;
  setBearing: (bearing: number, animate?: boolean) => void;
  setMapStyle: (style: MapStyle) => void;
  flyTo: (options: {
    center?: Coordinate;
    zoom?: number;
    pitch?: number;
    bearing?: number;
    duration?: number;
  }) => void;
  fitBounds: (
    bounds: { ne: Coordinate; sw: Coordinate },
    options?: { padding?: number; duration?: number }
  ) => void;
  getMapBounds: () => { ne: Coordinate; sw: Coordinate } | null;
  onMapLoad: (map: mapboxgl.Map) => void;
}

/**
 * 지도 관리 Hook
 */
export function useMap(options: UseMapOptions = {}): UseMapReturn {
  const {
    initialCenter = DEFAULT_MAP_CENTER,
    initialZoom = DEFAULT_MAP_ZOOM,
    initialPitch = DEFAULT_MAP_PITCH,
    initialBearing = DEFAULT_MAP_BEARING,
    initialStyle = 'dark',
  } = options;

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [viewState, setViewState] = useState<MapViewState>({
    center: initialCenter,
    zoom: initialZoom,
    pitch: initialPitch,
    bearing: initialBearing,
  });
  const [mapStyle, setMapStyleState] = useState<MapStyle>(initialStyle);

  /**
   * 지도 로드 완료 콜백
   */
  const onMapLoad = useCallback((map: mapboxgl.Map) => {
    mapRef.current = map;
    setIsMapLoaded(true);

    // 뷰 상태 동기화
    map.on('moveend', () => {
      const center = map.getCenter();
      setViewState((prev) => ({
        ...prev,
        center: { lat: center.lat, lon: center.lng },
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      }));
    });
  }, []);

  /**
   * 중심점 설정
   */
  const setCenter = useCallback(
    (center: Coordinate, animate = true) => {
      if (!mapRef.current) return;

      if (animate) {
        mapRef.current.easeTo({
          center: [center.lon, center.lat],
          duration: 500,
        });
      } else {
        mapRef.current.setCenter([center.lon, center.lat]);
      }

      setViewState((prev) => ({ ...prev, center }));
    },
    []
  );

  /**
   * 줌 레벨 설정
   */
  const setZoom = useCallback((zoom: number, animate = true) => {
    if (!mapRef.current) return;

    if (animate) {
      mapRef.current.easeTo({ zoom, duration: 500 });
    } else {
      mapRef.current.setZoom(zoom);
    }

    setViewState((prev) => ({ ...prev, zoom }));
  }, []);

  /**
   * 피치 설정
   */
  const setPitch = useCallback((pitch: number, animate = true) => {
    if (!mapRef.current) return;

    if (animate) {
      mapRef.current.easeTo({ pitch, duration: 500 });
    } else {
      mapRef.current.setPitch(pitch);
    }

    setViewState((prev) => ({ ...prev, pitch }));
  }, []);

  /**
   * 베어링 설정
   */
  const setBearing = useCallback((bearing: number, animate = true) => {
    if (!mapRef.current) return;

    if (animate) {
      mapRef.current.easeTo({ bearing, duration: 500 });
    } else {
      mapRef.current.setBearing(bearing);
    }

    setViewState((prev) => ({ ...prev, bearing }));
  }, []);

  /**
   * 지도 스타일 설정
   */
  const setMapStyle = useCallback((style: MapStyle) => {
    if (!mapRef.current) return;

    const styleSpec = MAP_STYLES[style];
    mapRef.current.setStyle(
      typeof styleSpec === 'string' ? styleSpec : (styleSpec as mapboxgl.Style)
    );
    setMapStyleState(style);
  }, []);

  /**
   * flyTo 애니메이션
   */
  const flyTo = useCallback(
    (options: {
      center?: Coordinate;
      zoom?: number;
      pitch?: number;
      bearing?: number;
      duration?: number;
    }) => {
      if (!mapRef.current) return;

      mapRef.current.flyTo({
        center: options.center
          ? [options.center.lon, options.center.lat]
          : undefined,
        zoom: options.zoom,
        pitch: options.pitch,
        bearing: options.bearing,
        duration: options.duration ?? 1500,
      });
    },
    []
  );

  /**
   * 영역에 맞게 지도 조정
   */
  const fitBounds = useCallback(
    (
      bounds: { ne: Coordinate; sw: Coordinate },
      options?: { padding?: number; duration?: number }
    ) => {
      if (!mapRef.current) return;

      mapRef.current.fitBounds(
        [
          [bounds.sw.lon, bounds.sw.lat],
          [bounds.ne.lon, bounds.ne.lat],
        ],
        {
          padding: options?.padding ?? 50,
          duration: options?.duration ?? 1000,
        }
      );
    },
    []
  );

  /**
   * 현재 지도 영역 조회
   */
  const getMapBounds = useCallback((): {
    ne: Coordinate;
    sw: Coordinate;
  } | null => {
    if (!mapRef.current) return null;

    const bounds = mapRef.current.getBounds();
    return {
      ne: { lat: bounds.getNorthEast().lat, lon: bounds.getNorthEast().lng },
      sw: { lat: bounds.getSouthWest().lat, lon: bounds.getSouthWest().lng },
    };
  }, []);

  return {
    mapRef,
    viewState,
    mapStyle,
    isMapLoaded,
    setCenter,
    setZoom,
    setPitch,
    setBearing,
    setMapStyle,
    flyTo,
    fitBounds,
    getMapBounds,
    onMapLoad,
  };
}

export default useMap;
