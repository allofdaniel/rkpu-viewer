/**
 * Airspace Entity
 * DO-278A 요구사항 추적: SRS-GIS-001
 *
 * 공역, 웨이포인트, 항로 등 GIS 관련 도메인 모델을 정의합니다.
 */

import type {
  Airspace,
  AirspaceType,
  Waypoint,
  Coordinate,
  FlightProcedure,
  ProcedureType,
} from '@/types';

// ============================================
// 공역 관련 함수
// ============================================

/**
 * 새 공역 엔티티 생성
 */
export function createAirspace(
  name: string,
  type: AirspaceType,
  coordinates: Coordinate[],
  floorFt: number,
  ceilingFt: number,
  options?: {
    category?: string;
    activeTime?: string;
    remarks?: string;
  }
): Airspace {
  return {
    name,
    type,
    coordinates,
    floorFt,
    ceilingFt,
    ...options,
  };
}

/**
 * 점이 폴리곤 내부에 있는지 확인 (Point-in-Polygon 알고리즘)
 */
export function isPointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const { lat: py, lon: px } = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]?.lon ?? 0;
    const yi = polygon[i]?.lat ?? 0;
    const xj = polygon[j]?.lon ?? 0;
    const yj = polygon[j]?.lat ?? 0;

    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * 항공기가 특정 공역 내에 있는지 확인
 */
export function isInAirspace(
  position: Coordinate & { altitude_ft?: number },
  airspace: Airspace
): boolean {
  const altitude = position.altitude_ft;
  const floorFt = airspace.floorFt ?? airspace.lowerLimit ?? 0;
  const ceilingFt = airspace.ceilingFt ?? airspace.upperLimit;
  const polygon = airspace.coordinates ?? airspace.polygon ?? [];

  // 고도가 있으면 고도 확인
  if (altitude !== undefined) {
    if (altitude < floorFt) return false;
    if (ceilingFt !== undefined && altitude > ceilingFt) return false;
  }

  // 수평 위치 확인
  return isPointInPolygon(position, polygon);
}

/**
 * 현재 위치에서 해당되는 모든 공역 찾기
 */
export function findContainingAirspaces(
  position: Coordinate & { altitude_ft?: number },
  airspaces: Airspace[]
): Airspace[] {
  return airspaces.filter((airspace) => isInAirspace(position, airspace));
}

/**
 * 공역 타입별 색상 반환
 */
export function getAirspaceColor(type: AirspaceType): string {
  const colors: Record<AirspaceType, string> = {
    CTR: 'rgba(33, 150, 243, 0.3)',
    TMA: 'rgba(156, 39, 176, 0.2)',
    ACC: 'rgba(76, 175, 80, 0.15)',
    FIR: 'rgba(158, 158, 158, 0.1)',
    P: 'rgba(244, 67, 54, 0.4)',
    R: 'rgba(255, 152, 0, 0.4)',
    D: 'rgba(255, 235, 59, 0.3)',
    MOA: 'rgba(139, 195, 74, 0.2)',
    ADIZ: 'rgba(121, 85, 72, 0.2)',
  };
  return colors[type];
}

/**
 * 공역 타입별 테두리 색상 반환
 */
export function getAirspaceBorderColor(type: AirspaceType): string {
  const colors: Record<AirspaceType, string> = {
    CTR: '#2196F3',
    TMA: '#9C27B0',
    ACC: '#4CAF50',
    FIR: '#9E9E9E',
    P: '#F44336',
    R: '#FF9800',
    D: '#FFEB3B',
    MOA: '#8BC34A',
    ADIZ: '#795548',
  };
  return colors[type];
}

/**
 * 공역 타입 한글명 반환
 */
export function getAirspaceTypeLabel(type: AirspaceType): string {
  const labels: Record<AirspaceType, string> = {
    CTR: '관제권',
    TMA: '터미널구역',
    ACC: '접근관제구역',
    FIR: '비행정보구역',
    P: '비행금지구역',
    R: '비행제한구역',
    D: '위험구역',
    MOA: '군작전구역',
    ADIZ: '방공식별구역',
  };
  return labels[type];
}

// ============================================
// 웨이포인트 관련 함수
// ============================================

/**
 * 새 웨이포인트 생성
 */
export function createWaypoint(
  ident: string,
  lat: number,
  lon: number,
  type: Waypoint['type'] = 'waypoint',
  options?: {
    name?: string;
    altitude_ft?: number;
  }
): Waypoint {
  return {
    ident,
    lat,
    lon,
    type,
    ...options,
  };
}

/**
 * 두 웨이포인트 간 거리 계산 (NM)
 */
export function calculateWaypointDistance(wp1: Waypoint, wp2: Waypoint): number {
  const latDiff = (wp1.lat - wp2.lat) * 60;
  const lonDiff = (wp1.lon - wp2.lon) * 60 * Math.cos((wp1.lat * Math.PI) / 180);
  return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
}

/**
 * 항공기 위치에서 가장 가까운 웨이포인트 찾기
 */
export function findNearestWaypoint(
  position: Coordinate,
  waypoints: Waypoint[]
): Waypoint | null {
  if (waypoints.length === 0) return null;

  let nearest: Waypoint | null = null;
  let minDistance = Infinity;

  for (const wp of waypoints) {
    const dist = calculateWaypointDistance(
      { ident: '', lat: position.lat, lon: position.lon, type: 'waypoint' },
      wp
    );
    if (dist < minDistance) {
      minDistance = dist;
      nearest = wp;
    }
  }

  return nearest;
}

/**
 * 진행 방향 기준 앞에 있는 웨이포인트 필터링
 * @param position 현재 위치
 * @param track 진행 방향 (degrees)
 * @param waypoints 웨이포인트 목록
 * @param maxAngle 최대 허용 각도차 (degrees, 기본 90)
 */
export function filterWaypointsAhead(
  position: Coordinate,
  track: number,
  waypoints: Waypoint[],
  maxAngle = 90
): Waypoint[] {
  return waypoints.filter((wp) => {
    // 웨이포인트 방향 계산
    const bearing =
      (Math.atan2(
        (wp.lon - position.lon) * Math.cos((position.lat * Math.PI) / 180),
        wp.lat - position.lat
      ) *
        180) /
      Math.PI;

    // 트랙과의 각도차
    const trackDiff = Math.abs(((bearing - track + 180) % 360) - 180);
    return trackDiff < maxAngle;
  });
}

/**
 * 웨이포인트 타입별 아이콘 문자 반환
 */
export function getWaypointIcon(type: Waypoint['type']): string {
  const icons: Record<Waypoint['type'], string> = {
    waypoint: '◆',
    navaid: '▲',
    airport: '✈',
  };
  return icons[type];
}

// ============================================
// 비행절차 관련 함수
// ============================================

/**
 * 절차 타입별 색상 반환
 */
export function getProcedureColor(type: ProcedureType): string {
  const colors: Record<ProcedureType, string> = {
    SID: '#4CAF50',
    STAR: '#FF9800',
    APPROACH: '#F44336',
  };
  return colors[type];
}

/**
 * 절차 타입 한글명 반환
 */
export function getProcedureTypeLabel(type: ProcedureType): string {
  const labels: Record<ProcedureType, string> = {
    SID: '표준계기출발',
    STAR: '표준도착항로',
    APPROACH: '계기접근',
  };
  return labels[type];
}

/**
 * 항공기 위치에서 가장 가까운 절차 찾기
 */
export function findNearestProcedure(
  position: Coordinate,
  procedures: FlightProcedure[],
  maxDistanceNM = 3
): FlightProcedure | null {
  let nearest: FlightProcedure | null = null;
  let minDistance = Infinity;

  for (const proc of procedures) {
    for (const segment of proc.segments) {
      for (const coord of segment.coordinates) {
        const dist = calculateWaypointDistance(
          { ident: '', lat: position.lat, lon: position.lon, type: 'waypoint' },
          { ident: '', lat: coord.lat, lon: coord.lon, type: 'waypoint' }
        );

        if (dist < minDistance && dist <= maxDistanceNM) {
          minDistance = dist;
          nearest = proc;
        }
      }
    }
  }

  return nearest;
}

/**
 * 리본 세그먼트 생성 (3D 절차 시각화용)
 */
export function createRibbonSegment(
  coord1: { lon: number; lat: number; altitude?: number },
  coord2: { lon: number; lat: number; altitude?: number },
  width = 0.0008
): {
  coordinates: number[][][];
  avgAlt: number;
} | null {
  const { lon: lon1, lat: lat1, altitude: alt1 = 0 } = coord1;
  const { lon: lon2, lat: lat2, altitude: alt2 = 0 } = coord2;

  const dx = lon2 - lon1;
  const dy = lat2 - lat1;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) return null;

  const nx = (-dy / len) * width;
  const ny = (dx / len) * width;

  return {
    coordinates: [
      [
        [lon1 + nx, lat1 + ny],
        [lon1 - nx, lat1 - ny],
        [lon2 - nx, lat2 - ny],
        [lon2 + nx, lat2 + ny],
        [lon1 + nx, lat1 + ny],
      ],
    ],
    avgAlt: (alt1 + alt2) / 2,
  };
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 원형 폴리곤 생성
 */
export function createCirclePolygon(
  center: Coordinate,
  radiusDegrees: number,
  numPoints = 32
): Coordinate[] {
  const coords: Coordinate[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    coords.push({
      lat: center.lat + radiusDegrees * Math.sin(angle),
      lon: center.lon + (radiusDegrees * Math.cos(angle)) / Math.cos((center.lat * Math.PI) / 180),
    });
  }
  return coords;
}

/**
 * NM를 도(degree)로 변환
 */
export function nmToDegrees(nm: number): number {
  return nm / 60;
}

/**
 * km를 도(degree)로 변환
 */
export function kmToDegrees(km: number): number {
  return km / 111.32;
}

/**
 * 폴리곤 중심점 계산
 */
export function calculatePolygonCenter(polygon: Coordinate[]): Coordinate {
  if (polygon.length === 0) {
    return { lat: 0, lon: 0 };
  }

  let sumLat = 0;
  let sumLon = 0;

  for (const coord of polygon) {
    sumLat += coord.lat;
    sumLon += coord.lon;
  }

  return {
    lat: sumLat / polygon.length,
    lon: sumLon / polygon.length,
  };
}
