/* eslint-disable react-hooks/exhaustive-deps */
// Mapbox GL dependencies are intentionally excluded from useEffect deps

import { useEffect, type MutableRefObject } from 'react';
import mapboxgl, { type Map as MapboxMap } from 'mapbox-gl';
import {
  getNotamDisplayCoords,
  getNotamValidity,
  buildCancelledNotamSet,
  createNotamCircle,
  parseNotamPolygon,
} from '../utils/notam';
import type { NotamItem, NotamData } from './useNotam';

interface NotamCoords {
  lon: number;
  lat: number;
  radiusNM?: number;
  lowerAlt: number;
  upperAlt: number;
}

/**
 * useNotamLayer - NOTAM 지도 레이어 렌더링 훅
 * - 선택된 위치의 NOTAM 표시
 * - 3D 고도 extrusion
 * - 클릭 시 상세 팝업
 */
export default function useNotamLayer(
  map: MutableRefObject<MapboxMap | null>,
  mapLoaded: boolean,
  notamLocationsOnMap: Set<string>,
  notamData: NotamData | null,
  is3DView: boolean
): void {
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const safeRemoveLayer = (id: string): void => {
      try { if (map.current?.getLayer(id)) map.current.removeLayer(id); } catch { /* ignore */ }
    };
    const safeRemoveSource = (id: string): void => {
      try { if (map.current?.getSource(id)) map.current.removeSource(id); } catch { /* ignore */ }
    };

    // Clean up previous layers
    ['notam-extrusion', 'notam-fill', 'notam-outline', 'notam-icons', 'notam-labels'].forEach(safeRemoveLayer);
    ['notam-areas', 'notam-centers'].forEach(safeRemoveSource);

    // Active NOTAMs on map - only show when locations are selected
    if (notamLocationsOnMap.size === 0 || !notamData?.data || notamData.data.length === 0) return;

    // Build set of cancelled NOTAMs first
    const cancelledSet = buildCancelledNotamSet(notamData.data);

    // Filter NOTAMs: only selected locations, only currently active (not future), exclude expired
    const validNotams = notamData.data.filter((n: NotamItem) => {
      // Must be in selected locations
      if (!notamLocationsOnMap.has(n.location)) return false;
      // Check if currently active only (not future, not expired/cancelled)
      const validity = getNotamValidity(n, cancelledSet);
      if (validity !== 'active') return false;
      // Must have coordinates (Q-line or airport fallback)
      const coords = getNotamDisplayCoords(n);
      if (!coords) return false;
      // Exclude NOTAMs with very large radius (100+ NM) that cover large portions of map
      if (coords.radiusNM && coords.radiusNM >= 100) return false;
      return true;
    });

    if (validNotams.length === 0) return;

    interface NotamFeature {
      type: 'Feature';
      geometry: {
        type: string;
        coordinates: unknown;
      };
      properties: Record<string, unknown>;
    }

    const notamFeatures: NotamFeature[] = validNotams.map((n: NotamItem) => {
      const coords = getNotamDisplayCoords(n) as NotamCoords;
      const validity = getNotamValidity(n, cancelledSet);
      // Try to parse polygon coordinates from E-text (e.g., danger areas, restricted areas)
      const polygonCoords = parseNotamPolygon(n.full_text);
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: polygonCoords || createNotamCircle(coords.lon, coords.lat, coords.radiusNM || 5) },
        properties: {
          id: n.id,
          notam_number: n.notam_number,
          location: n.location,
          qcode: n.qcode,
          qcode_mean: n.qcode_mean,
          e_text: n.e_text,
          full_text: n.full_text,
          effective_start: n.effective_start,
          effective_end: n.effective_end || 'PERM',
          series: n.series,
          fir: n.fir,
          lowerAlt: coords.lowerAlt,
          upperAlt: coords.upperAlt,
          validity: validity,
          isPolygon: polygonCoords ? true : false
        }
      };
    });

    // Center points for labels (include full properties for click handler)
    const notamCenterFeatures: NotamFeature[] = validNotams.map((n: NotamItem) => {
      const coords = getNotamDisplayCoords(n) as NotamCoords;
      const validity = getNotamValidity(n, cancelledSet);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [coords.lon, coords.lat] },
        properties: {
          id: n.id,
          notam_number: n.notam_number,
          location: n.location,
          qcode: n.qcode,
          qcode_mean: n.qcode_mean,
          e_text: n.e_text,
          full_text: n.full_text,
          effective_start: n.effective_start,
          effective_end: n.effective_end || 'PERM',
          series: n.series,
          fir: n.fir,
          lowerAlt: coords.lowerAlt,
          upperAlt: coords.upperAlt,
          validity: validity
        }
      };
    });

    map.current.addSource('notam-areas', { type: 'geojson', data: { type: 'FeatureCollection', features: notamFeatures } as GeoJSON.FeatureCollection });

    // 3D extrusion layer for NOTAMs (shows altitude range) - color by validity
    if (is3DView) {
      map.current.addLayer({
        id: 'notam-extrusion',
        type: 'fill-extrusion',
        source: 'notam-areas',
        paint: {
          'fill-extrusion-color': [
            'case',
            ['==', ['get', 'validity'], 'future'], '#2196F3',
            '#FF9800'
          ],
          'fill-extrusion-opacity': 0.35,
          'fill-extrusion-base': ['*', ['get', 'lowerAlt'], 0.3048],
          'fill-extrusion-height': ['*', ['get', 'upperAlt'], 0.3048]
        }
      });
    }

    // 2D fill layer - color by validity (active: orange, future: blue)
    map.current.addLayer({
      id: 'notam-fill',
      type: 'fill',
      source: 'notam-areas',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'validity'], 'future'], '#2196F3',
          '#FF9800'
        ],
        'fill-opacity': is3DView ? 0.05 : 0.15
      }
    });
    map.current.addLayer({
      id: 'notam-outline',
      type: 'line',
      source: 'notam-areas',
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'validity'], 'future'], '#2196F3',
          '#FF9800'
        ],
        'line-width': 2,
        'line-dasharray': [3, 2]
      }
    });

    map.current.addSource('notam-centers', { type: 'geojson', data: { type: 'FeatureCollection', features: notamCenterFeatures } as GeoJSON.FeatureCollection });
    map.current.addLayer({
      id: 'notam-icons',
      type: 'circle',
      source: 'notam-centers',
      paint: {
        'circle-radius': 6,
        'circle-color': [
          'case',
          ['==', ['get', 'validity'], 'future'], '#2196F3',
          '#FF9800'
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });
    map.current.addLayer({
      id: 'notam-labels',
      type: 'symbol',
      source: 'notam-centers',
      layout: {
        'text-field': ['get', 'notam_number'],
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-allow-overlap': true,
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold']
      },
      paint: {
        'text-color': [
          'case',
          ['==', ['get', 'validity'], 'future'], '#2196F3',
          '#FF9800'
        ],
        'text-halo-color': 'rgba(0, 0, 0, 0.9)',
        'text-halo-width': 1.5
      }
    });

    // Helper function to show NOTAM popup
    const showNotamPopup = (props: Record<string, unknown>, lngLat: mapboxgl.LngLat): void => {
      // Format effective times (YYMMDDHHMM -> readable format)
      const formatNotamTime = (timeStr: unknown): string => {
        if (!timeStr || timeStr === 'PERM') return 'PERM (영구)';
        const str = String(timeStr);
        if (str.length < 10) return str;
        const year = '20' + str.substring(0, 2);
        const month = str.substring(2, 4);
        const day = str.substring(4, 6);
        const hour = str.substring(6, 8);
        const minute = str.substring(8, 10);
        return `${year}-${month}-${day} ${hour}:${minute}Z`;
      };

      const startTime = formatNotamTime(props.effective_start);
      const endTime = formatNotamTime(props.effective_end);
      const validity = props.validity as string;
      const validityColor = validity === 'future' ? '#2196F3' : '#FF9800';
      const validityText = validity === 'future' ? '예정' : '활성';
      const validityBgColor = validity === 'future' ? 'rgba(33,150,243,0.2)' : 'rgba(255,152,0,0.2)';

      // Escape and format full_text for HTML display
      const fullTextFormatted = (String(props.full_text || ''))
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n/g, '<br>')
        .replace(/\n/g, '<br>');

      const popupContent = `
        <div style="max-width: 400px; font-size: 12px; max-height: 500px; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid ${validityColor}40; padding-bottom: 6px;">
            <span style="font-weight: bold; color: ${validityColor}; font-size: 14px;">${props.notam_number}</span>
            <div style="display: flex; gap: 4px;">
              <span style="background: ${validityBgColor}; color: ${validityColor}; padding: 2px 6px; border-radius: 3px; font-size: 10px;">${validityText}</span>
              <span style="background: rgba(255,255,255,0.1); color: #aaa; padding: 2px 6px; border-radius: 3px; font-size: 10px;">${props.series || ''}</span>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; margin-bottom: 8px;">
            <span style="color: #888;">위치:</span><span>${props.location} (${props.fir || 'RKRR'})</span>
            <span style="color: #888;">Q-Code:</span><span>${props.qcode}</span>
            <span style="color: #888;">의미:</span><span>${props.qcode_mean || '-'}</span>
            <span style="color: #888;">유효시작:</span><span style="color: #4CAF50;">${startTime}</span>
            <span style="color: #888;">유효종료:</span><span style="color: #f44336;">${endTime}</span>
            <span style="color: #888;">고도:</span><span>FL${String(Math.round((props.lowerAlt as number)/100)).padStart(3,'0')} ~ FL${String(Math.round((props.upperAlt as number)/100)).padStart(3,'0')}</span>
          </div>
          <div style="margin-bottom: 8px;">
            <div style="color: #888; margin-bottom: 4px; font-size: 11px;">내용 (E):</div>
            <div style="background: ${validityBgColor}; padding: 8px; border-radius: 4px; white-space: pre-wrap; line-height: 1.4;">
              ${props.e_text || '-'}
            </div>
          </div>
          <details style="margin-top: 8px;">
            <summary style="cursor: pointer; color: ${validityColor}; font-size: 11px;">전문 보기 (Full Text)</summary>
            <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; margin-top: 4px; font-family: monospace; font-size: 10px; white-space: pre-wrap; line-height: 1.3; color: #ccc;">
              ${fullTextFormatted}
            </div>
          </details>
        </div>
      `;
      new mapboxgl.Popup({ closeButton: true, maxWidth: '450px' })
        .setLngLat(lngLat)
        .setHTML(popupContent)
        .addTo(map.current!);
    };

    // Add popup on click for fill layer
    const handleFillClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] }): void => {
      const feature = e.features?.[0];
      if (feature) {
        showNotamPopup(feature.properties || {}, e.lngLat);
      }
    };

    const handleIconClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] }): void => {
      e.preventDefault();
      const feature = e.features?.[0];
      if (feature) {
        showNotamPopup(feature.properties || {}, e.lngLat);
      }
    };

    const setCursor = (): void => { if (map.current) map.current.getCanvas().style.cursor = 'pointer'; };
    const resetCursor = (): void => { if (map.current) map.current.getCanvas().style.cursor = ''; };

    map.current.on('click', 'notam-fill', handleFillClick);
    map.current.on('mouseenter', 'notam-fill', setCursor);
    map.current.on('mouseleave', 'notam-fill', resetCursor);
    map.current.on('click', 'notam-icons', handleIconClick);
    map.current.on('mouseenter', 'notam-icons', setCursor);
    map.current.on('mouseleave', 'notam-icons', resetCursor);

    return () => {
      try {
        map.current?.off('click', 'notam-fill', handleFillClick);
        map.current?.off('mouseenter', 'notam-fill', setCursor);
        map.current?.off('mouseleave', 'notam-fill', resetCursor);
        map.current?.off('click', 'notam-icons', handleIconClick);
        map.current?.off('mouseenter', 'notam-icons', setCursor);
        map.current?.off('mouseleave', 'notam-icons', resetCursor);
      } catch { /* ignore */ }
    };

  }, [mapLoaded, notamLocationsOnMap, notamData, is3DView, map]);
}
