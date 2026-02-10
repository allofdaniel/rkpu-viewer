/**
 * Utils Index
 * 유틸리티 함수 모음 인덱스
 */

// Geometry utilities
export {
  ftToM,
  mToFt,
  nmToM,
  mToNm,
  createCirclePolygon,
  createObstacleShape,
  createRibbonSegment,
  calculateDistance,
  calculateBearing,
  isPointInPolygon,
} from './geometry';

export type {
  Coordinate,
  Coordinate3D,
  PolygonCoordinates,
  Obstacle,
  RibbonSegment,
} from './geometry';

// Coordinate utilities
export {
  formatAviationCoord,
  formatDMS,
  parseAviationCoord,
} from './coordinates';

// Color utilities
export {
  generateColor,
  altitudeToColor,
  altitudeToColorHex,
  getAircraftColor,
  getProcedureColor,
  AIRCRAFT_CATEGORY_COLORS,
  AIRCRAFT_COLORS,
  OBSTACLE_COLORS,
  FLIGHT_PHASE_COLORS,
  FLIGHT_CATEGORY_COLORS,
} from './colors';

// Format utilities
export {
  formatUTC,
  formatKST,
  formatDate,
  formatTime,
  formatAltitude,
  formatSpeed,
  formatDistanceNM,
  formatCallsign,
  icaoToIata,
  extractAirlineCode,
  parseMetarTime,
  parseNotamDateString,
  formatRelativeTime,
  formatCacheAge,
  ICAO_TO_IATA,
} from './format';

// Flight utilities
export {
  detectFlightPhase,
  detectCurrentAirspace,
  findNearestWaypoints,
  detectCurrentProcedure,
} from './flight';

export type {
  Aircraft,
  AirportData,
  FlightPhase,
  Sector,
  AtcSectors,
  Waypoint,
  NearestWaypoint,
  ProcedureSegment,
  Procedure,
  Procedures,
  DetectedProcedure,
} from './flight';

// NOTAM utilities
export {
  parseNotamCoordinates,
  getNotamDisplayCoords,
  getNotamType,
  getCancelledNotamRef,
  extractDatesFromFullText,
  getNotamValidity,
  isNotamActive,
  isNotamInPeriod,
  buildCancelledNotamSet,
  createNotamCircle,
} from './notam';

export type {
  NotamCoordinates,
  Notam,
  NotamValidity,
} from './notam';

// Weather utilities
export {
  parseMetar,
  formatUTC as formatWeatherUTC,
  formatKST as formatWeatherKST,
} from './weather';

export { parseMetarTime as parseWeatherMetarTime } from './weather';

export type {
  MetarData,
  ParsedMetar,
} from './weather';

// Fetch utilities
export {
  fetchWithTimeout,
  fetchJson,
  fetchWithRetry,
} from './fetch';

// Sanitization utilities
export {
  escapeHtml,
  stripHtml,
  sanitizeCallsign,
  sanitizeNumeric,
  isSafeUrl,
  sanitizeUrl,
} from './sanitize';

// Logging utilities
export {
  logger,
  LogLevel,
  ErrorSeverity,
  withTiming,
  measureAsync,
} from './logger';

export type { LogEntry, LoggerOptions } from './logger';
