/**
 * useMapStyle Hook
 * 留??ㅽ???諛?酉?紐⑤뱶 愿由?
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
    if (!map?.current || !mapLoaded) {
      logger.debug('MapStyle', `Early return: map=${!!map?.current}, mapLoaded=${mapLoaded}`);
      return;
    }

    // 湲곕낯 ?ㅽ????좏깮 (dark/light留?- ?꾩꽦? ?섏뒪???ㅻ쾭?덉씠濡?泥섎━)
    const newStyle = isDarkMode ? MAP_STYLES.dark as string : MAP_STYLES.light as string;

    logger.debug('MapStyle', `Style check: showSatellite=${showSatellite}, isDarkMode=${isDarkMode}, newStyle=${newStyle}, prevStyle=${prevStyleRef.current}`);

    // ?ㅽ??쇱씠 媛숈쑝硫??ㅽ궢
    if (prevStyleRef.current === newStyle) {
      logger.debug('MapStyle', 'Style unchanged, skipping');
      return;
    }
    prevStyleRef.current = newStyle;
    logger.info('MapStyle', `Changing style to: ${newStyle}`);

    const center = map.current.getCenter();
    const zoom = map.current.getZoom();
    const pitch = map.current.getPitch();
    const bearing = map.current.getBearing();

    map.current.setStyle(newStyle);
    map.current.once('style.load', () => {
      if (!map.current) return;

      map.current.setCenter(center);
      map.current.setZoom(zoom);

      // 3D 紐⑤뱶: ??λ맂 pitch媛 ?덉쑝硫?蹂듭썝, ?놁쑝硫?湲곕낯 3D 媛??곸슜
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

      // 3D 怨좊룄 ?쒖떆媛 ?쒖꽦?붾릺硫?terrain??鍮꾪솢?깊솕?섏뿬 MSL 湲곗? ?덈? 怨좊룄濡??쒖떆
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

      // 3D 鍮뚮뵫 異붽?
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

      // ?ㅽ???由щ줈?쒖뿉??3D ?곹깭瑜?吏곸젒 泥섎━?덉쑝誘濡?ref瑜??꾩옱媛믪쑝濡??ㅼ젙
      prev3DViewRef.current = is3DView;

      setMapLoaded(false);
      setTimeout(() => setMapLoaded(true), 100);
    });
  }, [map, isDarkMode, showSatellite, mapLoaded, setMapLoaded, is3DView, showTerrain, show3DAltitude]);

  // Handle black background toggle - ?⑥닚 ?ㅻ쾭?덉씠 諛⑹떇
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapLoaded) return;
    if (!mapInstance.isStyleLoaded()) return;

    const blackOverlayId = 'radar-black-overlay';

    // radarBlackBackground媛 true硫?寃? ?ㅻ쾭?덉씠 ?쒖떆
    if (radarBlackBackground) {
        if (!mapInstance.getLayer(blackOverlayId)) {
        // 而ㅼ뒪? ?덉씠?대뱾 (??쟻, ??났湲??? 諛붾줈 ?꾨옒??寃? ?ㅻ쾭?덉씠 異붽?
        // ?대젃寃??섎㈃ Mapbox 湲곕낯 ?덉씠???? 而ㅼ뒪? ?덉씠???꾨옒???꾩튂
        const customLayerIds = [
          'aircraft-3d', 'aircraft-2d', 'aircraft-labels',
          'aircraft-trails-3d', 'aircraft-trails-2d', 'trail-layer',
          'waypoint-layer', 'airspace-layer', 'atc-sectors-fill'
        ];

        // 議댁옱?섎뒗 泥?踰덉㎏ 而ㅼ뒪? ?덉씠??李얘린
        let beforeLayerId: string | undefined;
        for (const layerId of customLayerIds) {
          if (mapInstance.getLayer(layerId)) {
            beforeLayerId = layerId;
            break;
          }
        }

        mapInstance.addLayer({
          id: blackOverlayId,
          type: 'background',
          paint: {
            'background-color': '#000000',
            'background-opacity': 0.95
          }
        }, beforeLayerId); // 而ㅼ뒪? ?덉씠???욎뿉 異붽? = Mapbox ?덉씠???? 而ㅼ뒪? ?덉씠???꾨옒
      }
    } else {
      // ?ㅻ쾭?덉씠 ?쒓굅
      if (mapInstance.getLayer(blackOverlayId)) {
        mapInstance.removeLayer(blackOverlayId);
      }
    }
  }, [map, radarBlackBackground, mapLoaded]);

  // Handle satellite raster overlay toggle (V-World or Mapbox)
  useEffect(() => {
    if (!map?.current || !mapLoaded) {
      return;
    }

    const vworldKey = import.meta.env.VITE_VWORLD_API_KEY;
    const sourceId = 'satellite-overlay';
    const layerId = 'satellite-overlay-layer';

    // ?ㅽ???濡쒕뱶 ?湲????ㅽ뻾
    const toggleSatelliteLayer = () => {
      if (!map.current) return;

      try {
        if (showSatellite) {
          // ?꾩꽦 ?섏뒪???뚯뒪 異붽?
          if (!map.current.getSource(sourceId)) {
            if (vworldKey) {
              // V-World ?꾩꽦 (?쒓뎅 怨좏빐?곷룄)
              logger.info('MapStyle', 'Adding V-World satellite source');
              map.current.addSource(sourceId, {
                type: 'raster',
                tiles: [`https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/Satellite/{z}/{y}/{x}.jpeg`],
                tileSize: 256,
                minzoom: 5,
                maxzoom: 19,
                attribution: '&copy; V-World (援?넗援먰넻遺)'
              });
            } else {
              // Mapbox ?꾩꽦 (湲濡쒕쾶)
              logger.info('MapStyle', 'Adding Mapbox satellite source');
              map.current.addSource(sourceId, {
                type: 'raster',
                url: 'mapbox://mapbox.satellite',
                tileSize: 256
              });
            }
          }
          // ?섏뒪???덉씠??異붽? (background 諛붾줈 ?꾩뿉)
          if (!map.current.getLayer(layerId)) {
            // Mapbox 湲곕낯 ?덉씠??以?泥?踰덉㎏ 鍮?background ?덉씠??李얘린
            const layers = map.current.getStyle()?.layers || [];
            let firstNonBgLayer: string | undefined;
            for (const layer of layers) {
              if (layer.type !== 'background') {
                firstNonBgLayer = layer.id;
                break;
              }
            }
            logger.info('MapStyle', `Adding satellite layer before ${firstNonBgLayer || 'end'}`);
            map.current.addLayer({
              id: layerId,
              type: 'raster',
              source: sourceId,
              paint: { 'raster-opacity': 1 }
            }, firstNonBgLayer);
          }
        } else {
          // ?꾩꽦 ?덉씠???뚯뒪 ?쒓굅
          if (map.current.getLayer(layerId)) {
            logger.info('MapStyle', 'Removing satellite layer');
            map.current.removeLayer(layerId);
          }
          if (map.current.getSource(sourceId)) {
            map.current.removeSource(sourceId);
          }
        }
      } catch (err) {
        logger.error('MapStyle', `Satellite overlay error: ${err}`);
      }
    };

    // ?ㅽ??쇱씠 濡쒕뱶?섏뿀?쇰㈃ 諛붾줈 ?ㅽ뻾, ?꾨땲硫??湲?
    if (map.current.isStyleLoaded()) {
      toggleSatelliteLayer();
    } else {
      map.current.once('style.load', toggleSatelliteLayer);
    }
  }, [map, showSatellite, mapLoaded]);

  // Handle 2D/3D toggle - only animate when is3DView actually changes
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapLoaded) return;
    // Skip if is3DView hasn't changed (e.g. mapLoaded toggled due to style switch)
    if (prev3DViewRef.current === is3DView) return;
    prev3DViewRef.current = is3DView;

    if (is3DView) {
      // ?대? ?명듃???곹깭(?쇱튂 由ъ뒪?덉뿉 ?섑븳 ?꾪솚)硫??좊땲硫붿씠???ㅽ궢
      if (mapInstance.getPitch() < 10) {
        mapInstance.easeTo({ pitch: 60, bearing: -30, duration: 1000 });
      }
      // Terrain ?쒖꽦??(?ㅽ???由щ줈???놁씠 3D ?꾪솚 ?쒖뿉???숈옉?섎룄濡?
      if (!mapInstance.getSource('mapbox-dem')) {
        mapInstance.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        });
      }
      if (showTerrain && !show3DAltitude) {
        mapInstance.setTerrain({ source: 'mapbox-dem', exaggeration: 2.5 });
      }
      // 3D 鍮뚮뵫 異붽?
      try {
        if (!mapInstance.getLayer('3d-buildings') && mapInstance.getSource('composite')) {
          mapInstance.addLayer({
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
      // ?대? ?됰㈃ ?곹깭(?쇱튂 由ъ뒪?덉뿉 ?섑븳 ?꾪솚)硫??좊땲硫붿씠???ㅽ궢
      if (mapInstance.getPitch() > 5) {
        mapInstance.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      }
      mapInstance.setTerrain(null);
    }
  }, [map, is3DView, mapLoaded, showTerrain, show3DAltitude]);

  // ?쇱튂 蹂?붿뿉 ?곕Ⅸ 2D/3D ?먮룞 ?꾪솚
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapLoaded) return;

    const PITCH_3D_THRESHOLD = 15; // pitch > 15 ??3D濡??꾪솚
    const PITCH_2D_THRESHOLD = 5;  // pitch < 5 ??2D濡??꾪솚

    const handlePitchEnd = () => {
      const currentPitch = mapInstance.getPitch();

      if (!is3DView && currentPitch > PITCH_3D_THRESHOLD) {
        setIs3DView(true);
      } else if (is3DView && currentPitch < PITCH_2D_THRESHOLD) {
        setIs3DView(false);
      }
    };

    mapInstance.on('pitchend', handlePitchEnd);
    return () => {
      mapInstance.off('pitchend', handlePitchEnd);
    };
  }, [map, mapLoaded, is3DView, setIs3DView]);
};

export default useMapStyle;

