/**
 * NOTAM Utility Functions
 * NOTAM 관련 유틸리티 함수 모음
 */

import { parseNotamDateString } from './format';
import { AIRPORT_COORDINATES } from '../constants/airports';

export interface NotamCoordinates {
  lat: number;
  lon: number;
  radiusNM: number;
  lowerAlt: number;
  upperAlt: number;
}

export interface Notam {
  notam_number?: string;
  full_text?: string;
  location?: string;
  effective_start?: string;
  effective_end?: string;
  [key: string]: unknown;
}

export type NotamValidity = 'active' | 'future' | false;

/**
 * NOTAM Q-line 좌표 파싱
 * 유효성 검증 포함
 */
export const parseNotamCoordinates = (fullText: string | null | undefined): NotamCoordinates | null => {
  if (!fullText) return null;
  // Q-line format: Q) FIR/QCODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORD
  const qLineMatch = fullText.match(/Q\)\s*\S+\/\S+\/\S+\/\S+\/\S+\/(\d{3})\/(\d{3})\/(\d{4})([NS])(\d{5})([EW])(\d{3})/);
  if (!qLineMatch || qLineMatch.length < 8) return null;

  const [, lowerAlt, upperAlt, latDeg, latDir, lonDeg, lonDir, radiusNM] = qLineMatch;

  // 입력 유효성 검증
  if (!latDeg || latDeg.length !== 4) return null;
  if (!lonDeg || lonDeg.length !== 5) return null;

  // Parse latitude: DDMM format
  const latDegrees = parseInt(latDeg.substring(0, 2), 10);
  const latMinutes = parseInt(latDeg.substring(2, 4), 10);

  // 위도 유효성 검증
  if (isNaN(latDegrees) || isNaN(latMinutes)) return null;
  if (latDegrees < 0 || latDegrees > 90) return null;
  if (latMinutes < 0 || latMinutes >= 60) return null;

  let lat = latDegrees + latMinutes / 60;
  if (latDir === 'S') lat = -lat;

  // Parse longitude: DDDMM format
  const lonDegrees = parseInt(lonDeg.substring(0, 3), 10);
  const lonMinutes = parseInt(lonDeg.substring(3, 5), 10);

  // 경도 유효성 검증
  if (isNaN(lonDegrees) || isNaN(lonMinutes)) return null;
  if (lonDegrees < 0 || lonDegrees > 180) return null;
  if (lonMinutes < 0 || lonMinutes >= 60) return null;

  let lon = lonDegrees + lonMinutes / 60;
  if (lonDir === 'W') lon = -lon;

  const radius = parseInt(radiusNM ?? '0', 10);
  const lower = parseInt(lowerAlt ?? '0', 10);
  const upper = parseInt(upperAlt ?? '0', 10);

  // 최종 유효성 검증
  if (isNaN(radius) || isNaN(lower) || isNaN(upper)) return null;

  return {
    lat,
    lon,
    radiusNM: radius,
    lowerAlt: lower * 100, // FL to feet
    upperAlt: upper * 100,
  };
};

/**
 * NOTAM 표시 좌표 가져오기
 * Q-line 우선, 직접 좌표 필드, 없으면 공항 좌표 사용
 */
export const getNotamDisplayCoords = (notam: Notam): NotamCoordinates | null => {
  // First try to parse from Q-line
  const qCoords = parseNotamCoordinates(notam.full_text);
  if (qCoords) return qCoords;

  // Check for direct q_lat/q_lon fields (from local demo data)
  const qLat = notam.q_lat as number | undefined;
  const qLon = notam.q_lon as number | undefined;
  if (qLat !== undefined && qLon !== undefined) {
    return {
      lat: qLat,
      lon: qLon,
      radiusNM: (notam.q_radius as number) || 5,
      lowerAlt: 0,
      upperAlt: 5000,
    };
  }

  // Fallback: use airport coordinates from database
  const airportCoords = notam.location ? AIRPORT_COORDINATES[notam.location] : null;
  if (airportCoords) {
    return {
      lat: airportCoords.lat,
      lon: airportCoords.lon,
      radiusNM: 5, // Default 5 NM radius for airport NOTAMs
      lowerAlt: 0,
      upperAlt: 5000, // Default 5000 ft
    };
  }

  return null;
};

/**
 * NOTAM 타입 파싱 (N=New, R=Replace, C=Cancel)
 * 헤더 부분에서만 검색하여 본문 오탐 방지
 */
export const getNotamType = (fullText: string | null | undefined): 'N' | 'R' | 'C' => {
  if (!fullText) return 'N';
  // NOTAM 헤더는 보통 처음 200자 이내에 있음
  const header = fullText.substring(0, 200);
  // 정확한 패턴 매칭: NOTAMN, NOTAMR, NOTAMC 뒤에 공백이나 줄바꿈이 옴
  if (/NOTAMC[\s\n]/.test(header)) return 'C'; // Cancel
  if (/NOTAMR[\s\n]/.test(header)) return 'R'; // Replace
  // includes도 헤더에서만 확인 (fallback)
  if (header.includes('NOTAMC')) return 'C';
  if (header.includes('NOTAMR')) return 'R';
  return 'N'; // New - default
};

/**
 * 취소/교체된 NOTAM 참조 추출
 */
export const getCancelledNotamRef = (fullText: string | null | undefined): string | null => {
  if (!fullText) return null;
  // Pattern: NOTAMC or NOTAMR followed by the reference (e.g., "NOTAMC A1045/24")
  const match = fullText.match(/NOTAM[CR]\s+([A-Z]\d{4}\/\d{2})/);
  return match?.[1] ?? null;
};

interface ExtractedDates {
  start: Date | null;
  end: Date | null;
}

/**
 * NOTAM 전문에서 시작/종료 날짜 추출
 */
export const extractDatesFromFullText = (fullText: string | null | undefined): ExtractedDates => {
  if (!fullText) return { start: null, end: null };

  // Item B: start date B) YYMMDDHHMM
  const startMatch = fullText.match(/B\)\s*(\d{10})/);
  const start = startMatch ? parseNotamDateString(startMatch[1]) : null;

  // Item C: end date C) YYMMDDHHMM or PERM or EST
  const endMatch = fullText.match(/C\)\s*(\d{10}|PERM)/);
  let end: Date | null = null;
  if (endMatch) {
    if (endMatch[1] === 'PERM') {
      end = new Date(2099, 11, 31); // Permanent = far future
    } else {
      end = parseNotamDateString(endMatch[1]);
    }
  }

  return { start, end };
};

/**
 * NOTAM 유효성 확인
 */
export const getNotamValidity = (notam: Notam, cancelledSet: Set<string> = new Set()): NotamValidity => {
  // Skip NOTAMC (cancel) type - these just cancel other NOTAMs
  const notamType = getNotamType(notam.full_text);
  if (notamType === 'C') return false;

  // Check if this NOTAM has been cancelled by another NOTAM
  if (notam.notam_number && cancelledSet.has(notam.notam_number)) return false;

  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  // Try to get dates from effective_start/effective_end fields first
  if (notam.effective_start && notam.effective_start.length >= 10) {
    startDate = parseNotamDateString(notam.effective_start);
  }

  if (notam.effective_end && notam.effective_end.length >= 10 &&
      !notam.effective_end.includes('PERM') && !notam.effective_end.includes('EST')) {
    endDate = parseNotamDateString(notam.effective_end);
  } else if (notam.effective_end?.includes('PERM')) {
    endDate = new Date(2099, 11, 31); // Permanent
  }

  // Fallback: extract dates from full_text if effective_start/end not available
  if (!startDate || !endDate) {
    const extracted = extractDatesFromFullText(notam.full_text);
    if (!startDate && extracted.start) startDate = extracted.start;
    if (!endDate && extracted.end) endDate = extracted.end;
  }

  // If still no start date, we can't determine validity - assume active to show on map
  if (!startDate) {
    // Check if there's at least some date info in full_text to avoid showing ancient NOTAMs
    if (notam.full_text && notam.full_text.includes('B)')) {
      return 'active'; // Has B) field but couldn't parse - show anyway
    }
    return false;
  }

  // Check if already expired
  if (endDate && now > endDate) return false;

  // Check if future NOTAM
  if (startDate && now < startDate) return 'future';

  // Currently active
  return 'active';
};

/**
 * NOTAM 활성 여부 확인 (하위 호환용)
 */
export const isNotamActive = (notam: Notam, cancelledSet: Set<string> = new Set()): boolean => {
  const validity = getNotamValidity(notam, cancelledSet);
  return validity === 'active' || validity === 'future';
};

/**
 * NOTAM 기간별 필터링
 * @param notam NOTAM 객체
 * @param period 기간 ('current', '1month', '1year', 'all')
 * @param cancelledSet 취소된 NOTAM Set
 * @returns 표시 여부
 */
export const isNotamInPeriod = (
  notam: Notam,
  period: string,
  cancelledSet: Set<string> = new Set()
): boolean => {
  // Skip NOTAMC (cancel) type
  const notamType = getNotamType(notam.full_text);
  if (notamType === 'C') return false;

  // Check if this NOTAM has been cancelled
  if (notam.notam_number && cancelledSet.has(notam.notam_number)) return false;

  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  // Parse dates from effective_start/effective_end
  if (notam.effective_start && notam.effective_start.length >= 10) {
    startDate = parseNotamDateString(notam.effective_start);
  }

  if (notam.effective_end && notam.effective_end.length >= 10 &&
      !notam.effective_end.includes('PERM') && !notam.effective_end.includes('EST')) {
    endDate = parseNotamDateString(notam.effective_end);
  } else if (notam.effective_end?.includes('PERM')) {
    endDate = new Date(2099, 11, 31);
  }

  // Fallback: extract from full_text
  if (!startDate || !endDate) {
    const extracted = extractDatesFromFullText(notam.full_text);
    if (!startDate && extracted.start) startDate = extracted.start;
    if (!endDate && extracted.end) endDate = extracted.end;
  }

  // 영구(Permanent) NOTAM 감지: endDate가 2099년이면 영구 NOTAM
  // Note: isPermanent used implicitly in logic below (permanent NOTAMs always shown in 'current')

  // 날짜 정보가 없는 경우 처리
  if (!startDate && !endDate) {
    // 날짜 정보 없음: 'all'에서만 표시
    return period === 'all';
  }

  // startDate만 없는 경우 (endDate는 있음)
  if (!startDate && endDate) {
    // 만료된 경우 제외
    if (now > endDate) return period === 'all';
    // 영구 또는 유효한 NOTAM: 표시
    return true;
  }

  // Period-based filtering
  switch (period) {
    case 'current': {
      // Only currently active or future NOTAMs (not expired)
      if (endDate && now > endDate) return false;
      return true;
    }
    case '1month': {
      // NOTAMs relevant within 1 month (past or future)
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const oneMonthLater = new Date(now);
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

      // If ended before 1 month ago, exclude
      if (endDate && endDate < oneMonthAgo) return false;
      // If starts after 1 month later, exclude
      if (startDate && startDate > oneMonthLater) return false;
      return true;
    }
    case '1year': {
      // NOTAMs relevant within 1 year
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const oneYearLater = new Date(now);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

      if (endDate && endDate < oneYearAgo) return false;
      if (startDate && startDate > oneYearLater) return false;
      return true;
    }
    case 'all':
    default:
      // Show all NOTAMs (including expired)
      return true;
  }
};

/**
 * 취소된 NOTAM 세트 빌드
 */
export const buildCancelledNotamSet = (notams: Notam[] | null | undefined): Set<string> => {
  const cancelledSet = new Set<string>();
  if (!notams) return cancelledSet;

  notams.forEach(n => {
    const type = getNotamType(n.full_text);
    if (type === 'C' || type === 'R') {
      const ref = getCancelledNotamRef(n.full_text);
      if (ref) cancelledSet.add(ref);
    }
  });

  return cancelledSet;
};

/**
 * NOTAM 반경 원형 폴리곤 생성
 */
export const createNotamCircle = (
  lon: number,
  lat: number,
  radiusNM: number,
  numPoints: number = 32
): [number, number][][] => {
  const coords: [number, number][] = [];
  // 1 NM = 1.852 km, convert to degrees (roughly)
  const radiusDeg = (radiusNM * 1.852) / 111.32; // approximate for latitude
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const latOffset = radiusDeg * Math.sin(angle);
    const lonOffset = (radiusDeg * Math.cos(angle)) / Math.cos(lat * Math.PI / 180);
    coords.push([lon + lonOffset, lat + latOffset]);
  }
  return [coords];
};

/**
 * DMS 좌표 하나를 decimal degrees로 변환
 * format: DDMMSS[NS] or DDDMMSS[EW]
 */
const parseDmsCoord = (dms: string, isLon: boolean): number | null => {
  const len = isLon ? 7 : 6; // DDDMMSS vs DDMMSS (direction char excluded)
  if (dms.length < len + 1) return null;
  const dir = dms.charAt(dms.length - 1);
  const numPart = dms.substring(0, dms.length - 1);

  let deg: number, min: number, sec: number;
  if (isLon) {
    deg = parseInt(numPart.substring(0, 3), 10);
    min = parseInt(numPart.substring(3, 5), 10);
    sec = parseInt(numPart.substring(5, 7), 10);
  } else {
    deg = parseInt(numPart.substring(0, 2), 10);
    min = parseInt(numPart.substring(2, 4), 10);
    sec = parseInt(numPart.substring(4, 6), 10);
  }

  if (isNaN(deg) || isNaN(min) || isNaN(sec)) return null;
  let val = deg + min / 60 + sec / 3600;
  if (dir === 'S' || dir === 'W') val = -val;
  return val;
};

/**
 * NOTAM E-text에서 다각형 좌표 추출
 * 패턴: DDMMSSN/DDDMMSSE-DDMMSSN/DDDMMSSE-... (하이픈 구분)
 * 예: 363910N1272105E-363909N1272110E-363902N1272111E-363904N1272103E-363910N1272105E
 * 줄바꿈이 좌표 중간에 들어올 수 있음
 */
export const parseNotamPolygon = (fullText: string | null | undefined): [number, number][][] | null => {
  if (!fullText) return null;

  // Normalize: remove \r\n within coordinate sequences (AIM wraps long lines)
  const normalized = fullText.replace(/\r?\n/g, '');

  // Match a chain of 3+ DMS coordinate pairs separated by hyphens
  // Each pair: DDMMSSx DDDMMSSx where x is N/S/E/W
  const polyPattern = /(\d{6}[NS]\d{7}[EW])(?:\s*-\s*(\d{6}[NS]\d{7}[EW])){2,}/g;
  const match = polyPattern.exec(normalized);
  if (!match) return null;

  // Extract the full matched string and split by hyphen
  const fullMatch = match[0];
  const coordPairs = fullMatch.split(/\s*-\s*/);

  if (coordPairs.length < 3) return null;

  const ring: [number, number][] = [];
  for (const pair of coordPairs) {
    // Split: first 6+1 chars = lat (DDMMSSN), rest = lon (DDDMMSSE)
    const latPart = pair.substring(0, 7); // e.g., 363910N
    const lonPart = pair.substring(7);     // e.g., 1272105E
    const lat = parseDmsCoord(latPart, false);
    const lon = parseDmsCoord(lonPart, true);
    if (lat === null || lon === null) return null;
    ring.push([lon, lat]);
  }

  // Close the ring if not already closed
  if (ring.length >= 3) {
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
  }

  return [ring];
};
