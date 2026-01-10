/**
 * Application Constants
 * DO-278A 요구사항 추적: SRS-CONFIG-001
 *
 * 애플리케이션 전역 상수 정의
 */

// ============================================
// 환경 설정
// ============================================

export const IS_PRODUCTION = import.meta.env.PROD;
export const IS_DEVELOPMENT = import.meta.env.DEV;

// ============================================
// API 설정
// ============================================

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://rkpu-viewer.vercel.app';

export const MAPBOX_ACCESS_TOKEN =
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
  'pk.eyJ1IjoiYWxsb2ZkYW5pZWwiLCJhIjoiY21pbzY5ejhkMDJvZzNjczVwMmlhYTljaiJ9.eSoww-z9bQuolQ4fQHqZOg';

// ============================================
// 갱신 주기
// ============================================

export const AIRCRAFT_UPDATE_INTERVAL = 5000; // 5초
export const WEATHER_UPDATE_INTERVAL = 60000; // 1분
export const NOTAM_CACHE_DURATION = 10 * 60 * 1000; // 10분

// ============================================
// 항적 설정
// ============================================

export const TRAIL_COLOR = '#39FF14';
export const TRAIL_DURATION_OPTIONS = [
  { label: '1분', value: 60000 },
  { label: '5분', value: 300000 },
  { label: '10분', value: 600000 },
  { label: '30분', value: 1800000 },
  { label: '1시간', value: 3600000 },
] as const;

export const DEFAULT_TRAIL_DURATION = 60000;
export const DEFAULT_HEADING_PREDICTION = 30; // 초
export const MAX_TRAIL_POINTS = 100;
export const MAX_TRAIL_JUMP_DEGREES = 0.1; // ~10km

// ============================================
// 지도 설정
// ============================================

export const DEFAULT_MAP_CENTER = {
  lat: 35.5934,
  lon: 129.3518,
} as const;

export const DEFAULT_MAP_ZOOM = 10;
export const DEFAULT_MAP_PITCH = 45;
export const DEFAULT_MAP_BEARING = 0;

export const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/light-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  black: {
    version: 8,
    name: 'Radar Black',
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#000000' },
      },
    ],
  },
} as const;

// ============================================
// 색상 정의
// ============================================

export const AIRCRAFT_CATEGORY_COLORS: Record<string, string> = {
  A0: '#00BCD4',
  A1: '#4CAF50',
  A2: '#8BC34A',
  A3: '#CDDC39',
  A4: '#FFEB3B',
  A5: '#FF9800',
  A6: '#F44336',
  A7: '#E91E63',
};

export const OBSTACLE_COLORS: Record<string, string> = {
  Tower: '#F44336',
  Building: '#FF5722',
  Natural: '#4CAF50',
  Tree: '#8BC34A',
  Navaid: '#9C27B0',
  Antenna: '#FF9800',
  Unknown: '#607D8B',
};

export const FLIGHT_PHASE_COLORS: Record<string, string> = {
  ground: '#9E9E9E',
  takeoff: '#4CAF50',
  departure: '#8BC34A',
  climb: '#03A9F4',
  cruise: '#2196F3',
  descent: '#00BCD4',
  approach: '#FF5722',
  landing: '#FF9800',
  enroute: '#2196F3',
  unknown: '#9E9E9E',
};

export const FLIGHT_CATEGORY_COLORS: Record<string, string> = {
  VFR: '#4CAF50',
  MVFR: '#2196F3',
  IFR: '#F44336',
  LIFR: '#9C27B0',
};

// ============================================
// 3D 모델 매핑
// ============================================

export const AIRCRAFT_MODEL_MAP: Record<string, string> = {
  // Airbus Wide-body
  A380: '/A380.glb',
  A388: '/A380.glb',
  A330: '/A380.glb',
  A350: '/A380.glb',
  // Boeing Wide-body
  B77W: '/b777.glb',
  B77L: '/b777.glb',
  B772: '/b777.glb',
  B773: '/b777.glb',
  B789: '/b777.glb',
  B788: '/b777.glb',
  B787: '/b777.glb',
  // Narrow-body
  B737: '/b737.glb',
  B738: '/b737.glb',
  B739: '/b737.glb',
  B38M: '/b737.glb',
  B39M: '/b737.glb',
  A320: '/b737.glb',
  A321: '/b737.glb',
  A319: '/b737.glb',
  A20N: '/b737.glb',
  A21N: '/b737.glb',
  // Helicopters
  H145: '/helicopter.glb',
  H155: '/helicopter.glb',
  H160: '/helicopter.glb',
  EC35: '/helicopter.glb',
  EC45: '/helicopter.glb',
  EC55: '/helicopter.glb',
  S76: '/helicopter.glb',
  AS65: '/helicopter.glb',
  B412: '/helicopter.glb',
  // Defaults
  default_heli: '/helicopter.glb',
  default_jet: '/b737.glb',
  default: '/b737.glb',
};

// ============================================
// 절차 차트
// ============================================

export const PROCEDURE_CHARTS = {
  sid_rwy18_rnav: { name: 'RNAV SID', file: '/charts/sid_rwy18_rnav.png', runway: '18', type: 'SID' },
  sid_rwy18_conv: { name: 'Conventional SID', file: '/charts/sid_rwy18_conv.png', runway: '18', type: 'SID' },
  star_rwy18: { name: 'STAR', file: '/charts/star_rwy18.png', runway: '18', type: 'STAR' },
  apch_rnp_y_rwy18: { name: 'RNP Y', file: '/charts/apch_rnp_y_rwy18.png', runway: '18', type: 'APCH' },
  apch_rnp_z_rwy18: { name: 'RNP Z (AR)', file: '/charts/apch_rnp_z_rwy18.png', runway: '18', type: 'APCH' },
  apch_vor_rwy18: { name: 'VOR', file: '/charts/apch_vor_rwy18.png', runway: '18', type: 'APCH' },
  sid_rwy36_rnav: { name: 'RNAV SID', file: '/charts/sid_rwy36_rnav.png', runway: '36', type: 'SID' },
  sid_rwy36_conv: { name: 'Conventional SID', file: '/charts/sid_rwy36_conv.png', runway: '36', type: 'SID' },
  star_rwy36: { name: 'STAR', file: '/charts/star_rwy36.png', runway: '36', type: 'STAR' },
  apch_ils_y_rwy36: { name: 'ILS Y', file: '/charts/apch_ils_y_rwy36.png', runway: '36', type: 'APCH' },
  apch_ils_z_rwy36: { name: 'ILS Z', file: '/charts/apch_ils_z_rwy36.png', runway: '36', type: 'APCH' },
  apch_rnp_rwy36: { name: 'RNP', file: '/charts/apch_rnp_rwy36.png', runway: '36', type: 'APCH' },
  apch_vor_rwy36: { name: 'VOR', file: '/charts/apch_vor_rwy36.png', runway: '36', type: 'APCH' },
} as const;

// ============================================
// 항공사 코드 변환
// ============================================

export const ICAO_TO_IATA: Record<string, string> = {
  KAL: 'KE', // 대한항공
  AAR: 'OZ', // 아시아나
  JNA: 'LJ', // 진에어
  JJA: '7C', // 제주항공
  TWB: 'TW', // 티웨이
  ABL: 'BX', // 에어부산
  EOK: 'ZE', // 이스타
  ASV: 'RF', // 에어서울
  ANA: 'NH',
  JAL: 'JL',
  CPA: 'CX',
  CSN: 'CZ',
  CES: 'MU',
  CCA: 'CA',
  HVN: 'VN',
  THA: 'TG',
  SIA: 'SQ',
  MAS: 'MH',
  EVA: 'BR',
  CAL: 'CI',
  UAL: 'UA',
  AAL: 'AA',
  DAL: 'DL',
  AFR: 'AF',
  BAW: 'BA',
  DLH: 'LH',
  KLM: 'KL',
  QFA: 'QF',
  UAE: 'EK',
  ETD: 'EY',
  FDX: 'FX',
  UPS: '5X',
  GTI: 'GT',
};
