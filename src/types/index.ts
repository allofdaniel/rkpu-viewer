/**
 * RKPU-Viewer 공통 타입 정의
 * DO-278A AL4 요구사항 추적: SRS-TYPE-001
 */

// ============================================
// 기본 좌표 타입
// ============================================

export interface Coordinate {
  lat: number;
  lon: number;
}

export interface Coordinate3D extends Coordinate {
  altitude?: number; // meters
  altitude_ft?: number;
}

export interface GeoPoint {
  longitude: number;
  latitude: number;
  altitude?: number;
}

// ============================================
// 항공기 관련 타입
// ============================================

export type FlightPhase =
  | 'ground'
  | 'takeoff'
  | 'departure'
  | 'climb'
  | 'cruise'
  | 'descent'
  | 'approach'
  | 'landing'
  | 'enroute'
  | 'unknown';

export type AircraftCategory = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7';

export interface AircraftPosition {
  hex: string;
  callsign?: string;
  lat: number;
  lon: number;
  altitude_ft?: number;
  altitude_baro?: number; // barometric altitude in feet
  altitude_geom?: number; // geometric altitude in feet
  ground_speed?: number; // knots
  gs?: number; // alias for ground_speed
  track?: number; // degrees
  vertical_rate?: number; // ft/min
  baro_rate?: number; // barometric rate ft/min
  on_ground?: boolean;
  timestamp?: number;
  seen?: number;
  seen_pos?: number;
  category?: AircraftCategory;
  flight?: string;
  r?: string; // registration
  t?: string; // aircraft type
}

export interface AircraftDetails {
  hex: string;
  registration?: string;
  type?: string; // ICAO aircraft type code
  operator?: string;
  owner?: string;
  manufacturerSerialNumber?: string;
  yearBuilt?: string;
  country?: string;
}

export interface AircraftTrailPoint {
  lat: number;
  lon: number;
  altitude?: number;
  altitude_ft?: number;
  timestamp: number;
  ground_speed?: number;
  track?: number;
}

// ============================================
// 기상 관련 타입
// ============================================

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

export type WeatherRiskLevel = 'low' | 'moderate' | 'high' | 'severe';

export interface WeatherRiskAssessment {
  level: WeatherRiskLevel;
  factors: string[];
}

export interface MetarData {
  icaoId: string;
  icao?: string; // alias
  obsTime: string | Date;
  temp?: number;
  temperature?: number; // alias
  dewp?: number;
  dewpoint?: number; // alias
  humidity?: number;
  altim?: number;
  altimeter?: number; // alias
  wdir?: number;
  windDirection?: number; // alias
  wspd?: number;
  windSpeed?: number; // alias
  wgst?: number;
  windGust?: number; // alias
  visib?: number;
  visibility?: number; // alias in statute miles
  ceiling?: number;
  fltCat: FlightCategory;
  flightCategory?: FlightCategory; // alias
  rawOb?: string;
  rawMetar?: string; // alias
  source?: string;
  leftRvr?: number;
  rightRvr?: number;
  presentWeather?: string;
  clouds?: CloudLayer[];
}

export interface TafData {
  icaoId: string;
  rawTAF: string;
  rawTaf?: string; // alias
  validTimeFrom: string;
  validTimeTo: string;
  forecasts?: TafForecast[];
  issueTime?: string | Date;
}

export interface TafForecast {
  timeFrom: string;
  timeTo: string;
  changeIndicator?: string;
  wdir?: number;
  wspd?: number;
  visibility?: number;
  weather?: string;
  clouds?: CloudLayer[];
}

export interface CloudLayer {
  cover: string;
  base?: number;
  type?: string;
}

export interface SigmetData {
  id?: string;
  type: 'SIGMET' | 'TURBULENCE' | 'ICING' | 'THUNDERSTORM' | 'VOLCANIC_ASH' | 'SEVERE_TURBULENCE' | 'OTHER';
  hazard?: string;
  raw: string;
  validFrom?: string;
  validTo?: string;
  coords?: Coordinate[];
  polygon?: Coordinate[];
}

export interface LightningStrike {
  lat: number;
  lon: number;
  time: string;
  amplitude?: number;
  type?: 'CG' | 'IC'; // Cloud-to-Ground or Intra-Cloud
}

export interface UpperWindData {
  level: number; // hPa
  altitude_ft: number;
  direction: number;
  speed: number; // knots
  temperature?: number;
}

export interface WeatherInfo {
  metar?: MetarData;
  taf?: TafData;
  sigmets: SigmetData[];
  lightning: LightningStrike[];
  lastUpdated: Date;
}

// ============================================
// GIS 관련 타입
// ============================================

export interface Waypoint {
  id?: string;
  ident: string;
  name?: string;
  lat: number;
  lon: number;
  type: 'waypoint' | 'navaid' | 'airport';
  altitude_ft?: number;
}

export interface Navaid extends Waypoint {
  navaidType: 'VOR' | 'DME' | 'VORTAC' | 'TACAN' | 'NDB';
  frequency?: string;
  channel?: string;
}

export interface NavaidInfo extends Waypoint {
  navaidType: 'VOR' | 'DME' | 'VORTAC' | 'TACAN' | 'NDB';
  frequency?: string;
  channel?: string;
}

export interface Route {
  name: string;
  type: 'ATS' | 'RNAV' | 'OTHER';
  points: Waypoint[];
  upperLimit?: string;
  lowerLimit?: string;
}

export interface Airspace {
  id?: string;
  name: string;
  type: AirspaceType;
  category?: string;
  floorFt?: number;
  ceilingFt?: number;
  lowerLimit?: number; // alias for floorFt
  upperLimit?: number; // alias for ceilingFt
  coordinates?: Coordinate[];
  polygon?: Coordinate[];
  activeTime?: string;
  remarks?: string;
}

export type AirspaceType =
  | 'CTR'
  | 'TMA'
  | 'ACC'
  | 'FIR'
  | 'P' // Prohibited
  | 'R' // Restricted
  | 'D' // Danger
  | 'MOA'
  | 'ADIZ';

// ============================================
// 절차 관련 타입
// ============================================

export type ProcedureType = 'SID' | 'STAR' | 'APPROACH';

export interface FlightProcedure {
  name: string;
  displayName: string;
  type: ProcedureType;
  runway: string;
  segments: ProcedureSegment[];
}

export interface ProcedureSegment {
  name: string;
  coordinates: Coordinate3D[];
  type?: 'initial' | 'intermediate' | 'final' | 'missed';
}

// ============================================
// NOTAM 관련 타입
// ============================================

export type NotamType = 'N' | 'R' | 'C' | 'NOTAM' | 'NOTAMN' | 'NOTAMR' | 'NOTAMC'; // New, Replace, Cancel

export type NotamValidity = 'active' | 'future' | 'expired' | 'cancelled';

export type NotamCategory = 'RWY_CLOSED' | 'TWY_CLOSED' | 'NAV_OUTAGE' | 'AIRSPACE' | 'GENERAL';

export interface Notam {
  id: string;
  number?: string;
  location?: string;
  type: NotamType;
  effectiveStart?: Date;
  effectiveEnd?: Date;
  fullText: string;
  qLine?: NotamQLine;
  isPermanent?: boolean;
  isActive?: boolean;
  cancelled?: boolean;
}

export interface NotamQLine {
  fir: string;
  code: string;
  traffic: string;
  purpose: string;
  scope: string;
  lowerAlt: number;
  upperAlt: number;
  lowerLimit?: number; // alias
  upperLimit?: number; // alias
  lat?: number;
  lon?: number;
  radiusNM?: number;
  radius?: number; // alias
}

// ============================================
// 공항 정보 타입
// ============================================

export type AirportType = 'hub' | 'general' | 'private' | 'military' | 'fir';

export interface Airport {
  icao: string;
  iata?: string;
  name: string;
  nameKr?: string;
  country: string;
  type: AirportType;
  lat: number;
  lon: number;
  elevation_ft?: number;
  timezone?: string;
  note?: string;
}

// ============================================
// API 응답 타입
// ============================================

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  timestamp: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================
// 설정 타입
// ============================================

export interface MapConfig {
  center: Coordinate;
  zoom: number;
  pitch: number;
  bearing: number;
  style: MapStyle;
}

export type MapStyle = 'dark' | 'light' | 'satellite' | 'radar';

export interface DisplaySettings {
  showWaypoints: boolean;
  showObstacles: boolean;
  showAirspace: boolean;
  showTerrain: boolean;
  show3DAltitude: boolean;
  showAircraft: boolean;
  showAircraftTrails: boolean;
  show3DAircraft: boolean;
}

export interface TrailSettings {
  duration: number; // milliseconds
  headingPrediction: number; // seconds
  color: string;
}
