/**
 * TrailLayer Component
 * DO-278A 요구사항 추적: SRS-UI-003
 *
 * 항공기 항적 표시 레이어
 */

import React, { useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapContext } from '../../contexts/MapContext';
import { useAircraftContext } from '../../contexts/AircraftContext';
import type { AircraftTrailPoint } from '@/types';
import { TRAIL_COLOR } from '@/config/constants';

const TRAIL_SOURCE_ID = 'trail-source';
const TRAIL_LAYER_ID = 'trail-layer';

interface TrailLayerProps {
  color?: string;
  width?: number;
  opacity?: number;
  minZoom?: number;
}

/**
 * 항적 레이어 컴포넌트
 */
export function TrailLayer({
  color = TRAIL_COLOR,
  width = 2,
  opacity = 0.8,
  minZoom = 6,
}: TrailLayerProps) {
  const { mapRef, isMapLoaded, layerVisibility } = useMapContext();
  const { trails } = useAircraftContext();

  /**
   * GeoJSON 라인 데이터 생성
   */
  const createTrailGeoJSON = useCallback(
    (trailsMap: Map<string, AircraftTrailPoint[]>): GeoJSON.FeatureCollection => {
      const features: GeoJSON.Feature[] = [];

      trailsMap.forEach((trail, hex) => {
        if (trail.length < 2) return;

        const coordinates = trail.map((point) => [point.lon, point.lat]);

        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates,
          },
          properties: {
            hex,
            pointCount: trail.length,
          },
        });
      });

      return {
        type: 'FeatureCollection',
        features,
      };
    },
    []
  );

  /**
   * 레이어 초기화
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // 소스 추가
    if (!map.getSource(TRAIL_SOURCE_ID)) {
      map.addSource(TRAIL_SOURCE_ID, {
        type: 'geojson',
        data: createTrailGeoJSON(new Map()),
      });
    }

    // 항적 라인 레이어
    if (!map.getLayer(TRAIL_LAYER_ID)) {
      map.addLayer(
        {
          id: TRAIL_LAYER_ID,
          type: 'line',
          source: TRAIL_SOURCE_ID,
          minzoom: minZoom,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': color,
            'line-width': width,
            'line-opacity': opacity,
          },
        },
        // 항공기 레이어 아래에 배치
        'aircraft-layer'
      );
    }

    return () => {
      // 정리 시 레이어 제거하지 않음 (다른 컴포넌트에서 재사용)
    };
  }, [isMapLoaded, color, width, opacity, minZoom]);

  /**
   * 데이터 업데이트
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const source = map.getSource(TRAIL_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(createTrailGeoJSON(trails));
    }
  }, [trails, isMapLoaded, createTrailGeoJSON]);

  /**
   * 레이어 가시성 업데이트
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const visibility = layerVisibility.trails ? 'visible' : 'none';

    if (map.getLayer(TRAIL_LAYER_ID)) {
      map.setLayoutProperty(TRAIL_LAYER_ID, 'visibility', visibility);
    }
  }, [layerVisibility.trails, isMapLoaded]);

  /**
   * 스타일 업데이트
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !map.getLayer(TRAIL_LAYER_ID)) return;

    map.setPaintProperty(TRAIL_LAYER_ID, 'line-color', color);
    map.setPaintProperty(TRAIL_LAYER_ID, 'line-width', width);
    map.setPaintProperty(TRAIL_LAYER_ID, 'line-opacity', opacity);
  }, [color, width, opacity, isMapLoaded]);

  return null;
}

export default TrailLayer;
