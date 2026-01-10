/**
 * WaypointLayer Component
 * DO-278A 요구사항 추적: SRS-UI-004
 *
 * 웨이포인트 표시 레이어
 */

import React, { useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapContext } from '../../contexts/MapContext';
import type { Waypoint } from '@/types';

const WAYPOINT_SOURCE_ID = 'waypoint-source';
const WAYPOINT_LAYER_ID = 'waypoint-layer';

interface WaypointLayerProps {
  waypoints: Waypoint[];
  showLabels?: boolean;
  minZoom?: number;
  color?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

/**
 * 웨이포인트 레이어 컴포넌트
 */
export function WaypointLayer({
  waypoints,
  showLabels = true,
  minZoom = 8,
  color = '#00BCD4',
  selectedId,
  onSelect,
}: WaypointLayerProps) {
  const { mapRef, isMapLoaded, layerVisibility, selectWaypoint } = useMapContext();

  /**
   * GeoJSON 데이터 생성
   */
  const createGeoJSON = useCallback(
    (waypointList: Waypoint[]): GeoJSON.FeatureCollection => {
      return {
        type: 'FeatureCollection',
        features: waypointList.map((wp) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [wp.lon, wp.lat],
          },
          properties: {
            id: wp.id,
            name: wp.name,
            type: wp.type,
            isSelected: wp.id === selectedId,
          },
        })),
      };
    },
    [selectedId]
  );

  /**
   * 타입별 색상
   */
  const getTypeColor = useCallback((type: string): string => {
    const colors: Record<string, string> = {
      waypoint: '#00BCD4',
      vor: '#9C27B0',
      ndb: '#FF9800',
      fix: '#4CAF50',
      airport: '#F44336',
      ils: '#2196F3',
    };
    return colors[type] || color;
  }, [color]);

  /**
   * 레이어 초기화
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // 소스 추가
    if (!map.getSource(WAYPOINT_SOURCE_ID)) {
      map.addSource(WAYPOINT_SOURCE_ID, {
        type: 'geojson',
        data: createGeoJSON([]),
      });
    }

    // 웨이포인트 레이어
    if (!map.getLayer(WAYPOINT_LAYER_ID)) {
      map.addLayer({
        id: WAYPOINT_LAYER_ID,
        type: 'circle',
        source: WAYPOINT_SOURCE_ID,
        minzoom: minZoom,
        paint: {
          'circle-radius': [
            'case',
            ['get', 'isSelected'],
            8,
            5,
          ],
          'circle-color': [
            'match',
            ['get', 'type'],
            'vor',
            '#9C27B0',
            'ndb',
            '#FF9800',
            'fix',
            '#4CAF50',
            'airport',
            '#F44336',
            'ils',
            '#2196F3',
            color,
          ],
          'circle-stroke-width': [
            'case',
            ['get', 'isSelected'],
            2,
            1,
          ],
          'circle-stroke-color': '#FFFFFF',
        },
      });
    }

    // 라벨 레이어
    if (showLabels && !map.getLayer(`${WAYPOINT_LAYER_ID}-labels`)) {
      map.addLayer({
        id: `${WAYPOINT_LAYER_ID}-labels`,
        type: 'symbol',
        source: WAYPOINT_SOURCE_ID,
        minzoom: 10,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 10,
          'text-offset': [0, 1.2],
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
        const id = features[0].properties?.id;
        if (id) {
          const newId = id === selectedId ? null : id;
          selectWaypoint(newId);
          onSelect?.(newId);
        }
      }
    };

    map.on('click', WAYPOINT_LAYER_ID, handleClick);

    map.on('mouseenter', WAYPOINT_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', WAYPOINT_LAYER_ID, () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      map.off('click', WAYPOINT_LAYER_ID, handleClick);
    };
  }, [isMapLoaded, showLabels, minZoom, color, selectedId, selectWaypoint, onSelect]);

  /**
   * 데이터 업데이트
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const source = map.getSource(WAYPOINT_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(createGeoJSON(waypoints));
    }
  }, [waypoints, isMapLoaded, createGeoJSON]);

  /**
   * 레이어 가시성 업데이트
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const visibility = layerVisibility.waypoints ? 'visible' : 'none';

    if (map.getLayer(WAYPOINT_LAYER_ID)) {
      map.setLayoutProperty(WAYPOINT_LAYER_ID, 'visibility', visibility);
    }
    if (map.getLayer(`${WAYPOINT_LAYER_ID}-labels`)) {
      map.setLayoutProperty(`${WAYPOINT_LAYER_ID}-labels`, 'visibility', visibility);
    }
  }, [layerVisibility.waypoints, isMapLoaded]);

  return null;
}

export default WaypointLayer;
