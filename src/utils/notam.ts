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

// ============================================================================
// NOTAM 한국어 해석기 — interpretNotam(notam) → 사람이 읽기 쉬운 구조화 해석
// ============================================================================

/** Q-Code 4글자 코드 → 한국어 의미 (자주 쓰이는 50여 개) */
const QCODE_KO: Record<string, string> = {
  // Movement Area
  QMRLC: '활주로 폐쇄', QMRLT: '활주로 제한', QMRMT: '활주로 정비',
  QMRHW: '활주로 위해요인', QMRWX: '활주로 미상',
  QMXLC: '유도로 폐쇄', QMXLT: '유도로 제한', QMXCN: '유도로 변경/취소',
  QMAHW: '계류장 위해요인', QMAHC: '계류장 변경',
  // Lighting
  QLALC: '진입등 정전/폐쇄', QLAAS: '진입등 작동중',
  QLLCS: '활주로 등화 변경',
  // NAV / COM
  QICAS: 'ILS 작동 가능', QICAU: 'ILS 운용 중지',
  QICCH: 'ILS 변경', QICTT: 'ILS 시험중',
  QCAAS: '관제 주파수 작동', QCAXX: '관제 무선 미정',
  // Airspace
  QRPCA: '금지구역 활성', QRRCA: '제한구역 활성', QRDCA: '위험구역 활성',
  QRTCA: '훈련공역 활성',
  // Obstacles / Hazards
  QOBCE: '장애물 설치', QOBCN: '장애물 변경/취소', QOLCE: '장애물 등화 설치',
  QWMLW: '레이저쇼/공연 (임시 항행 경고)', QWPLW: '낙하산 강하 활성',
  QWULW: '무인항공기 활동', QWELW: '훈련 비행 활동',
  // Snow / Weather
  QFAHX: '공항 위해요인', QFASW: '공항 변경 (snow)',
  // Personnel / Service
  QSAAS: 'ATS 사용 가능', QSACA: 'ATS 변경/취소',
  QSPCH: '자료 변경', QSPCF: '드론 활동',
  // Other
  QFASZ: '공항 정상화', QPMCH: '절차 변경',
  QPMXX: '절차 미상', QPDCH: '비행 절차 변경', QPIXX: '계기절차 미상',
  QGAXX: 'GNSS/위성 미상', QGWXX: 'GNSS 미상',
  QPALL: 'ATS 정상화', QKKKK: '기타',
};

/** 자주 쓰이는 약어 → 한국어 풀이 */
const ABBR_KO: Array<[RegExp, string]> = [
  [/U\/S/g, '운용 중지'],
  [/CLSD/g, '폐쇄'],
  [/DUE TO/g, '사유:'],
  [/MAINT/gi, '정비'],
  [/WIP/g, '공사'],
  [/RWY/g, '활주로'],
  [/TWY/g, '유도로'],
  [/APN?/g, '계류장'],
  [/PAR/g, 'PAR(정밀진입레이더)'],
  [/TAR/g, 'TAR(터미널레이더)'],
  [/ILS/g, 'ILS(계기착륙시스템)'],
  [/VOR/g, 'VOR'],
  [/NDB/g, 'NDB'],
  [/DME/g, 'DME'],
  [/MHZ/gi, 'MHz'],
  [/DRONE ACT/gi, '드론 활동'],
  [/ACFT/g, '항공기'],
  [/STAND NR/g, '계류구역'],
  [/AVBL/g, '사용가능'],
  [/NAVAID/gi, '항행안전시설'],
  [/TEMP OBST/gi, '임시 장애물'],
  [/CRANE/gi, '크레인'],
  [/ERECTED/gi, '설치됨'],
  [/AS FLW/gi, '아래와 같이'],
  [/LASER LIGHT SHOW/gi, '레이저쇼'],
  [/WILL TAKE PLACE/gi, '예정'],
  [/AEROBATICS/gi, '곡예비행'],
  [/FLT AREA/gi, '비행 구역'],
  [/WI A RADIUS OF/gi, '반경'],
  [/CENTERED ON/gi, '중심'],
  [/NAV WRNG/gi, '항행경고'],
];

export interface NotamInterpretation {
  /** "어디" — 위치 + 공항 한글명 */
  where: string;
  /** "언제" — 시작/종료 KST 포맷 */
  when: string;
  /** "무엇" — 제한/내용 한국어 요약 */
  what: string;
  /** 한 줄 요약 (제목 형태) */
  summary: string;
  /** 추가 메타 (qcode 한국어, 고도, 반경 등) */
  meta: { qcode_ko: string; altitude: string; radius: string; type: string };
}

interface NotamForInterpret {
  notam_number?: string;
  location?: string;
  fir?: string;
  qcode?: string;
  qcode_mean?: string;
  e_text?: string;
  full_text?: string;
  effective_start?: string;
  effective_end?: string;
  q_lower_alt?: number;
  q_upper_alt?: number;
  q_radius_nm?: number;
}

function fmtNotamTime(t: string | undefined | null): string {
  if (!t) return '-';
  if (t === 'PERM' || t.toUpperCase().includes('PERM')) return '영구';
  // YYMMDDHHMM (UTC) → KST 변환
  const m = String(t).match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const yy = m[1]!, mo = m[2]!, dd = m[3]!, hh = m[4]!, mi = m[5]!;
    const dt = new Date(Date.UTC(2000 + +yy, +mo - 1, +dd, +hh, +mi));
    if (isNaN(dt.getTime())) return t;
    // KST = UTC+9
    const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
    const Y = kst.getUTCFullYear();
    const M = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const D = String(kst.getUTCDate()).padStart(2, '0');
    const H = String(kst.getUTCHours()).padStart(2, '0');
    const I = String(kst.getUTCMinutes()).padStart(2, '0');
    return `${Y}-${M}-${D} ${H}:${I} KST`;
  }
  // ISO 8601
  const dt = new Date(t);
  if (!isNaN(dt.getTime())) {
    const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 16).replace('T', ' ') + ' KST';
  }
  return t;
}

function translateAbbr(s: string): string {
  let out = s || '';
  for (const [re, ko] of ABBR_KO) {
    out = out.replace(re, ko);
  }
  return out;
}

/**
 * NOTAM을 한국어로 해석. 어디/언제/무엇 + 메타 정보.
 */
export function interpretNotam(
  notam: NotamForInterpret,
  airportName?: (loc: string) => string | undefined,
): NotamInterpretation {
  const loc = notam.location || '';
  const fir = notam.fir || '';
  const apName = airportName?.(loc);

  // 어디
  const where = apName ? `${apName} (${loc})${fir ? ' · ' + fir : ''}`
                       : loc + (fir ? ' · ' + fir : '');

  // 언제 (한국시간)
  const start = fmtNotamTime(notam.effective_start);
  const end = fmtNotamTime(notam.effective_end);
  const when = end === '영구' ? `${start} 부터 (영구)` : `${start} ~ ${end}`;

  // 무엇 (e_text 한국어 풀이)
  const eText = (notam.e_text || '').trim();
  const what = translateAbbr(eText) || (notam.qcode_mean || '내용 정보 없음');

  // qcode 한국어
  const qcodeKey = (notam.qcode || '').toUpperCase();
  const qcodeKo = QCODE_KO[qcodeKey] || notam.qcode_mean || qcodeKey || '-';

  // 고도 (FL 단위)
  const flLow = notam.q_lower_alt;
  const flUp = notam.q_upper_alt;
  let altitude = '-';
  if (typeof flLow === 'number' && typeof flUp === 'number') {
    altitude = `FL${String(flLow).padStart(3, '0')} ~ FL${String(flUp).padStart(3, '0')}`;
  }

  // 반경
  const r = notam.q_radius_nm;
  const radius = typeof r === 'number' ? `반경 ${r} NM` : '-';

  // 타입 (NOTAMN/R/C)
  const t = (notam.full_text || '').match(/NOTAM([NRC])/);
  const type = t ? (t[1] === 'C' ? '취소(NOTAMC)'
                  : t[1] === 'R' ? '대체(NOTAMR)'
                  : '신규(NOTAMN)') : '-';

  // 한 줄 요약: "{공항} · {qcode_ko} · {기간 요약}"
  const briefWhen = end === '영구' ? '영구' : `${start.slice(5,16)}~${end.slice(5,16)}`;
  const summary = `${apName || loc} · ${qcodeKo} · ${briefWhen}`;

  return { where, when, what, summary, meta: { qcode_ko: qcodeKo, altitude, radius, type } };
}
