/**
 * useMapStyle Hook
 * 맵 스타일 및 뷰 모드 관리
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { MAP_STYLES } from '../constants/config';
import { logger } from '../utils/logger';

export interface UseMapStyleOptions {
  map: MutableRefObject<MapboxMap | null>;
  mapLoaded: boolean;
  setMapLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  isDarkMode: boolean;
  showSatellite: boolean;
  radarBlackBackground: boolean;
  is3DView: boolean;
  setIs3DView: (value: boolean) => void;
  showTerrain: boolean;
  show3DAltitude: boolean;
}

const useMapStyle = ({
  map,
  mapLoaded,
  setMapLoaded,
  isDarkMode,
  showSatellite,
  radarBlackBackground,
  is3DView,
  setIs3DView,
  showTerrain,
  show3DAltitude
}: UseMapStyleOptions): void => {
  const prevStyleRef = useRef<string | null>(null);
  const prev3DViewRef = useRef<boolean | null>(null);

  // Handle base style change (dark/light/satellite) - NOT black background
  useEffect(() => {
    if (!map?.current || !mapLoaded) return;

    // 기본 스타일 선택
    // V-World 키가 있으면 위성은 래스터 오버레이로 처리 (스타일 교체 불필요)
    const vworldKey = import.meta.env.VITE_VWORLD_API_KEY;
    const newStyle = (!vworldKey && showSatellite)
      ? MAP_STYLES.satellite as string
      : (isDarkMode ? MAP_STYLES.dark as string : MAP_STYLES.light as string);

    // 스타일이 같으면 스킵
    if (prevStyleRef.current === newStyle) return;
    prevStyleRef.current = newStyle;

    const center = map.current.getCenter();
    const zoom = map.current.getZoom();
    const pitch = map.current.getPitch();
    const bearing = map.current.getBearing();

    map.current.setStyle(newStyle);
    map.current.once('style.load', () => {
      if (!map.current) return;

      map.current.setCenter(center);
      map.current.setZoom(zoom);

      // 3D 모드: 저장된 pitch가 있으면 복원, 없으면 기본 3D 값 적용
      if (is3DView) {
        map.current.setPitch(pitch > 0 ? pitch : 60);
        map.current.setBearing(bearing !== 0 ? bearing : -30);
      } else {
        map.current.setPitch(pitch);
        map.current.setBearing(bearing);
      }

      // Add terrain source
      if (!map.current.getSource('mapbox-dem')) {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        });
      }

      // 3D 고도 표시가 활성화되면 terrain을 비활성화하여 MSL 기준 절대 고도로 표시
      if (is3DView && showTerrain && !show3DAltitude) {
        map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 2.5 });
      }

      // Add sky layer
      if (!map.current.getLayer('sky')) {
        map.current.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 90.0],
            'sky-atmosphere-sun-intensity': 15
          }
        });
      }

      // 3D 빌딩 추가
      try {
        if (!map.current.getLayer('3d-buildings') && map.current.getSource('composite')) {
          map.current.addLayer({
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 10,
            paint: {
              'fill-extrusion-color': '#aaa',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.6
            }
          });
        }
      } catch {
        logger.debug('MapStyle', '3D buildings skipped - no composite source');
      }

      // Add runway source and layer
      if (!map.current.getSource('runway')) {
        map.current.addSource('runway', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [[129.3505, 35.5890], [129.3530, 35.5978]]
            }
          }
        });
      }
      if (!map.current.getLayer('runway')) {
        map.current.addLayer({
          id: 'runway',
          type: 'line',
          source: 'runway',
          paint: { 'line-color': '#FFFFFF', 'line-width': 8 }
        });
      }

      // 스타일 리로드에서 3D 상태를 직접 처리했으므로 ref를 현재값으로 설정
      prev3DViewRef.current = is3DView;

      setMapLoaded(false);
      setTimeout(() => setMapLoaded(true), 100);
    });
  }, [map, isDarkMode, showSatellite, mapLoaded, setMapLoaded, is3DView, showTerrain, show3DAltitude]);

  // Handle black background toggle - 단순 오버레이 방식
  useEffect(() => {
    if (!map?.current || !mapLoaded) return;
    if (!map.current.isStyleLoaded()) return;

    const blackOverlayId = 'radar-black-overlay';

    // radarBlackBackground가 true면 검은 오버레이 표시
    if (radarBlackBackground) {
      if (!map.current.getLayer(blackOverlayId)) {
        // 커스텀 레이어들 (항적, 항공기 등) 바로 아래에 검은 오버레이 추가
        // 이렇게 하면 Mapbox 기본 레이어 위, 커스텀 레이어 아래에 위치
        const customLayerIds = [
          'aircraft-3d', 'aircraft-2d', 'aircraft-labels',
          'aircraft-trails-3d', 'aircraft-trails-2d', 'trail-layer',
          'waypoint-layer', 'airspace-layer', 'atc-sectors-fill'
        ];

        // 존재하는 첫 번째 커스텀 레이어 찾기
        let beforeLayerId: string | undefined;
        for (const layerId of customLayerIds) {
          if (map.current.getLayer(layerId)) {
            beforeLayerId = layerId;
            break;
          }
        }

        map.current.addLayer({
          id: blackOverlayId,
          type: 'background',
          paint: {
            'background-color': '#000000',
            'background-opacity': 0.95
          }
        }, beforeLayerId); // 커스텀 레이어 앞에 추가 = Mapbox 레이어 위, 커스텀 레이어 아래
      }
    } else {
      // 오버레이 제거
      if (map.current.getLayer(blackOverlayId)) {
        map.current.removeLayer(blackOverlayId);
      }
    }
  }, [map, radarBlackBackground, mapLoaded]);

  // Handle V-World satellite raster overlay toggle
  useEffect(() => {
    if (!map?.current || !mapLoaded) return;
    const vworldKey = import.meta.env.VITE_VWORLD_API_KEY;
    if (!vworldKey) return; // V-World 미설정 시 Mapbox satellite 폴백
    if (!map.current.isStyleLoaded()) return;

    const sourceId = 'vworld-satellite';
    const layerId = 'vworld-satellite-layer';

    if (showSatellite) {
      // V-World 래스터 소스 추가
      if (!map.current.getSource(sourceId)) {
        map.current.addSource(sourceId, {
          type: 'raster',
          tiles: [`https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/Satellite/{z}/{y}/{x}.jpeg`],
          tileSize: 256,
          minzoom: 5,
          maxzoom: 19,
          attribution: '&copy; V-World (국토교통부)'
        });
      }
      // 래스터 레이어 추가 (기본 지도 위, 커스텀 레이어 아래)
      if (!map.current.getLayer(layerId)) {
        const customLayerIds = [
          'radar-black-overlay',
          'aircraft-3d', 'aircraft-2d', 'aircraft-labels',
          'aircraft-trails-3d', 'aircraft-trails-2d', 'trail-layer',
          'waypoint-layer', 'airspace-layer', 'atc-sectors-fill'
        ];
        let beforeLayerId: string | undefined;
        for (const id of customLayerIds) {
          if (map.current.getLayer(id)) {
            beforeLayerId = id;
            break;
          }
        }
        map.current.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': 1 }
        }, beforeLayerId);
      }
    } else {
      // V-World 레이어/소스 제거
      if (map.current.getLayer(layerId)) {
        map.current.removeLayer(layerId);
      }
      if (map.current.getSource(sourceId)) {
        map.current.removeSource(sourceId);
      }
    }
  }, [map, showSatellite, mapLoaded]);

  // Handle 2D/3D toggle - only animate when is3DView actually changes
  useEffect(() => {
    if (!map?.current || !mapLoaded) return;
    // Skip if is3DView hasn't changed (e.g. mapLoaded toggled due to style switch)
    if (prev3DViewRef.current === is3DView) return;
    prev3DViewRef.current = is3DView;

    if (is3DView) {
      // 이미 틸트된 상태(피치 리스너에 의한 전환)면 애니메이션 스킵
      if (map.current.getPitch() < 10) {
        map.current.easeTo({ pitch: 60, bearing: -30, duration: 1000 });
      }
      // Terrain 활성화 (스타일 리로드 없이 3D 전환 시에도 동작하도록)
      if (!map.current.getSource('mapbox-dem')) {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        });
      }
      if (showTerrain && !show3DAltitude) {
        map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 2.5 });
      }
      // 3D 빌딩 추가
      try {
        if (!map.current.getLayer('3d-buildings') && map.current.getSource('composite')) {
          map.current.addLayer({
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 10,
            paint: {
              'fill-extrusion-color': '#aaa',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.6
            }
          });
        }
      } catch {
        // composite source not available
      }
    } else {
      // 이미 평면 상태(피치 리스너에 의한 전환)면 애니메이션 스킵
      if (map.current.getPitch() > 5) {
        map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      }
      map.current.setTerrain(null);
    }
  }, [map, is3DView, mapLoaded, showTerrain, show3DAltitude]);

  // 피치 변화에 따른 2D/3D 자동 전환
  useEffect(() => {
    if (!map?.current || !mapLoaded) return;

    const PITCH_3D_THRESHOLD = 15; // pitch > 15 → 3D로 전환
    const PITCH_2D_THRESHOLD = 5;  // pitch < 5 → 2D로 전환

    const handlePitchEnd = () => {
      if (!map.current) return;
      const currentPitch = map.current.getPitch();

      if (!is3DView && currentPitch > PITCH_3D_THRESHOLD) {
        prev3DViewRef.current = true;
        setIs3DView(true);
      } else if (is3DView && currentPitch < PITCH_2D_THRESHOLD) {
        prev3DViewRef.current = false;
        setIs3DView(false);
      }
    };

    map.current.on('pitchend', handlePitchEnd);
    return () => {
      map.current?.off('pitchend', handlePitchEnd);
    };
  }, [map, mapLoaded, is3DView, setIs3DView]);
};

export default useMapStyle;
