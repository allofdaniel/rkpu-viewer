/**
 * MapContainer Component
 * DO-278A 요구사항 추적: SRS-UI-001
 *
 * Mapbox GL 지도 컨테이너 컴포넌트
 */

/* eslint-disable react-hooks/exhaustive-deps */
// Mapbox GL dependencies are intentionally excluded from useEffect deps

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapContext } from '../../contexts/MapContext';
import {
  MAPBOX_ACCESS_TOKEN,
  MAP_STYLES,
} from '@/config/constants';

// Mapbox 토큰 설정
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

interface MapContainerProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 지도 컨테이너 컴포넌트
 */
export function MapContainer({
  children,
  className = '',
  style,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { mapRef, setMapLoaded, mapStyle, viewState } = useMapContext();

  // Mapbox 토큰 여부 상태
  const hasToken = Boolean(MAPBOX_ACCESS_TOKEN);

  /**
   * 지도 초기화
   * DO-278A: Hooks는 조건부 return 전에 호출되어야 함
   */
  useEffect(() => {
    // 토큰 없으면 초기화 건너뜀
    if (!hasToken) return;
    if (!containerRef.current || mapRef.current || !hasToken) return;

    const styleSpec = MAP_STYLES[mapStyle];

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: typeof styleSpec === 'string' ? styleSpec : (JSON.parse(JSON.stringify(styleSpec)) as mapboxgl.Style),
      center: [viewState.center.lon, viewState.center.lat],
      zoom: viewState.zoom,
      pitch: viewState.pitch,
      bearing: viewState.bearing,
      antialias: true,
      attributionControl: false,
    });

    // 지형 설정
    map.on('load', () => {
      // 3D 지형 추가
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });

      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

      // 3D 건물 레이어
      const layers = map.getStyle().layers;
      const labelLayerId = layers?.find(
        (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
      )?.id;

      if (labelLayerId && !map.getLayer('3d-buildings')) {
        map.addLayer(
          {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 12,
            paint: {
              'fill-extrusion-color': '#444',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.6,
            },
          },
          labelLayerId
        );
      }

      setMapLoaded(true);

      // Context Menu 이벤트 등록 (우클릭)
      map.on('contextmenu', (e) => {
        console.log('[MapContainer] Right-click detected!', e.lngLat);
        // 커스텀 이벤트 발생
        window.dispatchEvent(new CustomEvent('map-contextmenu', {
          detail: {
            lngLat: e.lngLat,
            point: e.point
          }
        }));
      });
    });

    // 네비게이션 컨트롤
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [hasToken]);

  /**
   * 스타일 변경 처리
   */
  useEffect(() => {
    if (!mapRef.current || !hasToken) return;

    const styleSpec = MAP_STYLES[mapStyle];
    mapRef.current.setStyle(
      typeof styleSpec === 'string' ? styleSpec : (JSON.parse(JSON.stringify(styleSpec)) as mapboxgl.Style)
    );
  }, [mapStyle, hasToken]);

  // Mapbox 토큰 검증 - Hooks 호출 후 조건부 렌더링
  if (!hasToken) {
    return (
      <div
        className={`map-container ${className}`}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a2e',
          color: '#fff',
          padding: '2rem',
          textAlign: 'center',
          ...style,
        }}
      >
        <h2 style={{ color: '#ff6b6b', marginBottom: '1rem' }}>Mapbox 설정 오류</h2>
        <p style={{ marginBottom: '0.5rem' }}>VITE_MAPBOX_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.</p>
        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
          .env 파일에 Mapbox 토큰을 추가하세요.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`map-container ${className}`}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default MapContainer;
