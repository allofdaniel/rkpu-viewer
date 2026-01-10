/**
 * AircraftLayer Component
 * DO-278A 요구사항 추적: SRS-UI-002
 *
 * 지도 위 항공기 표시 레이어
 */

import React, { useEffect, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapContext } from '../../contexts/MapContext';
import { useAircraftContext } from '../../contexts/AircraftContext';
import type { AircraftPosition } from '@/types';
import { AIRCRAFT_CATEGORY_COLORS, FLIGHT_PHASE_COLORS } from '@/config/constants';

const AIRCRAFT_SOURCE_ID = 'aircraft-source';
const AIRCRAFT_LAYER_ID = 'aircraft-layer';
const AIRCRAFT_SELECTED_LAYER_ID = 'aircraft-selected-layer';

interface AircraftLayerProps {
  colorBy?: 'category' | 'flightPhase' | 'altitude';
  showLabels?: boolean;
  minZoom?: number;
}

/**
 * 항공기 레이어 컴포넌트
 */
export function AircraftLayer({
  colorBy = 'category',
  showLabels = true,
  minZoom = 6,
}: AircraftLayerProps) {
  const { mapRef, isMapLoaded, selectedAircraftHex, selectAircraft, layerVisibility } =
    useMapContext();
  const { aircraft } = useAircraftContext();
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  /**
   * GeoJSON 데이터 생성
   */
  const createGeoJSON = useCallback(
    (aircraftList: AircraftPosition[]): GeoJSON.FeatureCollection => {
      return {
        type: 'FeatureCollection',
        features: aircraftList
          .filter((ac) => ac.lat !== undefined && ac.lon !== undefined)
          .map((ac) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [ac.lon, ac.lat],
            },
            properties: {
              hex: ac.hex,
              flight: ac.flight || ac.hex,
              altitude: ac.altitude_baro || 0,
              speed: ac.ground_speed || 0,
              track: ac.track || 0,
              category: ac.category || 'A0',
              flightPhase: ac.flightPhase || 'unknown',
              isSelected: ac.hex === selectedAircraftHex,
            },
          })),
      };
    },
    [selectedAircraftHex]
  );

  /**
   * 색상 표현식 생성
   */
  const getColorExpression = useCallback(() => {
    if (colorBy === 'altitude') {
      return [
        'interpolate',
        ['linear'],
        ['get', 'altitude'],
        0,
        '#9E9E9E', // ground
        5000,
        '#4CAF50', // low
        15000,
        '#2196F3', // medium
        30000,
        '#9C27B0', // high
        45000,
        '#F44336', // very high
      ];
    }

    if (colorBy === 'flightPhase') {
      return [
        'match',
        ['get', 'flightPhase'],
        'ground',
        FLIGHT_PHASE_COLORS.ground,
        'takeoff',
        FLIGHT_PHASE_COLORS.takeoff,
        'climb',
        FLIGHT_PHASE_COLORS.climb,
        'cruise',
        FLIGHT_PHASE_COLORS.cruise,
        'descent',
        FLIGHT_PHASE_COLORS.descent,
        'approach',
        FLIGHT_PHASE_COLORS.approach,
        'landing',
        FLIGHT_PHASE_COLORS.landing,
        FLIGHT_PHASE_COLORS.unknown,
      ];
    }

    // Default: category
    return [
      'match',
      ['get', 'category'],
      'A0',
      AIRCRAFT_CATEGORY_COLORS.A0,
      'A1',
      AIRCRAFT_CATEGORY_COLORS.A1,
      'A2',
      AIRCRAFT_CATEGORY_COLORS.A2,
      'A3',
      AIRCRAFT_CATEGORY_COLORS.A3,
      'A4',
      AIRCRAFT_CATEGORY_COLORS.A4,
      'A5',
      AIRCRAFT_CATEGORY_COLORS.A5,
      'A6',
      AIRCRAFT_CATEGORY_COLORS.A6,
      'A7',
      AIRCRAFT_CATEGORY_COLORS.A7,
      '#FFFFFF',
    ];
  }, [colorBy]);

  /**
   * 레이어 초기화
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // 소스 추가
    if (!map.getSource(AIRCRAFT_SOURCE_ID)) {
      map.addSource(AIRCRAFT_SOURCE_ID, {
        type: 'geojson',
        data: createGeoJSON([]),
      });
    }

    // 항공기 아이콘 레이어
    if (!map.getLayer(AIRCRAFT_LAYER_ID)) {
      map.addLayer({
        id: AIRCRAFT_LAYER_ID,
        type: 'circle',
        source: AIRCRAFT_SOURCE_ID,
        minzoom: minZoom,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            6,
            4,
            12,
            8,
            16,
            12,
          ],
          'circle-color': getColorExpression() as any,
          'circle-stroke-width': [
            'case',
            ['get', 'isSelected'],
            3,
            1,
          ],
          'circle-stroke-color': [
            'case',
            ['get', 'isSelected'],
            '#FFFF00',
            '#FFFFFF',
          ],
        },
      });
    }

    // 라벨 레이어
    if (showLabels && !map.getLayer(`${AIRCRAFT_LAYER_ID}-labels`)) {
      map.addLayer({
        id: `${AIRCRAFT_LAYER_ID}-labels`,
        type: 'symbol',
        source: AIRCRAFT_SOURCE_ID,
        minzoom: 9,
        layout: {
          'text-field': ['get', 'flight'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#000000',
          'text-halo-width': 1,
        },
      });
    }

    // 클릭 이벤트
    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const features = e.features;
      if (features && features.length > 0) {
        const hex = features[0].properties?.hex;
        if (hex) {
          selectAircraft(hex === selectedAircraftHex ? null : hex);
        }
      }
    };

    map.on('click', AIRCRAFT_LAYER_ID, handleClick);

    // 커서 변경
    map.on('mouseenter', AIRCRAFT_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', AIRCRAFT_LAYER_ID, () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      map.off('click', AIRCRAFT_LAYER_ID, handleClick);
    };
  }, [isMapLoaded, showLabels, minZoom, getColorExpression, selectAircraft, selectedAircraftHex]);

  /**
   * 데이터 업데이트
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const source = map.getSource(AIRCRAFT_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(createGeoJSON(aircraft));
    }
  }, [aircraft, isMapLoaded, createGeoJSON]);

  /**
   * 레이어 가시성 업데이트
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const visibility = layerVisibility.aircraft ? 'visible' : 'none';

    if (map.getLayer(AIRCRAFT_LAYER_ID)) {
      map.setLayoutProperty(AIRCRAFT_LAYER_ID, 'visibility', visibility);
    }
    if (map.getLayer(`${AIRCRAFT_LAYER_ID}-labels`)) {
      map.setLayoutProperty(`${AIRCRAFT_LAYER_ID}-labels`, 'visibility', visibility);
    }
  }, [layerVisibility.aircraft, isMapLoaded]);

  return null; // 렌더링 없음 - 지도 레이어로만 동작
}

export default AircraftLayer;
