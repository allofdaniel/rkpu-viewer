/**
 * AirspaceLayer Component
 * DO-278A 요구사항 추적: SRS-UI-005
 *
 * 공역 폴리곤 표시 레이어
 */

import React, { useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapContext } from '../../contexts/MapContext';
import type { Airspace } from '@/types';

const AIRSPACE_SOURCE_ID = 'airspace-source';
const AIRSPACE_FILL_LAYER_ID = 'airspace-fill-layer';
const AIRSPACE_LINE_LAYER_ID = 'airspace-line-layer';

interface AirspaceLayerProps {
  airspaces: Airspace[];
  showLabels?: boolean;
  minZoom?: number;
  fillOpacity?: number;
}

/**
 * 공역 타입별 색상
 */
const AIRSPACE_COLORS: Record<string, { fill: string; line: string }> = {
  CTR: { fill: '#2196F3', line: '#1976D2' },
  TMA: { fill: '#4CAF50', line: '#388E3C' },
  P: { fill: '#F44336', line: '#D32F2F' }, // Prohibited
  R: { fill: '#FF9800', line: '#F57C00' }, // Restricted
  D: { fill: '#9C27B0', line: '#7B1FA2' }, // Danger
  MOA: { fill: '#795548', line: '#5D4037' }, // Military Operations Area
  ADIZ: { fill: '#607D8B', line: '#455A64' },
  FIR: { fill: '#9E9E9E', line: '#757575' },
  default: { fill: '#00BCD4', line: '#0097A7' },
};

/**
 * 공역 레이어 컴포넌트
 */
export function AirspaceLayer({
  airspaces,
  showLabels = true,
  minZoom = 6,
  fillOpacity = 0.2,
}: AirspaceLayerProps) {
  const { mapRef, isMapLoaded, layerVisibility } = useMapContext();

  /**
   * GeoJSON 데이터 생성
   */
  const createGeoJSON = useCallback(
    (airspaceList: Airspace[]): GeoJSON.FeatureCollection => {
      return {
        type: 'FeatureCollection',
        features: airspaceList
          .filter((as) => as.polygon && as.polygon.length >= 3)
          .map((as) => {
            const colors = AIRSPACE_COLORS[as.type] || AIRSPACE_COLORS.default;
            return {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    ...as.polygon.map((p) => [p.lon, p.lat]),
                    [as.polygon[0].lon, as.polygon[0].lat], // Close the polygon
                  ],
                ],
              },
              properties: {
                id: as.id,
                name: as.name,
                type: as.type,
                class: as.class,
                lowerLimit: as.lowerLimit,
                upperLimit: as.upperLimit,
                fillColor: colors.fill,
                lineColor: colors.line,
              },
            };
          }),
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
    if (!map.getSource(AIRSPACE_SOURCE_ID)) {
      map.addSource(AIRSPACE_SOURCE_ID, {
        type: 'geojson',
        data: createGeoJSON([]),
      });
    }

    // 공역 채우기 레이어
    if (!map.getLayer(AIRSPACE_FILL_LAYER_ID)) {
      map.addLayer(
        {
          id: AIRSPACE_FILL_LAYER_ID,
          type: 'fill',
          source: AIRSPACE_SOURCE_ID,
          minzoom: minZoom,
          paint: {
            'fill-color': ['get', 'fillColor'],
            'fill-opacity': fillOpacity,
          },
        },
        // 다른 레이어 아래에 배치
        'waypoint-layer'
      );
    }

    // 공역 경계선 레이어
    if (!map.getLayer(AIRSPACE_LINE_LAYER_ID)) {
      map.addLayer(
        {
          id: AIRSPACE_LINE_LAYER_ID,
          type: 'line',
          source: AIRSPACE_SOURCE_ID,
          minzoom: minZoom,
          paint: {
            'line-color': ['get', 'lineColor'],
            'line-width': 2,
            'line-dasharray': [
              'match',
              ['get', 'type'],
              'P',
              ['literal', [2, 2]], // Prohibited: dashed
              'R',
              ['literal', [4, 2]], // Restricted: long dash
              'D',
              ['literal', [1, 1]], // Danger: dotted
              ['literal', [1]], // Solid for others
            ],
          },
        },
        'waypoint-layer'
      );
    }

    // 라벨 레이어
    if (showLabels && !map.getLayer(`${AIRSPACE_FILL_LAYER_ID}-labels`)) {
      map.addLayer({
        id: `${AIRSPACE_FILL_LAYER_ID}-labels`,
        type: 'symbol',
        source: AIRSPACE_SOURCE_ID,
        minzoom: 8,
        layout: {
          'text-field': [
            'concat',
            ['get', 'name'],
            '\n',
            ['get', 'type'],
            ' ',
            ['to-string', ['get', 'lowerLimit']],
            '-',
            ['to-string', ['get', 'upperLimit']],
          ],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 10,
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#000000',
          'text-halo-width': 1,
        },
      });
    }

    // 툴팁
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
    });

    const handleMouseEnter = (e: mapboxgl.MapLayerMouseEvent) => {
      const features = e.features;
      if (!features || features.length === 0) return;

      const props = features[0].properties;
      if (!props) return;

      const content = `
        <strong>${props.name}</strong><br/>
        Type: ${props.type}${props.class ? ` (Class ${props.class})` : ''}<br/>
        ${props.lowerLimit || 0}ft - ${props.upperLimit || 'UNL'}ft
      `;

      popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    };

    const handleMouseLeave = () => {
      popup.remove();
    };

    map.on('mouseenter', AIRSPACE_FILL_LAYER_ID, handleMouseEnter);
    map.on('mouseleave', AIRSPACE_FILL_LAYER_ID, handleMouseLeave);

    return () => {
      map.off('mouseenter', AIRSPACE_FILL_LAYER_ID, handleMouseEnter);
      map.off('mouseleave', AIRSPACE_FILL_LAYER_ID, handleMouseLeave);
      popup.remove();
    };
  }, [isMapLoaded, showLabels, minZoom, fillOpacity]);

  /**
   * 데이터 업데이트
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const source = map.getSource(AIRSPACE_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(createGeoJSON(airspaces));
    }
  }, [airspaces, isMapLoaded, createGeoJSON]);

  /**
   * 레이어 가시성 업데이트
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const visibility = layerVisibility.airspaces ? 'visible' : 'none';

    [AIRSPACE_FILL_LAYER_ID, AIRSPACE_LINE_LAYER_ID, `${AIRSPACE_FILL_LAYER_ID}-labels`].forEach(
      (layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      }
    );
  }, [layerVisibility.airspaces, isMapLoaded]);

  return null;
}

export default AirspaceLayer;
