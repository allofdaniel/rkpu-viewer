/**
 * Weather Entity
 * DO-278A 요구사항 추적: SRS-WX-001
 *
 * 항공 기상 정보의 핵심 도메인 모델을 정의합니다.
 */

import type {
  MetarData,
  TafData,
  SigmetData,
  LightningStrike,
  FlightCategory,
} from '@/types';

/**
 * 통합 기상 정보 엔티티
 */
export interface WeatherInfo {
  readonly metar?: MetarData;
  readonly taf?: TafData;
  readonly sigmets: readonly SigmetData[];
  readonly lightning: readonly LightningStrike[];
  readonly lastUpdated: number;
}

/**
 * 새 기상 정보 엔티티 생성
 */
export function createWeatherInfo(
  metar?: MetarData,
  taf?: TafData,
  sigmets: SigmetData[] = [],
  lightning: LightningStrike[] = []
): WeatherInfo {
  return {
    metar,
    taf,
    sigmets,
    lightning,
    lastUpdated: Date.now(),
  };
}

/**
 * METAR 데이터 업데이트
 */
export function updateMetar(weather: WeatherInfo, metar: MetarData): WeatherInfo {
  return {
    ...weather,
    metar,
    lastUpdated: Date.now(),
  };
}

/**
 * Flight Category 결정
 * VFR: 시정 > 5SM, 운고 > 3000ft
 * MVFR: 시정 3-5SM, 운고 1000-3000ft
 * IFR: 시정 1-3SM, 운고 500-1000ft
 * LIFR: 시정 < 1SM, 운고 < 500ft
 *
 * @param visibilitySM 시정 (statute miles)
 * @param ceilingFt 운고 (feet)
 */
export function determineFlightCategory(
  visibilitySM: number,
  ceilingFt: number | null
): FlightCategory {
  const ceiling = ceilingFt ?? 99999;

  if (visibilitySM < 1 || ceiling < 500) {
    return 'LIFR';
  }
  if (visibilitySM < 3 || ceiling < 1000) {
    return 'IFR';
  }
  if (visibilitySM < 5 || ceiling < 3000) {
    return 'MVFR';
  }
  return 'VFR';
}

/**
 * Flight Category 색상 반환
 */
export function getFlightCategoryColor(category: FlightCategory): string {
  const colors: Record<FlightCategory, string> = {
    VFR: '#4CAF50',
    MVFR: '#2196F3',
    IFR: '#F44336',
    LIFR: '#9C27B0',
  };
  return colors[category];
}

/**
 * Flight Category 한글명 반환
 */
export function getFlightCategoryLabel(category: FlightCategory): string {
  const labels: Record<FlightCategory, string> = {
    VFR: '시계비행',
    MVFR: '한계시계',
    IFR: '계기비행',
    LIFR: '저시계',
  };
  return labels[category];
}

/**
 * 풍향을 나침반 방향으로 변환
 */
export function windDirectionToCompass(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index] ?? 'N';
}

/**
 * 풍속 변환 (m/s → knots)
 */
export function msToKnots(ms: number): number {
  return Math.round(ms * 1.94384);
}

/**
 * 풍속 변환 (knots → m/s)
 */
export function knotsToMs(knots: number): number {
  return knots / 1.94384;
}

/**
 * METAR 시정 해석
 */
export function parseVisibility(visibM: number): string {
  if (visibM >= 9999) return 'CAVOK';
  if (visibM >= 5000) return `${Math.round(visibM / 1000)}km`;
  return `${visibM}m`;
}

/**
 * SIGMET 타입별 색상 반환
 */
export function getSigmetTypeColor(type: SigmetData['type']): string {
  const colors: Record<SigmetData['type'], string> = {
    SIGMET: '#FF5722',
    TURBULENCE: '#FF9800',
    SEVERE_TURBULENCE: '#E65100',
    ICING: '#00BCD4',
    THUNDERSTORM: '#F44336',
    VOLCANIC_ASH: '#795548',
    OTHER: '#9E9E9E',
  };
  return colors[type];
}

/**
 * SIGMET 타입 한글명 반환
 */
export function getSigmetTypeLabel(type: SigmetData['type']): string {
  const labels: Record<SigmetData['type'], string> = {
    SIGMET: '시그멧',
    TURBULENCE: '난류',
    SEVERE_TURBULENCE: '심한 난류',
    ICING: '착빙',
    THUNDERSTORM: '뇌우',
    VOLCANIC_ASH: '화산재',
    OTHER: '기타',
  };
  return labels[type];
}

/**
 * QNH 기압 변환 (hPa → inHg)
 */
export function hpaToInHg(hpa: number): number {
  return hpa * 0.02953;
}

/**
 * 온도 변환 (°C → °F)
 */
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/**
 * 이슬점 차이로 상대습도 추정
 */
export function estimateHumidity(tempC: number, dewpC: number): number {
  // Magnus 공식 근사
  const a = 17.27;
  const b = 237.7;
  const alphaT = (a * tempC) / (b + tempC);
  const alphaTd = (a * dewpC) / (b + dewpC);
  return Math.round(100 * Math.exp(alphaTd - alphaT));
}

/**
 * 기상 위험도 평가
 */
export function assessWeatherRisk(weather: WeatherInfo): {
  level: 'low' | 'moderate' | 'high' | 'severe';
  factors: string[];
} {
  const factors: string[] = [];
  let riskScore = 0;

  // METAR 기반 평가
  if (weather.metar) {
    const { fltCat, wspd, wgst, visib } = weather.metar;

    if (fltCat === 'LIFR') {
      riskScore += 30;
      factors.push('저시계 기상');
    } else if (fltCat === 'IFR') {
      riskScore += 20;
      factors.push('IFR 기상');
    }

    if (wgst && wgst > 25) {
      riskScore += 15;
      factors.push(`강한 돌풍 (${wgst}kt)`);
    } else if (wspd && wspd > 20) {
      riskScore += 10;
      factors.push(`강풍 (${wspd}kt)`);
    }

    if (visib && visib < 3) {
      riskScore += 10;
      factors.push('저시정');
    }
  }

  // SIGMET 기반 평가
  if (weather.sigmets.length > 0) {
    riskScore += weather.sigmets.length * 15;
    const sigmetTypes = [...new Set(weather.sigmets.map((s) => getSigmetTypeLabel(s.type)))];
    factors.push(`SIGMET: ${sigmetTypes.join(', ')}`);
  }

  // 낙뢰 기반 평가
  if (weather.lightning.length > 10) {
    riskScore += 20;
    factors.push(`낙뢰 활동 (${weather.lightning.length}회)`);
  } else if (weather.lightning.length > 0) {
    riskScore += 10;
    factors.push('낙뢰 감지');
  }

  // 위험도 레벨 결정
  let level: 'low' | 'moderate' | 'high' | 'severe';
  if (riskScore >= 50) {
    level = 'severe';
  } else if (riskScore >= 30) {
    level = 'high';
  } else if (riskScore >= 15) {
    level = 'moderate';
  } else {
    level = 'low';
  }

  return { level, factors };
}

/**
 * 위험도 레벨 색상 반환
 */
export function getRiskLevelColor(level: 'low' | 'moderate' | 'high' | 'severe'): string {
  const colors = {
    low: '#4CAF50',
    moderate: '#FFC107',
    high: '#FF9800',
    severe: '#F44336',
  };
  return colors[level];
}

/**
 * 풍향 파싱 (문자열 → 숫자)
 */
export function parseWindDirection(dirStr: string): number | null {
  if (!dirStr || dirStr === 'VRB') return null;
  return parseInt(dirStr, 10);
}

/**
 * 측풍 계산
 */
export function calculateCrosswind(
  windDirection: number,
  runwayHeading: number,
  windSpeed: number
): number {
  const angleDiff = Math.abs(windDirection - runwayHeading);
  const angleRad = (angleDiff * Math.PI) / 180;
  return Math.abs(Math.sin(angleRad) * windSpeed);
}

/**
 * VMC (시계비행 기상상태) 여부 확인
 */
export function isVmcConditions(visibilitySM: number, ceilingFt: number | null): boolean {
  const category = determineFlightCategory(visibilitySM, ceilingFt);
  return category === 'VFR' || category === 'MVFR';
}
