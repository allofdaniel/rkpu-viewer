import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock mapbox-gl
vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    Map: vi.fn(() => ({
      on: vi.fn(),
      off: vi.fn(),
      remove: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      removeLayer: vi.fn(),
      removeSource: vi.fn(),
      getSource: vi.fn(),
      getLayer: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      flyTo: vi.fn(),
      getCenter: vi.fn(() => ({ lng: 129.3518, lat: 35.5934 })),
      getZoom: vi.fn(() => 10),
      getBearing: vi.fn(() => 0),
      getPitch: vi.fn(() => 0),
    })),
    Marker: vi.fn(() => ({
      setLngLat: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    })),
    Popup: vi.fn(() => ({
      setLngLat: vi.fn().mockReturnThis(),
      setHTML: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    })),
  },
}));

// Mock Three.js
vi.mock('three', () => ({
  Scene: vi.fn(),
  PerspectiveCamera: vi.fn(),
  WebGLRenderer: vi.fn(() => ({
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    domElement: document.createElement('canvas'),
  })),
  Group: vi.fn(() => ({
    add: vi.fn(),
    remove: vi.fn(),
    position: { set: vi.fn() },
    rotation: { set: vi.fn() },
    scale: { set: vi.fn() },
  })),
  Object3D: vi.fn(),
  Vector3: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    clone: vi.fn().mockReturnThis(),
    add: vi.fn().mockReturnThis(),
    sub: vi.fn().mockReturnThis(),
    normalize: vi.fn().mockReturnThis(),
    multiplyScalar: vi.fn().mockReturnThis(),
  })),
  Matrix4: vi.fn(() => ({
    makeRotationX: vi.fn().mockReturnThis(),
    makeRotationY: vi.fn().mockReturnThis(),
    makeRotationZ: vi.fn().mockReturnThis(),
    multiply: vi.fn().mockReturnThis(),
  })),
  Quaternion: vi.fn(),
  Euler: vi.fn(),
  Color: vi.fn(),
  LineBasicMaterial: vi.fn(),
  MeshBasicMaterial: vi.fn(),
  BufferGeometry: vi.fn(() => ({
    setFromPoints: vi.fn(),
    dispose: vi.fn(),
  })),
  Line: vi.fn(),
  Mesh: vi.fn(),
}));

// Mock GLTFLoader
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn(() => ({
    load: vi.fn((_url, onLoad) => {
      onLoad({ scene: {} });
    }),
  })),
}));

// Mock fetch
global.fetch = vi.fn();

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
