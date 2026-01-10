/**
 * Airport Database
 * DO-278A 요구사항 추적: SRS-CONFIG-002
 *
 * 전세계 주요 공항 정보 데이터베이스
 */

import type { Airport, AirportType, Coordinate } from '@/types';

// ============================================
// 공항 정보 데이터베이스
// ============================================

export const AIRPORT_DATABASE: Record<string, Omit<Airport, 'icao' | 'lat' | 'lon'>> = {
  // ========== 대한민국 (RK) ==========
  // 거점공항 (Hub Airports)
  RKSI: { name: '인천국제공항', country: 'KR', type: 'hub' },
  RKSS: { name: '김포국제공항', country: 'KR', type: 'hub' },
  RKPK: { name: '김해국제공항', country: 'KR', type: 'hub', note: '공군 제5공중기동비행단' },
  RKPC: { name: '제주국제공항', country: 'KR', type: 'hub' },
  RKTN: { name: '대구국제공항', country: 'KR', type: 'hub', note: '공군 공중전투사령부' },
  RKTU: { name: '청주국제공항', country: 'KR', type: 'hub', note: '공군 제17전투비행단' },
  RKJB: { name: '무안국제공항', country: 'KR', type: 'hub' },

  // 일반공항 (General Airports)
  RKNY: { name: '양양국제공항', country: 'KR', type: 'general' },
  RKPU: { name: '울산공항', country: 'KR', type: 'general' },
  RKJY: { name: '여수공항', country: 'KR', type: 'general' },
  RKPS: { name: '사천공항', country: 'KR', type: 'general', note: '공군 제3훈련비행단' },
  RKTH: { name: '포항경주공항', country: 'KR', type: 'general', note: '해군 항공사령부' },
  RKJK: { name: '군산공항', country: 'KR', type: 'general', note: '미공군 제8전투비행단' },
  RKNW: { name: '원주공항', country: 'KR', type: 'general', note: '공군 제8전투비행단' },
  RKTL: { name: '울진비행장', country: 'KR', type: 'general', note: '한국항공대 훈련용' },
  RKJJ: { name: '광주공항', country: 'KR', type: 'general', note: '공군 제1전투비행단' },

  // 군공항 (Military)
  RKSM: { name: '서울공항', country: 'KR', type: 'military', note: '공군 제15특수임무비행단' },
  RKSW: { name: '수원공항', country: 'KR', type: 'military', note: '공군 제10전투비행단' },
  RKNN: { name: '강릉공항', country: 'KR', type: 'military', note: '공군 제18전투비행단' },
  RKSO: { name: '오산공군기지', country: 'KR', type: 'military', note: '주한미군 제7공군' },
  RKSG: { name: '캠프 험프리스', country: 'KR', type: 'military', note: '주한미군 제2보병사단' },

  // FIR
  RKRR: { name: '인천FIR', country: 'KR', type: 'fir' },

  // ========== 일본 (RJ) ==========
  RJTT: { name: '도쿄 하네다공항', country: 'JP', type: 'hub' },
  RJAA: { name: '도쿄 나리타공항', country: 'JP', type: 'hub' },
  RJBB: { name: '오사카 간사이공항', country: 'JP', type: 'hub' },
  RJOO: { name: '오사카 이타미공항', country: 'JP', type: 'hub' },
  RJCC: { name: '삿포로 신치토세공항', country: 'JP', type: 'hub' },
  RJGG: { name: '나고야 추부국제공항', country: 'JP', type: 'hub' },
  RJFF: { name: '후쿠오카공항', country: 'JP', type: 'hub' },
  ROAH: { name: '오키나와 나하공항', country: 'JP', type: 'hub' },
  RJJJ: { name: '후쿠오카FIR', country: 'JP', type: 'fir' },

  // ========== 중국 (Z) ==========
  ZBAA: { name: '베이징 서우두공항', country: 'CN', type: 'hub' },
  ZBAD: { name: '베이징 다싱공항', country: 'CN', type: 'hub' },
  ZSPD: { name: '상하이 푸둥공항', country: 'CN', type: 'hub' },
  ZSSS: { name: '상하이 홍차오공항', country: 'CN', type: 'hub' },
  ZGGG: { name: '광저우 바이윈공항', country: 'CN', type: 'hub' },
  ZGSZ: { name: '선전 바오안공항', country: 'CN', type: 'hub' },

  // ========== 대만 (RC) ==========
  RCTP: { name: '타이페이 타오위안공항', country: 'TW', type: 'hub' },
  RCSS: { name: '타이페이 쑹산공항', country: 'TW', type: 'hub' },
  RCKH: { name: '카오슝공항', country: 'TW', type: 'hub' },

  // ========== 동남아시아 ==========
  VHHH: { name: '홍콩국제공항', country: 'HK', type: 'hub' },
  VMMC: { name: '마카오국제공항', country: 'MO', type: 'hub' },
  VVNB: { name: '하노이 노이바이공항', country: 'VN', type: 'hub' },
  VVTS: { name: '호치민 떤선녓공항', country: 'VN', type: 'hub' },
  VTBS: { name: '방콕 수완나품공항', country: 'TH', type: 'hub' },
  WSSS: { name: '싱가포르 창이공항', country: 'SG', type: 'hub' },
  WMKK: { name: '쿠알라룸푸르공항', country: 'MY', type: 'hub' },
  RPLL: { name: '마닐라 니노이아키노공항', country: 'PH', type: 'hub' },
  WIII: { name: '자카르타 수카르노하타공항', country: 'ID', type: 'hub' },
  WADD: { name: '발리 응우라라이공항', country: 'ID', type: 'hub' },

  // ========== 미주/유럽 ==========
  KLAX: { name: '로스앤젤레스공항', country: 'US', type: 'hub' },
  KJFK: { name: '뉴욕 JFK공항', country: 'US', type: 'hub' },
  KSFO: { name: '샌프란시스코공항', country: 'US', type: 'hub' },
  PHNL: { name: '호놀룰루공항', country: 'US', type: 'hub' },
  PGUM: { name: '괌 원팻공항', country: 'US', type: 'hub' },
  EGLL: { name: '런던 히드로공항', country: 'GB', type: 'hub' },
  LFPG: { name: '파리 샤를드골공항', country: 'FR', type: 'hub' },
  EDDF: { name: '프랑크푸르트공항', country: 'DE', type: 'hub' },
};

// ============================================
// 공항 좌표 데이터베이스
// ============================================

export const AIRPORT_COORDINATES: Record<string, Coordinate> = {
  // 대한민국 민간 공항
  RKSI: { lat: 37.4691, lon: 126.4505 },
  RKSS: { lat: 37.5583, lon: 126.7906 },
  RKPK: { lat: 35.1795, lon: 128.9381 },
  RKPC: { lat: 33.5066, lon: 126.4929 },
  RKTN: { lat: 35.8941, lon: 128.6589 },
  RKTU: { lat: 36.7166, lon: 127.4991 },
  RKJB: { lat: 34.9914, lon: 126.3828 },
  RKNY: { lat: 38.0614, lon: 128.6692 },
  RKPU: { lat: 35.5935, lon: 129.3518 },
  RKJY: { lat: 34.8423, lon: 127.6161 },
  RKPS: { lat: 35.0886, lon: 128.0702 },
  RKTH: { lat: 35.9879, lon: 129.4203 },
  RKJK: { lat: 35.9038, lon: 126.6158 },
  RKNW: { lat: 37.4383, lon: 127.9604 },
  RKJJ: { lat: 35.1264, lon: 126.8089 },
  RKNN: { lat: 37.7536, lon: 128.944 },

  // 대한민국 군용/기타 공항
  RKSM: { lat: 37.4449, lon: 127.1139 },
  RKSW: { lat: 37.2394, lon: 127.0071 },
  RKSO: { lat: 37.0905, lon: 127.0296 },
  RKSG: { lat: 36.9617, lon: 127.0311 },
  RKRR: { lat: 37.0, lon: 127.5 },

  // 일본
  RJTT: { lat: 35.5533, lon: 139.7811 },
  RJAA: { lat: 35.7647, lon: 140.3864 },
  RJBB: { lat: 34.4347, lon: 135.244 },
  RJOO: { lat: 34.7855, lon: 135.4381 },
  RJFF: { lat: 33.5859, lon: 130.4511 },
  RJCC: { lat: 42.7752, lon: 141.6925 },
  RJGG: { lat: 34.8584, lon: 136.805 },
  ROAH: { lat: 26.1958, lon: 127.6458 },
  RJJJ: { lat: 33.5, lon: 130.5 },

  // 중국
  ZBAA: { lat: 40.0799, lon: 116.6031 },
  ZSPD: { lat: 31.1434, lon: 121.8052 },
  ZGGG: { lat: 23.3924, lon: 113.2988 },
  ZGSZ: { lat: 22.6393, lon: 113.8107 },

  // 대만
  RCTP: { lat: 25.0777, lon: 121.233 },
  RCSS: { lat: 25.0694, lon: 121.5517 },

  // 홍콩/마카오
  VHHH: { lat: 22.308, lon: 113.9185 },
  VMMC: { lat: 22.1496, lon: 113.5925 },
};

// ============================================
// 국가 정보
// ============================================

export const COUNTRY_INFO: Record<
  string,
  { name: string; flag: string; prefix: string }
> = {
  KR: { name: '대한민국', flag: '🇰🇷', prefix: 'RK' },
  KP: { name: '북한', flag: '🇰🇵', prefix: 'ZK' },
  JP: { name: '일본', flag: '🇯🇵', prefix: 'RJ/RO' },
  CN: { name: '중국', flag: '🇨🇳', prefix: 'Z' },
  TW: { name: '대만', flag: '🇹🇼', prefix: 'RC' },
  HK: { name: '홍콩', flag: '🇭🇰', prefix: 'VH' },
  MO: { name: '마카오', flag: '🇲🇴', prefix: 'VM' },
  VN: { name: '베트남', flag: '🇻🇳', prefix: 'VV' },
  TH: { name: '태국', flag: '🇹🇭', prefix: 'VT' },
  SG: { name: '싱가포르', flag: '🇸🇬', prefix: 'WS' },
  MY: { name: '말레이시아', flag: '🇲🇾', prefix: 'WM' },
  PH: { name: '필리핀', flag: '🇵🇭', prefix: 'RP' },
  ID: { name: '인도네시아', flag: '🇮🇩', prefix: 'WI/WA' },
  US: { name: '미국', flag: '🇺🇸', prefix: 'K/P' },
  GB: { name: '영국', flag: '🇬🇧', prefix: 'EG' },
  FR: { name: '프랑스', flag: '🇫🇷', prefix: 'LF' },
  DE: { name: '독일', flag: '🇩🇪', prefix: 'ED' },
};

// ============================================
// 공항 타입 라벨
// ============================================

export const AIRPORT_TYPE_LABELS: Record<AirportType, string> = {
  hub: '거점공항',
  general: '일반공항',
  private: '사설공항',
  military: '군공항',
  fir: 'FIR/ACC',
};

// ============================================
// 유틸리티 함수
// ============================================

/**
 * ICAO 코드로 공항 정보 조회
 */
export function getAirportInfo(icao: string): Airport | null {
  const info = AIRPORT_DATABASE[icao];
  const coord = AIRPORT_COORDINATES[icao];

  if (!info) return null;

  return {
    icao,
    ...info,
    lat: coord?.lat ?? 0,
    lon: coord?.lon ?? 0,
  };
}

/**
 * 국가별 공항 목록 조회
 */
export function getAirportsByCountry(countryCode: string): Airport[] {
  return Object.entries(AIRPORT_DATABASE)
    .filter(([, info]) => info.country === countryCode)
    .map(([icao]) => getAirportInfo(icao))
    .filter((airport): airport is Airport => airport !== null);
}

/**
 * 타입별 공항 목록 조회
 */
export function getAirportsByType(type: AirportType): Airport[] {
  return Object.entries(AIRPORT_DATABASE)
    .filter(([, info]) => info.type === type)
    .map(([icao]) => getAirportInfo(icao))
    .filter((airport): airport is Airport => airport !== null);
}

/**
 * 한국 공항 목록 조회
 */
export function getKoreanAirports(): Airport[] {
  return getAirportsByCountry('KR');
}
