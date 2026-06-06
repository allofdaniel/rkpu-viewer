/**
 * Configuration Constants
 * 앱 설정 및 API 관련 상수
 */

// 환경 설정
export const IS_PRODUCTION: boolean = import.meta.env.PROD;

// Mapbox 설정 - 환경변수 필수
const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

if (!mapboxToken) {
  console.error(
    '[TBAS] VITE_MAPBOX_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.\n' +
    '.env 파일에 VITE_MAPBOX_ACCESS_TOKEN=your_token_here 형태로 설정하세요.\n' +
    'Mapbox 토큰은 https://account.mapbox.com/access-tokens/ 에서 발급받을 수 있습니다.'
  );
}

export const MAPBOX_ACCESS_TOKEN: string = mapboxToken || '';

// 항공기 업데이트 간격 (밀리초) - 429 오류 방지를 위해 15초로 설정
export const AIRCRAFT_UPDATE_INTERVAL = 5000;

// 항적 조회 중심 좌표 (한반도 중앙) - data.airport와 별도로 항적 API 전용
// 한반도 + 인근 FIR (도쿄/상해/평양/블라디보스톡) 트래픽 커버용
export const AIRCRAFT_QUERY_CENTER_LAT = 36.5;   // 한반도 중앙 위도
export const AIRCRAFT_QUERY_CENTER_LON = 127.8;  // 한반도 중앙 경도
// 항적 조회 반경 (NM). 500 NM ≈ 926 km — airplanes.live `point` 엔드포인트 최대값
// 한반도 전체 + 주변 항적 (일본 서부, 중국 동부, 동해 전역)
export const AIRCRAFT_QUERY_RADIUS_NM = 500;

// NOTAM 캐시 설정
export const NOTAM_CACHE_DURATION = 10 * 60 * 1000; // 10분

// 트레일 색상
export const TRAIL_COLOR = '#39FF14';

export interface TrailDurationOption {
  label: string;
  value: number;
}

// 트레일 지속 시간 옵션
export const TRAIL_DURATION_OPTIONS: TrailDurationOption[] = [
  { label: '1분', value: 60000 },
  { label: '5분', value: 300000 },
  { label: '10분', value: 600000 },
  { label: '30분', value: 1800000 },
  { label: '1시간', value: 3600000 },
];

// 기본 트레일 지속 시간
export const DEFAULT_TRAIL_DURATION = 300000; // 5분

/**
 * 항공기 API URL 생성
 */
export const getAircraftApiUrl = (lat: number, lon: number, radius: number = 100): string => {
  // 프로덕션: Vercel API 프록시, 로컬: Vite 프록시
  return `/api/aircraft?lat=${lat}&lon=${lon}&radius=${radius}`;
};

/**
 * 항공기 궤적 API URL 생성
 */
export const getAircraftTraceUrl = (hex: string): string => {
  // 프로덕션: Vercel API 프록시, 로컬: Vite 프록시
  return `/api/aircraft-trace?hex=${hex}`;
};

/**
 * 날씨 API URL 생성
 */
export const getWeatherApiUrl = (icao: string): string => {
  if (IS_PRODUCTION) return `/api/weather?icao=${icao}`;
  return `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
};

// 항공기 3D 모델 매핑
export const AIRCRAFT_MODEL_MAP: Record<string, string> = {
  'A380': '/A380.glb', 'A388': '/A380.glb', 'A330': '/A380.glb', 'A350': '/A380.glb',
  'B77W': '/b777.glb', 'B77L': '/b777.glb', 'B772': '/b777.glb', 'B773': '/b777.glb',
  'B789': '/b777.glb', 'B788': '/b777.glb', 'B787': '/b777.glb',
  'B737': '/b737.glb', 'B738': '/b737.glb', 'B739': '/b737.glb', 'B38M': '/b737.glb', 'B39M': '/b737.glb',
  'A320': '/b737.glb', 'A321': '/b737.glb', 'A319': '/b737.glb', 'A20N': '/b737.glb', 'A21N': '/b737.glb',
  'H145': '/helicopter.glb', 'H155': '/helicopter.glb', 'H160': '/helicopter.glb',
  'EC35': '/helicopter.glb', 'EC45': '/helicopter.glb', 'EC55': '/helicopter.glb',
  'S76': '/helicopter.glb', 'AS65': '/helicopter.glb', 'B412': '/helicopter.glb',
  'default_heli': '/helicopter.glb', 'default_jet': '/b737.glb', 'default': '/b737.glb',
};

export interface MapStyleSpec {
  version: 8;
  name: string;
  glyphs: string;
  sources: Record<string, unknown>;
  layers: Array<{
    id: string;
    type: string;
    paint: Record<string, unknown>;
  }>;
}

// 맵 스타일 설정
export const MAP_STYLES: Record<string, string | MapStyleSpec> = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/light-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  black: {
    version: 8,
    name: 'Radar Black',
    glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#000000' } }]
  }
};

export interface ProcedureChart {
  name: string;
  file: string;
  runway: string;
  type: 'SID' | 'STAR' | 'APCH';
}

// 절차 차트 정보
export const PROCEDURE_CHARTS: Record<string, ProcedureChart> = {
  'sid_rwy18_rnav': { name: 'RNAV SID', file: '/charts/sid_rwy18_rnav.png', runway: '18', type: 'SID' },
  'sid_rwy18_conv': { name: 'Conventional SID', file: '/charts/sid_rwy18_conv.png', runway: '18', type: 'SID' },
  'star_rwy18': { name: 'STAR', file: '/charts/star_rwy18.png', runway: '18', type: 'STAR' },
  'apch_rnp_y_rwy18': { name: 'RNP Y', file: '/charts/apch_rnp_y_rwy18.png', runway: '18', type: 'APCH' },
  'apch_rnp_z_rwy18': { name: 'RNP Z (AR)', file: '/charts/apch_rnp_z_rwy18.png', runway: '18', type: 'APCH' },
  'apch_vor_rwy18': { name: 'VOR', file: '/charts/apch_vor_rwy18.png', runway: '18', type: 'APCH' },
  'sid_rwy36_rnav': { name: 'RNAV SID', file: '/charts/sid_rwy36_rnav.png', runway: '36', type: 'SID' },
  'sid_rwy36_conv': { name: 'Conventional SID', file: '/charts/sid_rwy36_conv.png', runway: '36', type: 'SID' },
  'star_rwy36': { name: 'STAR', file: '/charts/star_rwy36.png', runway: '36', type: 'STAR' },
  'apch_ils_y_rwy36': { name: 'ILS Y', file: '/charts/apch_ils_y_rwy36.png', runway: '36', type: 'APCH' },
  'apch_ils_z_rwy36': { name: 'ILS Z', file: '/charts/apch_ils_z_rwy36.png', runway: '36', type: 'APCH' },
  'apch_rnp_rwy36': { name: 'RNP', file: '/charts/apch_rnp_rwy36.png', runway: '36', type: 'APCH' },
  'apch_vor_rwy36': { name: 'VOR', file: '/charts/apch_vor_rwy36.png', runway: '36', type: 'APCH' },
};
