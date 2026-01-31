import { useEffect, useRef, useState, type RefObject, type MutableRefObject } from 'react';
import mapboxgl, { Map as MapboxMap } from 'mapbox-gl';
import { MAP_STYLES, TRAIL_COLOR, MAPBOX_ACCESS_TOKEN } from '../constants/config';

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

export interface UseMapInitReturn {
  map: MutableRefObject<MapboxMap | null>;
  mapLoaded: boolean;
  setMapLoaded: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * useMapInit - Mapbox 지도 초기화 훅
 */
export default function useMapInit(
  mapContainerRef: RefObject<HTMLDivElement | null>
): UseMapInitReturn {
  const map = useRef<MapboxMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (map.current || !mapContainerRef.current) return;

    // Korea and surrounding airspace bounds
    // SW: [118, 30] to NE: [142, 46] covers Korea, Japan, parts of China
    const KOREA_BOUNDS: mapboxgl.LngLatBoundsLike = [[118, 30], [142, 46]];

    map.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES.dark as string,
      center: [127.5, 36.5], // Korea center
      zoom: 6, // Show all of Korea
      pitch: 0,
      bearing: 0,
      maxBounds: KOREA_BOUNDS,
      minZoom: 4,
      maxZoom: 18,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

    map.current.on('load', () => {
      if (!map.current) return;

      // Add terrain source
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 2.5 });

      // Add sky layer
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });

      // Add 3D buildings
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

      // Add runway
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
      map.current.addLayer({
        id: 'runway',
        type: 'line',
        source: 'runway',
        paint: { 'line-color': '#FFFFFF', 'line-width': 8 }
      });

      // Create custom triangle arrow image for trail arrowheads
      const arrowSize = 24;
      const arrowCanvas = document.createElement('canvas');
      arrowCanvas.width = arrowSize;
      arrowCanvas.height = arrowSize;
      const ctx = arrowCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = TRAIL_COLOR;
        ctx.beginPath();
        ctx.moveTo(arrowSize / 2, 0);
        ctx.lineTo(arrowSize, arrowSize);
        ctx.lineTo(arrowSize / 2, arrowSize * 0.7);
        ctx.lineTo(0, arrowSize);
        ctx.closePath();
        ctx.fill();
        map.current.addImage('trail-arrow', ctx.getImageData(0, 0, arrowSize, arrowSize), { sdf: true });
      }

      setMapLoaded(true);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapContainerRef]);

  return { map, mapLoaded, setMapLoaded };
}
