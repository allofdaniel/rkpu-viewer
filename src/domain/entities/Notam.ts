/**
 * NOTAM Entity
 * DO-278A 요구사항 추적: SRS-NOTAM-001
 *
 * NOTAM (Notice to Airmen) 도메인 모델을 정의합니다.
 */

import type { Notam, NotamType, NotamQLine, Coordinate } from '@/types';

/**
 * NOTAM 원본 데이터 (API 응답)
 */
export interface RawNotamData {
  notam_number: string;
  location: string;
  full_text: string;
  effective_start?: string;
  effective_end?: string;
}

/**
 * NOTAM 엔티티 생성
 */
export function createNotam(raw: RawNotamData): Notam {
  const type = parseNotamType(raw.full_text);
  const qLine = parseQLine(raw.full_text);
  const dates = parseDates(raw);
  const isPermanent = raw.effective_end?.includes('PERM') || raw.full_text.includes('C) PERM');

  return {
    id: raw.notam_number,
    number: raw.notam_number,
    location: raw.location,
    type,
    effectiveStart: dates.start,
    effectiveEnd: dates.end,
    fullText: raw.full_text,
    qLine,
    isPermanent,
    isActive: checkIsActive(dates.start, dates.end, type),
  };
}

/**
 * NOTAM 타입 파싱 (N: New, R: Replace, C: Cancel)
 */
export function parseNotamType(fullText: string): NotamType {
  if (!fullText) return 'N';
  if (fullText.includes('NOTAMC')) return 'C';
  if (fullText.includes('NOTAMR')) return 'R';
  return 'N';
}

/**
 * Q-line 파싱
 * Format: Q) FIR/QCODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORD
 * Example: Q) RKRR/QFAXX/IV/NBO/A/000/999/3505N12804E005
 */
export function parseQLine(fullText: string): NotamQLine | undefined {
  if (!fullText) return undefined;

  const qLineMatch = fullText.match(
    /Q\)\s*(\w+)\/(\w+)\/(\w+)\/(\w+)\/(\w+)\/(\d{3})\/(\d{3})\/(\d{4})([NS])(\d{5})([EW])(\d{3})/
  );

  if (!qLineMatch) return undefined;

  const fir = qLineMatch[1] ?? '';
  const code = qLineMatch[2] ?? '';
  const traffic = qLineMatch[3] ?? '';
  const purpose = qLineMatch[4] ?? '';
  const scope = qLineMatch[5] ?? '';
  const lowerAlt = qLineMatch[6] ?? '0';
  const upperAlt = qLineMatch[7] ?? '0';
  const latDeg = qLineMatch[8] ?? '0000';
  const latDir = qLineMatch[9] ?? 'N';
  const lonDeg = qLineMatch[10] ?? '00000';
  const lonDir = qLineMatch[11] ?? 'E';
  const radiusNM = qLineMatch[12] ?? '0';

  // 위도 파싱 (DDMM format)
  const latDegrees = parseInt(latDeg.substring(0, 2), 10);
  const latMinutes = parseInt(latDeg.substring(2, 4), 10);
  let lat = latDegrees + latMinutes / 60;
  if (latDir === 'S') lat = -lat;

  // 경도 파싱 (DDDMM format)
  const lonDegrees = parseInt(lonDeg.substring(0, 3), 10);
  const lonMinutes = parseInt(lonDeg.substring(3, 5), 10);
  let lon = lonDegrees + lonMinutes / 60;
  if (lonDir === 'W') lon = -lon;

  return {
    fir,
    code,
    traffic,
    purpose,
    scope,
    lowerAlt: parseInt(lowerAlt, 10) * 100,
    upperAlt: parseInt(upperAlt, 10) * 100,
    lat,
    lon,
    radiusNM: parseInt(radiusNM, 10),
  };
}

/**
 * NOTAM 날짜 파싱
 */
function parseDates(raw: RawNotamData): { start: Date | undefined; end: Date | undefined } {
  let start: Date | undefined;
  let end: Date | undefined;

  // effective_start/end 필드 우선
  if (raw.effective_start) {
    start = parseNotamDateString(raw.effective_start);
  }

  if (raw.effective_end && !raw.effective_end.includes('PERM') && !raw.effective_end.includes('EST')) {
    end = parseNotamDateString(raw.effective_end);
  } else if (raw.effective_end?.includes('PERM')) {
    end = new Date(2099, 11, 31);
  }

  // full_text에서 추출 시도
  if (!start || !end) {
    const extracted = extractDatesFromFullText(raw.full_text);
    if (!start && extracted.start) start = extracted.start;
    if (!end && extracted.end) end = extracted.end;
  }

  return { start, end };
}

/**
 * NOTAM 날짜 문자열 파싱 (YYMMDDHHMM format)
 */
export function parseNotamDateString(dateStr: string): Date | undefined {
  if (!dateStr || dateStr.length < 10) return undefined;

  const year = 2000 + parseInt(dateStr.substring(0, 2), 10);
  const month = parseInt(dateStr.substring(2, 4), 10) - 1;
  const day = parseInt(dateStr.substring(4, 6), 10);
  const hour = parseInt(dateStr.substring(6, 8), 10);
  const minute = parseInt(dateStr.substring(8, 10), 10);

  return new Date(Date.UTC(year, month, day, hour, minute));
}

/**
 * full_text에서 B), C) 항목으로 날짜 추출
 */
function extractDatesFromFullText(fullText: string): { start: Date | undefined; end: Date | undefined } {
  let start: Date | undefined;
  let end: Date | undefined;

  // Item B: 시작 날짜
  const startMatch = fullText.match(/B\)\s*(\d{10})/);
  if (startMatch && startMatch[1]) {
    start = parseNotamDateString(startMatch[1]);
  }

  // Item C: 종료 날짜
  const endMatch = fullText.match(/C\)\s*(\d{10}|PERM)/);
  if (endMatch && endMatch[1]) {
    if (endMatch[1] === 'PERM') {
      end = new Date(2099, 11, 31);
    } else {
      end = parseNotamDateString(endMatch[1]);
    }
  }

  return { start, end };
}

/**
 * NOTAM 활성 상태 확인
 */
function checkIsActive(_start: Date | undefined, end: Date | undefined, type: NotamType): boolean {
  if (type === 'C') return false; // Cancel type은 항상 비활성

  const now = new Date();

  // 종료일이 과거면 비활성
  if (end && now > end) return false;

  // 시작일이 미래면 비활성 (하지만 표시는 함)
  // 여기서는 활성으로 처리하고, getNotamValidity에서 구분
  return true;
}

/**
 * NOTAM 유효성 상태 반환
 */
export function getNotamValidity(
  notam: Notam
): 'active' | 'future' | 'expired' | 'cancelled' {
  if (notam.type === 'C') return 'cancelled';

  const now = new Date();

  if (notam.effectiveEnd && now > notam.effectiveEnd) return 'expired';
  if (notam.effectiveStart && now < notam.effectiveStart) return 'future';

  return 'active';
}

/**
 * 취소된 NOTAM 참조 추출
 * Example: "A1081/24 NOTAMC A1045/24" → "A1045/24"
 */
export function getCancelledNotamRef(fullText: string): string | null {
  const match = fullText.match(/NOTAM[CR]\s+([A-Z]\d{4}\/\d{2})/);
  return match && match[1] ? match[1] : null;
}

/**
 * 취소된 NOTAM 번호 집합 생성
 */
export function buildCancelledNotamSet(notams: Notam[]): Set<string> {
  const cancelledSet = new Set<string>();

  for (const notam of notams) {
    if (notam.type === 'C' || notam.type === 'R') {
      const ref = getCancelledNotamRef(notam.fullText);
      if (ref) cancelledSet.add(ref);
    }
  }

  return cancelledSet;
}

/**
 * 활성 NOTAM만 필터링
 */
export function filterActiveNotams(notams: Notam[]): Notam[] {
  const cancelledSet = buildCancelledNotamSet(notams);

  return notams.filter((notam) => {
    // Cancel 타입은 제외
    if (notam.type === 'C') return false;

    // 다른 NOTAM에 의해 취소된 경우 제외
    if (notam.number && cancelledSet.has(notam.number)) return false;

    // 만료된 경우 제외
    const validity = getNotamValidity(notam);
    return validity === 'active' || validity === 'future';
  });
}

/**
 * NOTAM 좌표 반환 (Q-line 또는 공항 좌표)
 */
export function getNotamCoordinates(
  notam: Notam,
  airportCoordinates: Record<string, Coordinate>
): { lat: number; lon: number; radiusNM: number } | null {
  // Q-line에서 좌표 추출
  if (notam.qLine?.lat && notam.qLine?.lon) {
    return {
      lat: notam.qLine.lat,
      lon: notam.qLine.lon,
      radiusNM: notam.qLine.radiusNM || 5,
    };
  }

  // 공항 좌표 fallback
  const location = notam.location ?? '';
  const airportCoord = airportCoordinates[location];
  if (airportCoord) {
    return {
      lat: airportCoord.lat,
      lon: airportCoord.lon,
      radiusNM: 5,
    };
  }

  return null;
}

/**
 * NOTAM 유효성별 색상 반환
 */
export function getNotamValidityColor(validity: ReturnType<typeof getNotamValidity>): string {
  const colors = {
    active: '#F44336',
    future: '#FF9800',
    expired: '#9E9E9E',
    cancelled: '#607D8B',
  };
  return colors[validity];
}

/**
 * NOTAM Q-코드로 카테고리 분류
 */
export function categorizeNotam(qCode: string): {
  category: string;
  severity: 'low' | 'medium' | 'high';
} {
  if (!qCode) return { category: '기타', severity: 'low' };

  const firstChar = qCode.charAt(0);
  const secondChar = qCode.charAt(1);

  // 공항 시설 관련
  if (firstChar === 'F') {
    if (secondChar === 'A') return { category: '공항시설', severity: 'medium' };
    if (secondChar === 'L') return { category: '조명시설', severity: 'medium' };
    if (secondChar === 'N') return { category: '항행안전시설', severity: 'high' };
  }

  // 항공로 관련
  if (firstChar === 'L') {
    if (secondChar === 'A') return { category: '항공로', severity: 'medium' };
    if (secondChar === 'C') return { category: '관제', severity: 'high' };
  }

  // 공역 관련
  if (firstChar === 'R') {
    return { category: '제한공역', severity: 'high' };
  }

  // 활주로 관련
  if (firstChar === 'M') {
    if (secondChar === 'R') return { category: '활주로', severity: 'high' };
    if (secondChar === 'T') return { category: '유도로', severity: 'medium' };
  }

  // 경고
  if (firstChar === 'W') {
    return { category: '경고', severity: 'high' };
  }

  return { category: '기타', severity: 'low' };
}

/**
 * NOTAM 남은 유효 시간 계산 (시간)
 */
export function getNotamRemainingHours(notam: Notam): number | null {
  if (!notam.effectiveEnd || notam.isPermanent) return null;

  const now = new Date();
  const diff = notam.effectiveEnd.getTime() - now.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60)));
}

/**
 * NOTAM 타입 분류 (Q-code 기반)
 */
export function getNotamType(qCode: string): 'RWY_CLOSED' | 'TWY_CLOSED' | 'NAV_OUTAGE' | 'AIRSPACE' | 'GENERAL' {
  if (!qCode) return 'GENERAL';

  // 활주로 관련
  if (qCode.startsWith('QMRL') || qCode.startsWith('QMR')) return 'RWY_CLOSED';

  // 유도로 관련
  if (qCode.startsWith('QMXL') || qCode.startsWith('QMX')) return 'TWY_CLOSED';

  // 항행 시설 관련
  if (qCode.startsWith('QNV') || qCode.startsWith('QN')) return 'NAV_OUTAGE';

  // 공역 관련
  if (qCode.startsWith('QRT') || qCode.startsWith('QR')) return 'AIRSPACE';

  return 'GENERAL';
}

/**
 * NOTAM이 특정 공항에 관련이 있는지 확인
 */
export function isNotamRelevant(notam: Notam, airportIcao: string): boolean {
  // 공항 코드 직접 일치
  if (notam.location === airportIcao) return true;

  // FIR 관련 NOTAM (같은 FIR 내면 관련됨)
  // RKRR = 인천 FIR, RKPU는 인천 FIR 관할
  if (notam.location === 'RKRR' && airportIcao.startsWith('RK')) return true;

  // Q-line의 FIR 확인
  if (notam.qLine?.fir === 'RKRR' && airportIcao.startsWith('RK')) return true;

  return false;
}
