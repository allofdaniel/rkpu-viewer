/**
 * Aircraft Entity
 * DO-278A 요구사항 추적: SRS-ACF-001
 *
 * 항공기의 핵심 도메인 모델을 정의합니다.
 * 순수 함수와 불변 데이터 구조를 사용합니다.
 */

import type {
  AircraftPosition,
  AircraftDetails,
  AircraftTrailPoint,
  FlightPhase,
  Coordinate,
} from '@/types';

/**
 * 항공기 엔티티 인터페이스
 */
export interface Aircraft {
  readonly hex: string;
  readonly position: AircraftPosition;
  readonly details?: AircraftDetails;
  readonly trail: readonly AircraftTrailPoint[];
  readonly flightPhase: FlightPhase;
  readonly lastUpdated: number;
}

/**
 * 새 항공기 엔티티 생성
 */
export function createAircraft(
  position: AircraftPosition,
  details?: AircraftDetails,
  trail: AircraftTrailPoint[] = []
): Aircraft {
  return {
    hex: position.hex,
    position,
    details,
    trail,
    flightPhase: detectFlightPhase(position),
    lastUpdated: Date.now(),
  };
}

/**
 * 항공기 위치 업데이트
 */
export function updateAircraftPosition(
  aircraft: Aircraft,
  newPosition: AircraftPosition,
  maxTrailPoints = 100
): Aircraft {
  const newTrailPoint: AircraftTrailPoint = {
    lat: newPosition.lat,
    lon: newPosition.lon,
    altitude_ft: newPosition.altitude_ft,
    timestamp: Date.now(),
  };

  // 기존 trail에 새 포인트 추가, 최대 개수 제한
  const updatedTrail = [...aircraft.trail, newTrailPoint].slice(-maxTrailPoints);

  return {
    ...aircraft,
    position: newPosition,
    trail: updatedTrail,
    flightPhase: detectFlightPhase(newPosition),
    lastUpdated: Date.now(),
  };
}

/**
 * 비행 단계 감지
 * @param position 항공기 위치 정보
 * @param airportCoord 기준 공항 좌표 (기본값: RKPU)
 */
export function detectFlightPhase(
  position: AircraftPosition,
  airportCoord: Coordinate = { lat: 35.5934, lon: 129.3518 }
): FlightPhase {
  const { altitude_ft = 0, ground_speed = 0, vertical_rate = 0, on_ground } = position;

  // 공항과의 거리 계산 (NM)
  const distToAirport = calculateDistanceNM(position, airportCoord);

  // 지상 상태
  if (on_ground || (altitude_ft < 100 && ground_speed < 30)) {
    return 'ground';
  }

  // 이륙 단계
  if (altitude_ft < 500 && vertical_rate > 300 && ground_speed > 60) {
    return 'takeoff';
  }

  // 착륙 단계
  if (altitude_ft < 500 && vertical_rate < -300 && ground_speed > 60 && distToAirport < 5) {
    return 'landing';
  }

  // 출발 단계
  if (altitude_ft < 10000 && vertical_rate > 200 && distToAirport < 30) {
    return 'departure';
  }

  // 접근 단계
  if (altitude_ft < 10000 && vertical_rate < -200 && distToAirport < 30) {
    return 'approach';
  }

  // 고고도 비행
  if (altitude_ft >= 10000 || distToAirport > 30) {
    if (Math.abs(vertical_rate) < 300) {
      return 'cruise';
    } else if (vertical_rate > 0) {
      return 'climb';
    } else {
      return 'descent';
    }
  }

  return 'enroute';
}

/**
 * 두 좌표 간 거리 계산 (NM)
 */
export function calculateDistanceNM(
  point1: Coordinate,
  point2: Coordinate
): number {
  const latDiff = (point1.lat - point2.lat) * 60;
  const lonDiff = (point1.lon - point2.lon) * 60 * Math.cos((point1.lat * Math.PI) / 180);
  return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
}

/**
 * 예상 도착 시간 계산 (분)
 */
export function calculateETA(
  aircraft: Aircraft,
  destination: Coordinate
): number | null {
  const { ground_speed = 0 } = aircraft.position;
  if (ground_speed <= 0) return null;

  const distanceNM = calculateDistanceNM(aircraft.position, destination);
  return (distanceNM / ground_speed) * 60;
}

/**
 * 비행 단계별 색상 반환
 */
export function getFlightPhaseColor(phase: FlightPhase): string {
  const colors: Record<FlightPhase, string> = {
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
  return colors[phase];
}

/**
 * 비행 단계 한글명 반환
 */
export function getFlightPhaseLabel(phase: FlightPhase): string {
  const labels: Record<FlightPhase, string> = {
    ground: '지상',
    takeoff: '이륙',
    departure: '출발',
    climb: '상승',
    cruise: '순항',
    descent: '강하',
    approach: '접근',
    landing: '착륙',
    enroute: '비행중',
    unknown: '알 수 없음',
  };
  return labels[phase];
}

/**
 * 고도를 미터로 변환
 */
export function feetToMeters(feet: number): number {
  return feet * 0.3048;
}

/**
 * 고도 기반 색상 계산 (저고도: 녹색 → 고고도: 빨간색)
 */
export function altitudeToColor(altitudeFt: number): string {
  const t = Math.min(1, Math.max(0, altitudeFt / 8000));
  if (t < 0.5) {
    return `rgb(${Math.round(255 * t * 2)}, 255, 50)`;
  }
  return `rgb(255, ${Math.round(255 * (1 - (t - 0.5) * 2))}, 50)`;
}

/**
 * 항공기 카테고리별 색상
 */
export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    A0: '#00BCD4',
    A1: '#4CAF50',
    A2: '#8BC34A',
    A3: '#CDDC39',
    A4: '#FFEB3B',
    A5: '#FF9800',
    A6: '#F44336',
    A7: '#E91E63',
  };
  return colors[category] || '#9E9E9E';
}

/**
 * 항적 trail 데이터에서 이상 점프 필터링
 * @param trail 항적 포인트 배열
 * @param maxJumpDegrees 최대 허용 점프 거리 (도 단위)
 */
export function filterAbnormalJumps(
  trail: readonly AircraftTrailPoint[],
  maxJumpDegrees = 0.1
): AircraftTrailPoint[] {
  if (trail.length < 2) return [...trail];

  const firstPoint = trail[0];
  if (!firstPoint) return [];

  const filtered: AircraftTrailPoint[] = [firstPoint];

  for (let i = 1; i < trail.length; i++) {
    const prev = trail[i - 1];
    const curr = trail[i];
    if (!prev || !curr) continue;

    const dist = Math.sqrt(
      Math.pow(curr.lon - prev.lon, 2) + Math.pow(curr.lat - prev.lat, 2)
    );

    if (dist <= maxJumpDegrees) {
      filtered.push(curr);
    }
  }

  return filtered;
}

/**
 * 고도 포맷팅
 */
export function formatAltitude(feet: number | undefined): string {
  if (feet === undefined || feet === null) return '-';
  if (feet >= 18000) {
    return `FL${Math.round(feet / 100)}`;
  }
  return `${Math.round(feet).toLocaleString()}ft`;
}

/**
 * 속도 포맷팅
 */
export function formatSpeed(knots: number | undefined): string {
  if (knots === undefined || knots === null) return '-';
  return `${Math.round(knots)}kt`;
}

/**
 * 지상 여부 판단
 */
export function isOnGround(position: AircraftPosition): boolean {
  if (position.on_ground !== undefined) return position.on_ground;
  const altitude = position.altitude_ft ?? position.altitude_baro ?? 0;
  const speed = position.ground_speed ?? position.gs ?? 0;
  return altitude < 100 && speed < 30;
}
