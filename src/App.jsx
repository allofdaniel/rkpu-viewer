import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

mapboxgl.accessToken = 'pk.eyJ1IjoiYWxsb2ZkYW5pZWwiLCJhIjoiY21pbzY5ejhkMDJvZzNjczVwMmlhYTljaiJ9.eSoww-z9bQuolQ4fQHqZOg';

const IS_PRODUCTION = import.meta.env.PROD;
const AIRCRAFT_UPDATE_INTERVAL = 5000; // 5초 간격 (rate limit 방지)

// NOTAM Cache settings - 메모리 캐시 사용 (localStorage는 용량 초과로 실패)
const NOTAM_CACHE_DURATION = 10 * 60 * 1000; // 10분 캐시 유지
const notamMemoryCache = {}; // { period: { data, timestamp } }

// NOTAM 메모리 캐시 헬퍼 함수
const getNotamCache = (period) => {
  const cached = notamMemoryCache[period];
  if (!cached) return null;

  const now = Date.now();

  // 캐시가 유효한지 확인 (10분 이내)
  if (now - cached.timestamp < NOTAM_CACHE_DURATION) {
    console.log(`NOTAM memory cache hit for period: ${period}, age: ${Math.round((now - cached.timestamp) / 1000)}s`);
    return cached.data;
  }

  // 만료된 캐시 삭제
  delete notamMemoryCache[period];
  return null;
};

const setNotamCache = (period, data) => {
  notamMemoryCache[period] = {
    data,
    timestamp: Date.now()
  };
  console.log(`NOTAM memory cache saved for period: ${period}, count: ${data?.data?.length || 0}`);
};

const getNotamCacheAge = (period) => {
  const cached = notamMemoryCache[period];
  if (!cached) return null;
  return Date.now() - cached.timestamp;
};

// 전세계 공항 정보 (ICAO 코드 -> 정보)
const AIRPORT_DATABASE = {
  // ========== 대한민국 (RK) ==========
  // 거점공항 (Hub Airports)
  RKSI: { name: '인천국제공항', country: 'KR', type: 'hub', region: '중부권' },
  RKSS: { name: '김포국제공항', country: 'KR', type: 'hub', region: '중부권' },
  RKPK: { name: '김해국제공항', country: 'KR', type: 'hub', region: '동남권', note: '공군 제5공중기동비행단' },
  RKPC: { name: '제주국제공항', country: 'KR', type: 'hub', region: '제주권' },
  RKTN: { name: '대구국제공항', country: 'KR', type: 'hub', region: '대경권', note: '공군 공중전투사령부' },
  RKTU: { name: '청주국제공항', country: 'KR', type: 'hub', region: '중부권', note: '공군 제17전투비행단' },
  RKJB: { name: '무안국제공항', country: 'KR', type: 'hub', region: '서남권' },

  // 일반공항 (General Airports)
  RKNY: { name: '양양국제공항', country: 'KR', type: 'general', region: '중부권' },
  RKPU: { name: '울산공항', country: 'KR', type: 'general', region: '동남권' },
  RKJY: { name: '여수공항', country: 'KR', type: 'general', region: '서남권' },
  RKPS: { name: '사천공항', country: 'KR', type: 'general', region: '동남권', note: '공군 제3훈련비행단' },
  RKTH: { name: '포항경주공항', country: 'KR', type: 'general', region: '대경권', note: '해군 항공사령부' },
  RKJK: { name: '군산공항', country: 'KR', type: 'general', region: '서남권', note: '미공군 제8전투비행단' },
  RKNW: { name: '원주공항', country: 'KR', type: 'general', region: '중부권', note: '공군 제8전투비행단' },
  RKTL: { name: '울진비행장', country: 'KR', type: 'general', region: '대경권', note: '한국항공대 훈련용' },
  RKJJ: { name: '광주공항', country: 'KR', type: 'general', region: '서남권', note: '공군 제1전투비행단' },

  // 사설공항 (Private Airports)
  RKRS: { name: '수색비행장', country: 'KR', type: 'private', note: '육군 제11항공단' },
  RKSE: { name: '사곶비행장', country: 'KR', type: 'private', note: '백령도 천연활주로' },
  RKTA: { name: '태안비행장', country: 'KR', type: 'private', note: '한서대학교' },
  RKPD: { name: '정석비행장', country: 'KR', type: 'private', note: '대한항공 훈련용' },
  RKSJ: { name: '잠실헬리패드', country: 'KR', type: 'private' },

  // 군공항 - 육군 (Army)
  RKRN: { name: '이천비행장', country: 'KR', type: 'military', note: '육군 항공작전사령부' },
  RKRD: { name: '덕소비행장', country: 'KR', type: 'military', note: '육군 제11항공단' },
  RKRP: { name: '파주비행장', country: 'KR', type: 'military', note: '육군 제11항공단' },
  RKRG: { name: '광탄비행장', country: 'KR', type: 'military', note: '육군 제11항공단' },
  RKRA: { name: '가납리비행장', country: 'KR', type: 'military', note: '육군 제11항공단' },
  RKRK: { name: '가평비행장', country: 'KR', type: 'military', note: '육군 제15항공단' },
  RKRO: { name: '포천비행장', country: 'KR', type: 'military', note: '육군 제15항공단' },
  RKRY: { name: '용인비행장', country: 'KR', type: 'military', note: '육군 제17항공단' },
  RKMS: { name: '신북비행장', country: 'KR', type: 'military', note: '육군 제12항공단' },
  RKMB: { name: '홍천비행장', country: 'KR', type: 'military', note: '육군 제13항공단' },
  RKMG: { name: '안대리비행장', country: 'KR', type: 'military', note: '육군 제13항공단' },
  RKMA: { name: '현리비행장', country: 'KR', type: 'military', note: '육군 제13항공단' },
  RKND: { name: '속초공항', country: 'KR', type: 'military', note: '육군 제13항공단' },
  RKUY: { name: '영천비행장', country: 'KR', type: 'military', note: '육군 제21항공단' },
  RKJU: { name: '전주비행장', country: 'KR', type: 'military', note: '육군 제21항공단' },

  // 군공항 - 해군 (Navy)
  RKPE: { name: '진해비행장', country: 'KR', type: 'military', note: '해군기지' },
  RKJM: { name: '목포공항', country: 'KR', type: 'military', note: '해군 항공사령부' },

  // 군공항 - 공군 (Air Force)
  RKSM: { name: '서울공항', country: 'KR', type: 'military', note: '공군 제15특수임무비행단' },
  RKSW: { name: '수원공항', country: 'KR', type: 'military', note: '공군 제10전투비행단' },
  RKNN: { name: '강릉공항', country: 'KR', type: 'military', note: '공군 제18전투비행단' },
  RKTE: { name: '성무비행장', country: 'KR', type: 'military', note: '공군사관학교' },
  RKTI: { name: '중원비행장', country: 'KR', type: 'military', note: '공군 제19전투비행단' },
  RKTF: { name: '계룡비행장', country: 'KR', type: 'military', note: '공군본부' },
  RKTP: { name: '서산공항', country: 'KR', type: 'military', note: '공군 제20전투비행단, 2028년 민항 개항예정' },
  RKTY: { name: '예천공항', country: 'KR', type: 'military', note: '공군 제16전투비행단' },

  // 군공항 - 주한미군 (USFK)
  RKSO: { name: '오산공군기지', country: 'KR', type: 'military', note: '주한미군 제7공군' },
  RKSG: { name: '캠프 험프리스', country: 'KR', type: 'military', note: '주한미군 제2보병사단' },
  RKTG: { name: '캠프 워커', country: 'KR', type: 'military', note: '주한미군 헬기기지' },
  RKST: { name: '캠프 스탠리', country: 'KR', type: 'military', note: '주한미군 무인기' },

  // FIR/ACC
  RKRR: { name: '인천FIR', country: 'KR', type: 'fir' },

  // ========== 북한 (ZK) ==========
  ZKKP: { name: '평양FIR', country: 'KP', type: 'fir' },
  ZKPY: { name: '평양순안국제공항', country: 'KP', type: 'hub' },

  // ========== 일본 (RJ) ==========
  // 주요 국제공항
  RJTT: { name: '도쿄 하네다공항', country: 'JP', type: 'hub' },
  RJAA: { name: '도쿄 나리타공항', country: 'JP', type: 'hub' },
  RJBB: { name: '오사카 간사이공항', country: 'JP', type: 'hub' },
  RJOO: { name: '오사카 이타미공항', country: 'JP', type: 'hub' },
  RJCC: { name: '삿포로 신치토세공항', country: 'JP', type: 'hub' },
  RJGG: { name: '나고야 추부국제공항', country: 'JP', type: 'hub' },
  RJFF: { name: '후쿠오카공항', country: 'JP', type: 'hub' },
  ROAH: { name: '오키나와 나하공항', country: 'JP', type: 'hub' },
  // 지방공항
  RJFK: { name: '가고시마공항', country: 'JP', type: 'general' },
  RJFT: { name: '구마모토공항', country: 'JP', type: 'general' },
  RJFM: { name: '미야자키공항', country: 'JP', type: 'general' },
  RJFO: { name: '오이타공항', country: 'JP', type: 'general' },
  RJFN: { name: '나가사키공항', country: 'JP', type: 'general' },
  RJFU: { name: '사가공항', country: 'JP', type: 'general' },
  RJBE: { name: '고베공항', country: 'JP', type: 'general' },
  RJOK: { name: '고치공항', country: 'JP', type: 'general' },
  RJOM: { name: '마쓰야마공항', country: 'JP', type: 'general' },
  RJOT: { name: '다카마쓰공항', country: 'JP', type: 'general' },
  RJOH: { name: '요나고공항', country: 'JP', type: 'general' },
  RJOB: { name: '오카야마공항', country: 'JP', type: 'general' },
  RJOC: { name: '이즈모공항', country: 'JP', type: 'general' },
  RJOA: { name: '히로시마공항', country: 'JP', type: 'general' },
  RJOS: { name: '도쿠시마공항', country: 'JP', type: 'general' },
  RJNT: { name: '도야마공항', country: 'JP', type: 'general' },
  RJNK: { name: '고마쓰공항', country: 'JP', type: 'general' },
  RJNS: { name: '시즈오카공항', country: 'JP', type: 'general' },
  RJNN: { name: '나고야 고마키공항', country: 'JP', type: 'general' },
  RJSN: { name: '니가타공항', country: 'JP', type: 'general' },
  RJSS: { name: '센다이공항', country: 'JP', type: 'general' },
  RJSF: { name: '후쿠시마공항', country: 'JP', type: 'general' },
  RJSK: { name: '아키타공항', country: 'JP', type: 'general' },
  RJSC: { name: '야마가타공항', country: 'JP', type: 'general' },
  RJCH: { name: '하코다테공항', country: 'JP', type: 'general' },
  RJCB: { name: '오비히로공항', country: 'JP', type: 'general' },
  RJCK: { name: '구시로공항', country: 'JP', type: 'general' },
  RJEC: { name: '아사히카와공항', country: 'JP', type: 'general' },
  // 일본 FIR
  RJJJ: { name: '후쿠오카FIR', country: 'JP', type: 'fir' },

  // ========== 중국 (Z) ==========
  // 주요 국제공항
  ZBAA: { name: '베이징 서우두공항', country: 'CN', type: 'hub' },
  ZBAD: { name: '베이징 다싱공항', country: 'CN', type: 'hub' },
  ZSPD: { name: '상하이 푸둥공항', country: 'CN', type: 'hub' },
  ZSSS: { name: '상하이 홍차오공항', country: 'CN', type: 'hub' },
  ZGGG: { name: '광저우 바이윈공항', country: 'CN', type: 'hub' },
  ZGSZ: { name: '선전 바오안공항', country: 'CN', type: 'hub' },
  ZUUU: { name: '청두 솽류공항', country: 'CN', type: 'hub' },
  ZUCK: { name: '충칭 장베이공항', country: 'CN', type: 'hub' },
  ZSHC: { name: '항저우 샤오산공항', country: 'CN', type: 'hub' },
  ZSAM: { name: '샤먼 가오치공항', country: 'CN', type: 'hub' },
  ZLXY: { name: '시안 셴양공항', country: 'CN', type: 'hub' },
  ZSNJ: { name: '난징 루커우공항', country: 'CN', type: 'hub' },
  ZHCC: { name: '정저우 신정공항', country: 'CN', type: 'hub' },
  ZWWW: { name: '우루무치 디워푸공항', country: 'CN', type: 'hub' },
  ZYTL: { name: '다롄 저우수이쯔공항', country: 'CN', type: 'hub' },
  ZYTX: { name: '선양 타오셴공항', country: 'CN', type: 'hub' },
  ZYCC: { name: '창춘 롱자공항', country: 'CN', type: 'hub' },
  ZYHB: { name: '하얼빈 타이핑공항', country: 'CN', type: 'hub' },
  ZSQD: { name: '칭다오 류팅공항', country: 'CN', type: 'hub' },
  ZSJN: { name: '지난 야오창공항', country: 'CN', type: 'hub' },
  // 중국 FIR
  ZBPE: { name: '베이징FIR', country: 'CN', type: 'fir' },
  ZGZU: { name: '광저우FIR', country: 'CN', type: 'fir' },
  ZSHA: { name: '상하이FIR', country: 'CN', type: 'fir' },
  ZYSH: { name: '선양FIR', country: 'CN', type: 'fir' },
  ZLHW: { name: '란저우FIR', country: 'CN', type: 'fir' },
  ZPKM: { name: '쿤밍FIR', country: 'CN', type: 'fir' },
  ZWUQ: { name: '우루무치FIR', country: 'CN', type: 'fir' },

  // ========== 대만 (RC) ==========
  RCTP: { name: '타이페이 타오위안공항', country: 'TW', type: 'hub' },
  RCSS: { name: '타이페이 쑹산공항', country: 'TW', type: 'hub' },
  RCMQ: { name: '타이중 칭촨강공항', country: 'TW', type: 'hub' },
  RCKH: { name: '카오슝공항', country: 'TW', type: 'hub' },
  // 대만 FIR
  RCAA: { name: '타이페이FIR', country: 'TW', type: 'fir' },

  // ========== 홍콩/마카오 ==========
  VHHH: { name: '홍콩국제공항', country: 'HK', type: 'hub' },
  VMMC: { name: '마카오국제공항', country: 'MO', type: 'hub' },

  // ========== 동남아시아 ==========
  // 베트남
  VVNB: { name: '하노이 노이바이공항', country: 'VN', type: 'hub' },
  VVTS: { name: '호치민 떤선녓공항', country: 'VN', type: 'hub' },
  VVDN: { name: '다낭국제공항', country: 'VN', type: 'hub' },
  // 태국
  VTBS: { name: '방콕 수완나품공항', country: 'TH', type: 'hub' },
  VTBD: { name: '방콕 돈므앙공항', country: 'TH', type: 'hub' },
  VTSP: { name: '푸켓국제공항', country: 'TH', type: 'hub' },
  // 싱가포르
  WSSS: { name: '싱가포르 창이공항', country: 'SG', type: 'hub' },
  // 말레이시아
  WMKK: { name: '쿠알라룸푸르공항', country: 'MY', type: 'hub' },
  // 필리핀
  RPLL: { name: '마닐라 니노이아키노공항', country: 'PH', type: 'hub' },
  RPVM: { name: '세부 막탄공항', country: 'PH', type: 'hub' },
  // 인도네시아
  WIII: { name: '자카르타 수카르노하타공항', country: 'ID', type: 'hub' },
  WADD: { name: '발리 응우라라이공항', country: 'ID', type: 'hub' },

  // ========== 미주/유럽 (일부) ==========
  KLAX: { name: '로스앤젤레스공항', country: 'US', type: 'hub' },
  KJFK: { name: '뉴욕 JFK공항', country: 'US', type: 'hub' },
  KSFO: { name: '샌프란시스코공항', country: 'US', type: 'hub' },
  PHNL: { name: '호놀룰루공항', country: 'US', type: 'hub' },
  PGUM: { name: '괌 원팻공항', country: 'US', type: 'hub' },
  EGLL: { name: '런던 히드로공항', country: 'GB', type: 'hub' },
  LFPG: { name: '파리 샤를드골공항', country: 'FR', type: 'hub' },
  EDDF: { name: '프랑크푸르트공항', country: 'DE', type: 'hub' },
};

// 국가 코드별 정보
const COUNTRY_INFO = {
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

// 공항 타입별 한글명
const AIRPORT_TYPE_LABELS = {
  hub: '거점공항',
  general: '일반공항',
  private: '사설공항',
  military: '군공항',
  fir: 'FIR/ACC',
};

// 주요 공항 좌표 (NOTAM 지도 표시용)
const AIRPORT_COORDINATES = {
  // 대한민국 민간 공항
  RKSI: { lat: 37.4691, lon: 126.4505 }, // 인천
  RKSS: { lat: 37.5583, lon: 126.7906 }, // 김포
  RKPK: { lat: 35.1795, lon: 128.9381 }, // 김해
  RKPC: { lat: 33.5066, lon: 126.4929 }, // 제주
  RKTN: { lat: 35.8941, lon: 128.6589 }, // 대구
  RKTU: { lat: 36.7166, lon: 127.4991 }, // 청주
  RKJB: { lat: 34.9914, lon: 126.3828 }, // 무안
  RKNY: { lat: 38.0614, lon: 128.6692 }, // 양양
  RKPU: { lat: 35.5935, lon: 129.3518 }, // 울산
  RKJY: { lat: 34.8423, lon: 127.6161 }, // 여수
  RKPS: { lat: 35.0886, lon: 128.0702 }, // 사천
  RKTH: { lat: 35.9879, lon: 129.4203 }, // 포항
  RKJK: { lat: 35.9038, lon: 126.6158 }, // 군산
  RKNW: { lat: 37.4383, lon: 127.9604 }, // 원주
  RKJJ: { lat: 35.1264, lon: 126.8089 }, // 광주
  RKNN: { lat: 37.7536, lon: 128.9440 }, // 강릉
  // 대한민국 군용/기타 공항
  RKSM: { lat: 37.4449, lon: 127.1139 }, // 서울공항 (성남)
  RKSW: { lat: 37.2394, lon: 127.0071 }, // 수원
  RKSO: { lat: 37.0905, lon: 127.0296 }, // 오산
  RKSG: { lat: 36.9617, lon: 127.0311 }, // 평택 (캠프 험프리)
  RKTI: { lat: 36.7233, lon: 127.4981 }, // 청주 공군
  RKTP: { lat: 37.5200, lon: 126.7411 }, // 김포 공군
  RKTY: { lat: 36.6200, lon: 126.3300 }, // 태안
  RKPD: { lat: 35.1456, lon: 128.6969 }, // 진해
  RKTL: { lat: 36.8933, lon: 129.4619 }, // 울진
  RKJM: { lat: 35.8986, lon: 126.9153 }, // 목포
  RKJU: { lat: 35.6761, lon: 127.8881 }, // 예천
  RKPE: { lat: 35.0894, lon: 129.0781 }, // 부산 수영
  RKTE: { lat: 37.0250, lon: 127.8839 }, // 이천
  RKRO: { lat: 37.5261, lon: 126.9667 }, // 용산
  // 대한민국 FIR
  RKRR: { lat: 37.0, lon: 127.5 }, // 인천FIR 중심
  // 일본 주요 공항
  RJTT: { lat: 35.5533, lon: 139.7811 }, // 하네다
  RJAA: { lat: 35.7647, lon: 140.3864 }, // 나리타
  RJBB: { lat: 34.4347, lon: 135.2440 }, // 간사이
  RJOO: { lat: 34.7855, lon: 135.4381 }, // 이타미
  RJFF: { lat: 33.5859, lon: 130.4511 }, // 후쿠오카
  RJCC: { lat: 42.7752, lon: 141.6925 }, // 신치토세
  RJGG: { lat: 34.8584, lon: 136.8050 }, // 추부
  ROAH: { lat: 26.1958, lon: 127.6458 }, // 나하
  RJFT: { lat: 32.8372, lon: 130.8550 }, // 구마모토
  RJFR: { lat: 33.0831, lon: 131.7372 }, // 오이타
  RJFO: { lat: 33.4800, lon: 131.7378 }, // 기타큐슈
  RJFU: { lat: 32.9169, lon: 129.9136 }, // 나가사키
  RJOI: { lat: 34.1436, lon: 132.2356 }, // 이와쿠니
  // 일본 FIR
  RJJJ: { lat: 33.5, lon: 130.5 }, // 후쿠오카FIR
  // 중국
  ZBAA: { lat: 40.0799, lon: 116.6031 }, // 베이징
  ZSPD: { lat: 31.1434, lon: 121.8052 }, // 푸둥
  ZGGG: { lat: 23.3924, lon: 113.2988 }, // 광저우
  ZGSZ: { lat: 22.6393, lon: 113.8107 }, // 선전
  // 대만
  RCTP: { lat: 25.0777, lon: 121.2330 }, // 타오위안
  RCSS: { lat: 25.0694, lon: 121.5517 }, // 쑹산
  // 홍콩/마카오
  VHHH: { lat: 22.3080, lon: 113.9185 }, // 홍콩
  VMMC: { lat: 22.1496, lon: 113.5925 }, // 마카오
};

// 이전 호환성을 위한 별칭
const KOREA_AIRPORTS = Object.fromEntries(
  Object.entries(AIRPORT_DATABASE)
    .filter(([_, info]) => info.country === 'KR')
    .map(([code, info]) => [code, { name: info.name, type: info.type === 'hub' ? 'international' : info.type === 'general' ? 'domestic' : info.type }])
);
const TRAIL_COLOR = '#39FF14';
const TRAIL_DURATION_OPTIONS = [
  { label: '1분', value: 60000 },
  { label: '5분', value: 300000 },
  { label: '10분', value: 600000 },
  { label: '30분', value: 1800000 },
  { label: '1시간', value: 3600000 },
];

// Vercel API base URL - 앱과 웹 모두에서 동작하도록 절대 URL 사용
const API_BASE_URL = 'https://rkpu-viewer.vercel.app';

const getAircraftApiUrl = (lat, lon, radius = 100) => {
  return `${API_BASE_URL}/api/aircraft?lat=${lat}&lon=${lon}&radius=${radius}`;
};

const getAircraftTraceUrl = (hex) => {
  return `${API_BASE_URL}/api/aircraft-trace?hex=${hex}`;
};

const generateColor = (index, total, hueOffset = 0) => `hsl(${(index * (360 / Math.max(total, 1)) + hueOffset) % 360}, 80%, 55%)`;
const altitudeToColor = (altFt) => {
  const t = Math.min(1, Math.max(0, altFt / 8000));
  return t < 0.5 ? `rgb(${Math.round(255 * t * 2)}, 255, 50)` : `rgb(255, ${Math.round(255 * (1 - (t - 0.5) * 2))}, 50)`;
};
const createCirclePolygon = (lon, lat, radius, numPoints = 16) => {
  const coords = [];
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    coords.push([lon + radius * Math.cos(angle), lat + radius * Math.sin(angle)]);
  }
  return [coords];
};
const createObstacleShape = (lon, lat, type, baseRadius = 0.00015) => {
  if (type === 'Tower' || type === 'Antenna') {
    const r = baseRadius * 0.6;
    return [[[lon - r, lat - r], [lon + r, lat - r], [lon + r, lat + r], [lon - r, lat + r], [lon - r, lat - r]]];
  }
  if (type === 'Building') {
    const w = baseRadius * 1.5, h = baseRadius;
    return [[[lon - w, lat - h], [lon + w, lat - h], [lon + w, lat + h], [lon - w, lat + h], [lon - w, lat - h]]];
  }
  return createCirclePolygon(lon, lat, baseRadius, 12);
};
const createRibbonSegment = (coord1, coord2, width = 0.0008) => {
  const [lon1, lat1, alt1] = coord1, [lon2, lat2, alt2] = coord2;
  const dx = lon2 - lon1, dy = lat2 - lat1, len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return null;
  const nx = -dy / len * width, ny = dx / len * width;
  return { coordinates: [[[lon1 + nx, lat1 + ny], [lon1 - nx, lat1 - ny], [lon2 - nx, lat2 - ny], [lon2 + nx, lat2 + ny], [lon1 + nx, lat1 + ny]]], avgAlt: (alt1 + alt2) / 2 };
};

const OBSTACLE_COLORS = { Tower: '#F44336', Building: '#FF5722', Natural: '#4CAF50', Tree: '#8BC34A', Navaid: '#9C27B0', Antenna: '#FF9800', Unknown: '#607D8B' };
const AIRCRAFT_CATEGORY_COLORS = { A0: '#00BCD4', A1: '#4CAF50', A2: '#8BC34A', A3: '#CDDC39', A4: '#FFEB3B', A5: '#FF9800', A6: '#F44336', A7: '#E91E63' };
const ftToM = (ft) => ft * 0.3048;

// ========== 비행 단계 감지 함수 ==========
const detectFlightPhase = (aircraft, airportData) => {
  if (!aircraft) return { phase: 'unknown', phase_kr: '알 수 없음', color: '#9E9E9E' };

  const alt = aircraft.altitude_ft || 0;
  const gs = aircraft.ground_speed || 0;
  const vs = aircraft.vertical_rate || 0;
  const onGround = aircraft.on_ground;

  // 공항 좌표 (기본값: RKPU)
  const airportLat = airportData?.lat || 35.5934;
  const airportLon = airportData?.lon || 129.3518;

  // 공항과의 거리 계산 (NM)
  const distToAirport = Math.sqrt(
    Math.pow((aircraft.lat - airportLat) * 60, 2) +
    Math.pow((aircraft.lon - airportLon) * 60 * Math.cos(airportLat * Math.PI / 180), 2)
  );

  // 비행 단계 판정
  if (onGround || (alt < 100 && gs < 30)) {
    return { phase: 'ground', phase_kr: '지상', color: '#9E9E9E', icon: '🛬' };
  }

  if (alt < 500 && vs > 300 && gs > 60) {
    return { phase: 'takeoff', phase_kr: '이륙', color: '#4CAF50', icon: '🛫' };
  }

  if (alt < 500 && vs < -300 && gs > 60 && distToAirport < 5) {
    return { phase: 'landing', phase_kr: '착륙', color: '#FF9800', icon: '🛬' };
  }

  if (alt < 10000 && vs > 200 && distToAirport < 30) {
    return { phase: 'departure', phase_kr: '출발', color: '#8BC34A', icon: '↗️' };
  }

  if (alt < 10000 && vs < -200 && distToAirport < 30) {
    return { phase: 'approach', phase_kr: '접근', color: '#FF5722', icon: '↘️' };
  }

  if (alt >= 10000 || distToAirport > 30) {
    if (Math.abs(vs) < 300) {
      return { phase: 'cruise', phase_kr: '순항', color: '#2196F3', icon: '✈️' };
    } else if (vs > 0) {
      return { phase: 'climb', phase_kr: '상승', color: '#03A9F4', icon: '↗️' };
    } else {
      return { phase: 'descent', phase_kr: '강하', color: '#00BCD4', icon: '↘️' };
    }
  }

  return { phase: 'enroute', phase_kr: '비행중', color: '#2196F3', icon: '✈️' };
};

// ========== Point-in-Polygon 알고리즘 ==========
const isPointInPolygon = (point, polygon) => {
  if (!polygon || !polygon.length) return false;
  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
};

// ========== 현재 공역 감지 ==========
const detectCurrentAirspace = (aircraft, atcSectors) => {
  if (!aircraft || !atcSectors) return [];

  const results = [];
  const alt = aircraft.altitude_ft || 0;
  const point = [aircraft.lon, aircraft.lat];

  // Check each sector type
  ['CTR', 'TMA', 'ACC', 'FIR'].forEach(sectorType => {
    const sectors = atcSectors[sectorType];
    if (!sectors) return;

    const sectorList = Array.isArray(sectors) ? sectors : [sectors];

    sectorList.forEach(sector => {
      if (!sector) return;

      // For nested arrays (like ACC which has multiple sub-sectors)
      if (Array.isArray(sector) && sector[0]?.coordinates) {
        sector.forEach(subSector => {
          if (checkSectorContains(subSector, point, alt)) {
            results.push({
              type: sectorType,
              ...subSector
            });
          }
        });
      } else if (sector.coordinates) {
        if (checkSectorContains(sector, point, alt)) {
          results.push({
            type: sectorType,
            ...sector
          });
        }
      }
    });
  });

  return results;
};

const checkSectorContains = (sector, point, alt) => {
  if (!sector?.coordinates) return false;

  // Check altitude limits
  const floor = sector.floor_ft || 0;
  const ceiling = sector.ceiling_ft || 60000;
  if (alt < floor || alt > ceiling) return false;

  // Check if point is in polygon
  const coords = sector.coordinates;
  if (coords.length === 0) return false;

  // Handle nested polygon format [[[ ]]]
  const polygon = Array.isArray(coords[0][0]) ? coords[0] : coords;
  return isPointInPolygon(point, polygon);
};

// ========== 가장 가까운 Waypoint 찾기 ==========
const findNearestWaypoints = (aircraft, waypoints, limit = 5) => {
  if (!aircraft || !waypoints) return [];

  const results = waypoints.map(wp => {
    const dist = Math.sqrt(
      Math.pow((wp.lat - aircraft.lat) * 60, 2) +
      Math.pow((wp.lon - aircraft.lon) * 60 * Math.cos(aircraft.lat * Math.PI / 180), 2)
    );

    // 진행 방향 기준으로 앞에 있는지 확인
    const bearing = Math.atan2(
      (wp.lon - aircraft.lon) * Math.cos(aircraft.lat * Math.PI / 180),
      wp.lat - aircraft.lat
    ) * 180 / Math.PI;

    const trackDiff = Math.abs(((bearing - (aircraft.track || 0) + 180) % 360) - 180);
    const isAhead = trackDiff < 90;

    // 예상 도착 시간 계산 (분)
    const gs = aircraft.ground_speed || 200; // knots
    const etaMinutes = gs > 0 ? (dist / gs) * 60 : null;

    return {
      ...wp,
      distance_nm: dist,
      isAhead,
      etaMinutes,
      bearing
    };
  })
  .filter(wp => wp.isAhead && wp.distance_nm < 100) // 100NM 이내, 진행방향
  .sort((a, b) => a.distance_nm - b.distance_nm)
  .slice(0, limit);

  return results;
};

// ========== 현재 절차(SID/STAR/APCH) 감지 ==========
const detectCurrentProcedure = (aircraft, procedures, flightPhase) => {
  if (!aircraft || !procedures) return null;

  const point = [aircraft.lon, aircraft.lat];
  const alt = aircraft.altitude_ft || 0;

  // 비행 단계에 따라 확인할 절차 유형 결정
  let procedureTypes = [];
  if (flightPhase === 'departure' || flightPhase === 'takeoff') {
    procedureTypes = ['SID'];
  } else if (flightPhase === 'approach' || flightPhase === 'landing') {
    procedureTypes = ['APPROACH', 'STAR'];
  } else {
    procedureTypes = ['SID', 'STAR', 'APPROACH'];
  }

  let closestProcedure = null;
  let minDistance = Infinity;

  procedureTypes.forEach(type => {
    const procs = procedures[type];
    if (!procs) return;

    Object.entries(procs).forEach(([name, proc]) => {
      if (!proc.segments) return;

      proc.segments.forEach(segment => {
        if (!segment.coordinates) return;

        // 세그먼트의 각 점과의 거리 확인
        segment.coordinates.forEach(coord => {
          const dist = Math.sqrt(
            Math.pow((coord[1] - aircraft.lat) * 60, 2) +
            Math.pow((coord[0] - aircraft.lon) * 60 * Math.cos(aircraft.lat * Math.PI / 180), 2)
          );

          if (dist < minDistance && dist < 3) { // 3NM 이내
            minDistance = dist;
            closestProcedure = {
              type,
              name: proc.display_name || name,
              segment: segment.segment_name,
              distance_nm: dist
            };
          }
        });
      });
    });
  });

  return closestProcedure;
};

// Parse NOTAM Q-line coordinates (e.g., "3505N12804E005" -> {lat, lon, radius})
const parseNotamCoordinates = (fullText) => {
  if (!fullText) return null;
  // Q-line format: Q) FIR/QCODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORD
  const qLineMatch = fullText.match(/Q\)\s*\S+\/\S+\/\S+\/\S+\/\S+\/(\d{3})\/(\d{3})\/(\d{4})([NS])(\d{5})([EW])(\d{3})/);
  if (!qLineMatch) return null;

  const [, lowerAlt, upperAlt, latDeg, latDir, lonDeg, lonDir, radiusNM] = qLineMatch;

  // Parse latitude: DDMM format
  const latDegrees = parseInt(latDeg.substring(0, 2), 10);
  const latMinutes = parseInt(latDeg.substring(2, 4), 10);
  let lat = latDegrees + latMinutes / 60;
  if (latDir === 'S') lat = -lat;

  // Parse longitude: DDDMM format
  const lonDegrees = parseInt(lonDeg.substring(0, 3), 10);
  const lonMinutes = parseInt(lonDeg.substring(3, 5), 10);
  let lon = lonDegrees + lonMinutes / 60;
  if (lonDir === 'W') lon = -lon;

  return {
    lat,
    lon,
    radiusNM: parseInt(radiusNM, 10),
    lowerAlt: parseInt(lowerAlt, 10) * 100, // FL to feet
    upperAlt: parseInt(upperAlt, 10) * 100,
  };
};

// Get NOTAM coordinates - try Q-line first, fallback to airport coordinates
const getNotamDisplayCoords = (notam) => {
  // First try to parse from Q-line
  const qCoords = parseNotamCoordinates(notam.full_text);
  if (qCoords) return qCoords;

  // Fallback: use airport coordinates from database
  const airportCoords = AIRPORT_COORDINATES[notam.location];
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

// Parse NOTAM type from full text (NOTAMN=New, NOTAMR=Replace, NOTAMC=Cancel)
const getNotamType = (fullText) => {
  if (!fullText) return 'N';
  // Look for NOTAMN, NOTAMR, NOTAMC in the text
  if (fullText.includes('NOTAMC')) return 'C'; // Cancel - cancels another NOTAM
  if (fullText.includes('NOTAMR')) return 'R'; // Replace - replaces another NOTAM
  return 'N'; // New - default
};

// Extract cancelled/replaced NOTAM reference (e.g., "A1081/24 NOTAMC A1045/24" -> "A1045/24")
const getCancelledNotamRef = (fullText) => {
  if (!fullText) return null;
  // Pattern: NOTAMC or NOTAMR followed by the reference (e.g., "NOTAMC A1045/24")
  const match = fullText.match(/NOTAM[CR]\s+([A-Z]\d{4}\/\d{2})/);
  return match ? match[1] : null;
};

// Helper: Parse NOTAM date from YYMMDDHHMM format
const parseNotamDateString = (dateStr) => {
  if (!dateStr || dateStr.length < 10) return null;
  const year = 2000 + parseInt(dateStr.substring(0, 2), 10);
  const month = parseInt(dateStr.substring(2, 4), 10) - 1;
  const day = parseInt(dateStr.substring(4, 6), 10);
  const hour = parseInt(dateStr.substring(6, 8), 10);
  const minute = parseInt(dateStr.substring(8, 10), 10);
  return new Date(Date.UTC(year, month, day, hour, minute));
};

// Helper: Extract start/end dates from NOTAM full_text (Item B and C)
const extractDatesFromFullText = (fullText) => {
  if (!fullText) return { start: null, end: null };

  // Item B: start date B) YYMMDDHHMM
  const startMatch = fullText.match(/B\)\s*(\d{10})/);
  const start = startMatch ? parseNotamDateString(startMatch[1]) : null;

  // Item C: end date C) YYMMDDHHMM or PERM or EST
  const endMatch = fullText.match(/C\)\s*(\d{10}|PERM)/);
  let end = null;
  if (endMatch) {
    if (endMatch[1] === 'PERM') {
      end = new Date(2099, 11, 31); // Permanent = far future
    } else {
      end = parseNotamDateString(endMatch[1]);
    }
  }

  return { start, end };
};

// Check if NOTAM is currently active or will be active in the future
// Returns: 'active' (currently valid), 'future' (will be valid), or false (expired/cancelled)
const getNotamValidity = (notam, cancelledSet = new Set()) => {
  // Skip NOTAMC (cancel) type - these just cancel other NOTAMs
  const notamType = getNotamType(notam.full_text);
  if (notamType === 'C') return false;

  // Check if this NOTAM has been cancelled by another NOTAM
  if (cancelledSet.has(notam.notam_number)) return false;

  const now = new Date();
  let startDate = null;
  let endDate = null;

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

// Wrapper for backward compatibility - returns true for active or future NOTAMs
const isNotamActive = (notam, cancelledSet = new Set()) => {
  const validity = getNotamValidity(notam, cancelledSet);
  return validity === 'active' || validity === 'future';
};

// Build a set of cancelled NOTAM references from NOTAMC and NOTAMR
const buildCancelledNotamSet = (notams) => {
  const cancelledSet = new Set();
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

// Create circle polygon for NOTAM radius (in nautical miles)
const createNotamCircle = (lon, lat, radiusNM, numPoints = 32) => {
  const coords = [];
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

const AIRCRAFT_MODEL_MAP = {
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

const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/light-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  black: { version: 8, name: 'Radar Black', sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#000000' } }] }
};

const PROCEDURE_CHARTS = {
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

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [data, setData] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [is3DView, setIs3DView] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showSatellite, setShowSatellite] = useState(false);
  const [showBuildings, setShowBuildings] = useState(true);

  const [chartBounds, setChartBounds] = useState({});
  const [activeCharts, setActiveCharts] = useState({});
  const [chartOpacities, setChartOpacities] = useState({});

  // Accordion states - all sections
  const [layersExpanded, setLayersExpanded] = useState(true);
  const [aircraftExpanded, setAircraftExpanded] = useState(true);
  const [sidExpanded, setSidExpanded] = useState(false);
  const [starExpanded, setStarExpanded] = useState(false);
  const [apchExpanded, setApchExpanded] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  // Mobile panel state
  const [isPanelOpen, setIsPanelOpen] = useState(window.innerWidth > 768);

  // METAR/TAF popup states (separate for METAR and TAF)
  const [showMetarPopup, setShowMetarPopup] = useState(false);
  const [showTafPopup, setShowTafPopup] = useState(false);
  const [metarPinned, setMetarPinned] = useState(false);
  const [tafPinned, setTafPinned] = useState(false);

  const [showWaypoints, setShowWaypoints] = useState(false);
  const [showObstacles, setShowObstacles] = useState(false);
  const [showAirspace, setShowAirspace] = useState(true);
  const [show3DAltitude, setShow3DAltitude] = useState(true);
  const [showTerrain, setShowTerrain] = useState(true);

  const [sidVisible, setSidVisible] = useState({});
  const [starVisible, setStarVisible] = useState({});
  const [apchVisible, setApchVisible] = useState({});
  const [procColors, setProcColors] = useState({ SID: {}, STAR: {}, APPROACH: {} });

  const [showAircraft, setShowAircraft] = useState(true);
  const [showAircraftTrails, setShowAircraftTrails] = useState(true);
  const [show3DAircraft, setShow3DAircraft] = useState(true);
  const [trailDuration, setTrailDuration] = useState(60000); // 1분 기본값 (히스토리 길이)
  const [headingPrediction, setHeadingPrediction] = useState(30); // 헤딩 예측 시간 (초) - 30초 기본
  const [labelOffset, setLabelOffset] = useState({ x: 1.0, y: 0 }); // 라벨 오프셋 (사용자 드래그로 조절)
  const [isDraggingLabel, setIsDraggingLabel] = useState(false); // 라벨 드래그 중인지
  const [aircraft, setAircraft] = useState([]);
  const [aircraftTrails, setAircraftTrails] = useState({});
  const [tracesLoaded, setTracesLoaded] = useState(new Set()); // 이미 trace 로드된 항공기
  const [selectedAircraft, setSelectedAircraft] = useState(null); // 선택된 항공기 상세정보
  const [aircraftPhoto, setAircraftPhoto] = useState(null); // 선택된 항공기 사진 (airport-data.com)
  const [aircraftPhotoLoading, setAircraftPhotoLoading] = useState(false);
  const [aircraftDetails, setAircraftDetails] = useState(null); // hexdb.io 기체 상세정보 (MSN, 제조년도 등)
  const [aircraftDetailsLoading, setAircraftDetailsLoading] = useState(false);
  const [flightSchedule, setFlightSchedule] = useState(null); // aviationstack 스케줄 정보
  const [flightScheduleLoading, setFlightScheduleLoading] = useState(false);
  const [flightTrack, setFlightTrack] = useState(null); // OpenSky 비행경로 데이터
  const [flightTrackLoading, setFlightTrackLoading] = useState(false);
  const [showAircraftPanel, setShowAircraftPanel] = useState(false); // 항공기 상세 패널 표시
  const [graphHoverData, setGraphHoverData] = useState(null); // 고도 그래프 hover 데이터
  const aircraftIntervalRef = useRef(null);
  // Collapsible sections state
  const [sectionExpanded, setSectionExpanded] = useState({
    flightStatus: true,
    aircraftInfo: true,
    schedule: true,
    graph: true,
    position: true
  });
  const toggleSection = (section) => setSectionExpanded(prev => ({ ...prev, [section]: !prev[section] }));

  // aviationstack API key (환경변수 또는 직접 설정)
  const AVIATIONSTACK_API_KEY = import.meta.env.VITE_AVIATIONSTACK_API_KEY || '';

  // ICAO → IATA 항공사 코드 변환 (한국 및 주요 항공사)
  const ICAO_TO_IATA = {
    'KAL': 'KE', 'AAR': 'OZ', 'JNA': 'LJ', 'JJA': '7C', 'TWB': 'TW', 'ABL': 'BX', 'EOK': 'ZE', 'ASV': 'RF',
    'ANA': 'NH', 'JAL': 'JL', 'CPA': 'CX', 'CSN': 'CZ', 'CES': 'MU', 'CCA': 'CA', 'HVN': 'VN', 'THA': 'TG',
    'SIA': 'SQ', 'MAS': 'MH', 'EVA': 'BR', 'CAL': 'CI', 'UAL': 'UA', 'AAL': 'AA', 'DAL': 'DL',
    'AFR': 'AF', 'BAW': 'BA', 'DLH': 'LH', 'KLM': 'KL', 'QFA': 'QF', 'UAE': 'EK', 'ETD': 'EY',
    'FDX': 'FX', 'UPS': '5X', 'GTI': 'GT', // 화물기
  };

  // 기종별 실루엣 SVG (inline data URL - 외부 의존성 없음)
  const AIRCRAFT_SILHOUETTE = `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" fill="#64b5f6">
      <path d="M95 20L85 17V15L50 12V8L48 6H46L44 8V12L15 14V16L5 18V20L5 22L15 24V26L44 28V32L46 34H48L50 32V28L85 25V23L95 20Z"/>
      <circle cx="20" cy="20" r="3" fill="#333"/>
      <circle cx="70" cy="20" r="3" fill="#333"/>
    </svg>
  `)}`;

  // 기종 그룹별 색상
  const AIRCRAFT_COLORS = {
    'B7': '#4fc3f7', // 보잉 737
    'B77': '#29b6f6', // 보잉 777
    'B78': '#03a9f4', // 보잉 787
    'B74': '#0288d1', // 보잉 747
    'A3': '#ab47bc', // 에어버스 A3xx
    'A38': '#7b1fa2', // 에어버스 A380
    'AT': '#66bb6a', // ATR
    'DH': '#43a047', // Dash
    'E': '#ffa726', // 엠브라에르
    'C': '#ef5350', // 세스나/비즈젯
  };

  // 기종 코드로 실루엣 이미지 가져오기
  const getAircraftImage = (typeCode) => {
    return AIRCRAFT_SILHOUETTE;
  };

  // 기종 코드로 색상 가져오기
  const getAircraftColor = (typeCode) => {
    if (!typeCode) return '#64b5f6';
    const code = typeCode.toUpperCase();
    for (const [prefix, color] of Object.entries(AIRCRAFT_COLORS)) {
      if (code.startsWith(prefix)) return color;
    }
    return '#64b5f6';
  };


  const [weatherData, setWeatherData] = useState(null);
  const weatherIntervalRef = useRef(null);

  // Aviation weather layers
  const [showRadar, setShowRadar] = useState(false);
  const [showSatelliteWx, setShowSatelliteWx] = useState(false);
  const [showLightning, setShowLightning] = useState(false);
  const [showSigmet, setShowSigmet] = useState(false);
    const [wxLayersExpanded, setWxLayersExpanded] = useState(false);

  // Weather data states
  const [radarData, setRadarData] = useState(null);
  const [satelliteWxData, setSatelliteWxData] = useState(null);
  const [lightningData, setLightningData] = useState(null);
  const [sigmetData, setSigmetData] = useState(null);
    const [llwsData, setLlwsData] = useState(null);
  const [notamData, setNotamData] = useState(null);

  // Right panel weather detail state
  const [showWxPanel, setShowWxPanel] = useState(false);
  const [wxPanelTab, setWxPanelTab] = useState('sigmet'); // sigmet, notam, llws, lightning

  // ATC Sectors panel
  const [showAtcPanel, setShowAtcPanel] = useState(false);
  const [atcData, setAtcData] = useState(null);
  const [atcExpanded, setAtcExpanded] = useState({ ACC: true, TMA: false, CTR: false });
  const [selectedAtcSectors, setSelectedAtcSectors] = useState(new Set());

  // ATC Only Mode (Radar Display) - 검은 배경 + 거리 링
  const [atcOnlyMode, setAtcOnlyMode] = useState(false);
  const [radarRange, setRadarRange] = useState(100); // 레이더 최대 범위 (nm) - 100nm 기본
  const [radarBlackBackground, setRadarBlackBackground] = useState(true); // 레이더뷰 검은 배경 on/off

  // NOTAM panel
  const [showNotamPanel, setShowNotamPanel] = useState(false);
  const [notamLoading, setNotamLoading] = useState(false);
  const [notamError, setNotamError] = useState(null);
  const [notamFilter, setNotamFilter] = useState(''); // 필터링용 검색어
  const [notamLocationFilter, setNotamLocationFilter] = useState(''); // 전체 지역
  const [notamExpanded, setNotamExpanded] = useState({});
  const [notamPeriod, setNotamPeriod] = useState('current'); // 'current', '1month', '1year', 'all'

  // NOTAM map layer toggle - Set of location codes to show on map
  const [showNotamOnMap, setShowNotamOnMap] = useState(false);
  const [notamLocationsOnMap, setNotamLocationsOnMap] = useState(new Set()); // e.g., Set(['RKPU', 'RKTN'])

  // Korea Airspace Data (Routes, Waypoints, NAVAIDs, Airspaces)
  const [koreaAirspaceData, setKoreaAirspaceData] = useState(null);
  const [showKoreaRoutes, setShowKoreaRoutes] = useState(false);
  const [showKoreaWaypoints, setShowKoreaWaypoints] = useState(false);
  const [showKoreaNavaids, setShowKoreaNavaids] = useState(false);
  const [showKoreaAirspaces, setShowKoreaAirspaces] = useState(false);
  const [koreaRoutesExpanded, setKoreaRoutesExpanded] = useState(false);

  // Three.js refs for GLB models
  const threeSceneRef = useRef(null);
  const threeCameraRef = useRef(null);
  const threeRendererRef = useRef(null);
  const modelCacheRef = useRef({});
  const gltfLoaderRef = useRef(null);
  const aircraftMeshesRef = useRef({});
  const procedureObjectsRef = useRef([]);

  useEffect(() => {
    fetch('/aviation_data.json')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        const sidKeys = Object.keys(json.procedures?.SID || {});
        const starKeys = Object.keys(json.procedures?.STAR || {});
        const apchKeys = Object.keys(json.procedures?.APPROACH || {});
        setSidVisible(Object.fromEntries(sidKeys.map((k) => [k, false])));
        setStarVisible(Object.fromEntries(starKeys.map((k) => [k, false])));
        setApchVisible(Object.fromEntries(apchKeys.map((k) => [k, false])));
        setProcColors({
          SID: Object.fromEntries(sidKeys.map((k, i) => [k, generateColor(i, sidKeys.length, 120)])),
          STAR: Object.fromEntries(starKeys.map((k, i) => [k, generateColor(i, starKeys.length, 30)])),
          APPROACH: Object.fromEntries(apchKeys.map((k, i) => [k, generateColor(i, apchKeys.length, 200)])),
        });
      });
  }, []);

  useEffect(() => {
    fetch('/charts/chart_bounds.json')
      .then((res) => res.json())
      .then((bounds) => {
        setChartBounds(bounds);
        setChartOpacities(Object.fromEntries(Object.keys(bounds).map(k => [k, 0.7])));
      });
  }, []);

  useEffect(() => {
    fetch('/atc_sectors.json')
      .then((res) => res.json())
      .then((data) => setAtcData(data))
      .catch((err) => console.warn('Failed to load ATC sectors:', err));
  }, []);

  // Load Korea Airspace Data (Routes, Waypoints, NAVAIDs, Airspaces)
  useEffect(() => {
    fetch('/data/korea_airspace.json')
      .then((res) => res.json())
      .then((data) => {
        setKoreaAirspaceData(data);
        console.log(`Loaded Korea airspace: ${data.waypoints?.length} waypoints, ${data.routes?.length} routes, ${data.navaids?.length} navaids, ${data.airspaces?.length} airspaces (AIRAC ${data.metadata?.airac})`);
      })
      .catch((err) => console.warn('Failed to load Korea airspace data:', err));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUTC = (date) => date.toISOString().slice(11, 19) + 'Z';
  const formatKST = (date) => new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 19) + 'L';

  const parseMetarTime = (metar) => {
    if (!metar?.obsTime) return '';
    try {
      // Format: YYYYMMDDHHMM
      const y = metar.obsTime.slice(0, 4);
      const m = metar.obsTime.slice(4, 6);
      const d = metar.obsTime.slice(6, 8);
      const h = metar.obsTime.slice(8, 10);
      const min = metar.obsTime.slice(10, 12);
      return `${parseInt(d)}일 ${h}${min}L`;
    } catch (e) {}
    return metar.obsTime;
  };

  const fetchWeatherData = useCallback(async () => {
    try {
      // Use proxy API to avoid CORS issues with KMA API
      // Add cache buster to ensure fresh data from KMA AMOS
      const cacheBuster = `&_t=${Date.now()}`;
      const metarUrl = `${API_BASE_URL}/api/weather?type=metar${cacheBuster}`;
      const tafUrl = `${API_BASE_URL}/api/weather?type=taf${cacheBuster}`;

      const [metarRes, tafRes] = await Promise.all([
        fetch(metarUrl),
        fetch(tafUrl)
      ]);

      const [metarJson, tafJson] = await Promise.all([
        metarRes.json(),
        tafRes.json()
      ]);

      const metarData = metarJson?.[0] || null;
      const tafData = tafJson?.[0] || null;

      setWeatherData({ metar: metarData, taf: tafData });
    } catch (e) {
      console.error('Weather fetch failed:', e);
    }
  }, []);

  // NOTAM cache age state for UI display
  const [notamCacheAge, setNotamCacheAge] = useState(null);

  // NOTAM data fetching with caching - always use complete DB with period filtering
  const fetchNotamData = useCallback(async (period = notamPeriod, forceRefresh = false) => {
    // 1. 먼저 캐시 확인 (강제 새로고침이 아닌 경우)
    if (!forceRefresh) {
      const cachedData = getNotamCache(period);
      if (cachedData) {
        setNotamData(cachedData);
        setNotamCacheAge(getNotamCacheAge(period));
        setNotamLoading(false);
        return;
      }
    }

    setNotamLoading(true);
    setNotamError(null);
    try {
      const baseUrl = `${API_BASE_URL}/api/notam`;
      const params = new URLSearchParams();

      // Always use complete DB with appropriate period filter
      params.set('source', 'complete');
      params.set('period', period); // 'current', '1month', '1year', or 'all'

      // Use fixed Korea+Japan region bounds instead of map bounds
      // This ensures all Korean airports are always included
      // Korea: 33-43N, 124-132E, Japan nearby: extend to 145E
      params.set('bounds', '32,123,44,146');

      const url = baseUrl + '?' + params.toString();

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();

      // 2. 캐시에 저장
      setNotamCache(period, json);
      setNotamCacheAge(0);

      setNotamData(json);
    } catch (e) {
      console.error('NOTAM fetch failed:', e);
      setNotamError(e.message);

      // 3. 네트워크 에러 시 만료된 메모리 캐시라도 사용 시도
      const expiredCache = notamMemoryCache[period];
      if (expiredCache) {
        setNotamData(expiredCache.data);
        setNotamError('캐시된 데이터 사용 중 (네트워크 오류)');
      }
    } finally {
      setNotamLoading(false);
    }
  }, [notamPeriod]);

  // Fetch NOTAM when panel is opened or period changes
  useEffect(() => {
    if (showNotamPanel) {
      fetchNotamData(notamPeriod);
    }
  }, [showNotamPanel, notamPeriod, fetchNotamData]);

  useEffect(() => {
    if (!data?.airport) return;
    fetchWeatherData();
    weatherIntervalRef.current = setInterval(fetchWeatherData, 5 * 60 * 1000);
    return () => clearInterval(weatherIntervalRef.current);
  }, [data?.airport, fetchWeatherData]);

  // Fetch aviation weather layers when toggled
  useEffect(() => {
    const baseUrl = `${API_BASE_URL}/api/weather`;

    if (showRadar) {
      fetch(`${baseUrl}?type=radar`).then(r => r.json()).then(setRadarData).catch(console.error);
      const interval = setInterval(() => {
        fetch(`${baseUrl}?type=radar`).then(r => r.json()).then(setRadarData).catch(console.error);
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [showRadar]);

  useEffect(() => {
    const baseUrl = `${API_BASE_URL}/api/weather`;

    if (showSatelliteWx) {
      fetch(`${baseUrl}?type=satellite`).then(r => r.json()).then(setSatelliteWxData).catch(console.error);
    }
  }, [showSatelliteWx]);

  useEffect(() => {
    const baseUrl = `${API_BASE_URL}/api/weather`;

    if (showLightning) {
      fetch(`${baseUrl}?type=lightning`).then(r => r.json()).then(setLightningData).catch(console.error);
      const interval = setInterval(() => {
        fetch(`${baseUrl}?type=lightning`).then(r => r.json()).then(setLightningData).catch(console.error);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [showLightning]);

  useEffect(() => {
    const baseUrl = `${API_BASE_URL}/api/weather`;

    if (showSigmet || showWxPanel) {
      fetch(`${baseUrl}?type=sigmet`).then(r => r.json()).then(setSigmetData).catch(console.error);
      fetch(`${baseUrl}?type=llws`).then(r => r.json()).then(setLlwsData).catch(console.error);
      fetch(`${baseUrl}?type=notam`).then(r => r.json()).then(setNotamData).catch(console.error);
    }
  }, [showSigmet, showWxPanel]);


  // Initialize GLB loader
  useEffect(() => {
    gltfLoaderRef.current = new GLTFLoader();
    const modelsToLoad = ['/b737.glb', '/b777.glb', '/A380.glb', '/helicopter.glb'];

    modelsToLoad.forEach(url => {
      gltfLoaderRef.current.load(url, (gltf) => {
        const obj = gltf.scene.clone();
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = (url.includes('helicopter') ? 30 : 50) / maxDim;
        obj.scale.set(scale, scale, scale);
        modelCacheRef.current[url] = obj;
        console.log('Loaded model:', url);
      }, undefined, (err) => console.warn('Failed to load:', url, err));
    });
  }, []);

  const getModelForAircraft = useCallback((type, category) => {
    const upperType = (type || '').toUpperCase();
    for (const [key, url] of Object.entries(AIRCRAFT_MODEL_MAP)) {
      if (upperType.includes(key)) return url;
    }
    if (upperType.includes('HELI') || category === 'A7') return '/helicopter.glb';
    return '/b737.glb';
  }, []);

  const parseMetar = (metar) => {
    if (!metar) return null;
    const result = { wind: '', visibility: '', temp: '', rvr: '', ceiling: '', cloud: '' };
    if (metar.wdir !== undefined && metar.wspd !== undefined) {
      result.wind = `${String(metar.wdir).padStart(3, '0')}°/${metar.wspd}kt`;
      if (metar.wgst) result.wind += `G${metar.wgst}`;
      if (metar.wspdMs) result.windMs = `${metar.wspdMs}m/s`;
    }
    if (metar.visib !== undefined) result.visibility = metar.visib >= 10 ? '10km+' : `${metar.visib}km`;
    if (metar.temp !== undefined) {
      result.temp = `${metar.temp}°C`;
      if (metar.dewp !== undefined) result.temp += `/${metar.dewp}°C`;
    }
    // RVR
    if (metar.lRvr || metar.rRvr) {
      const rvrs = [];
      if (metar.lRvr) rvrs.push(`L${metar.lRvr}m`);
      if (metar.rRvr) rvrs.push(`R${metar.rRvr}m`);
      result.rvr = `RVR ${rvrs.join('/')}`;
    }
    // Ceiling
    if (metar.ceiling) result.ceiling = `CIG ${metar.ceiling}ft`;
    // Cloud
    if (metar.cloud !== undefined && metar.cloud !== null) result.cloud = `${metar.cloud}/10`;
    // Humidity
    if (metar.humidity) result.humidity = `${metar.humidity}%`;
    // Rain
    if (metar.rain) result.rain = `${metar.rain}mm`;
    return result;
  };

  // 개별 항공기의 과거 위치 히스토리 로드
  const loadAircraftTrace = useCallback(async (hex) => {
    try {
      const response = await fetch(getAircraftTraceUrl(hex));
      const result = await response.json();
      const ac = result.ac?.[0];
      if (!ac || !ac.trace) return null;

      // trace 배열: [timestamp, lat, lon, altitude(feet?), ...]
      const tracePoints = [];
      const now = Date.now();
      ac.trace.forEach(point => {
        if (point && point.length >= 4) {
          const timestamp = point[0] * 1000; // 초 -> 밀리초
          if (now - timestamp <= trailDuration) {
            tracePoints.push({
              lat: point[1],
              lon: point[2],
              altitude_m: ftToM(point[3] || 0),
              timestamp
            });
          }
        }
      });
      return tracePoints;
    } catch (e) {
      console.error(`Failed to load trace for ${hex}:`, e);
      return null;
    }
  }, [trailDuration]);

  const fetchAircraftData = useCallback(async () => {
    if (!data?.airport) return;
    try {
      const { lat, lon } = data.airport;
      const response = await fetch(getAircraftApiUrl(lat, lon, 100));
      const result = await response.json();
      const aircraftData = result.ac || [];

      const processed = aircraftData.filter(ac => ac.lat && ac.lon).map(ac => ({
        hex: ac.hex, callsign: ac.flight?.trim() || ac.hex, type: ac.t || 'Unknown',
        category: ac.category || 'A0', lat: ac.lat, lon: ac.lon,
        altitude_ft: ac.alt_baro || ac.alt_geom || 0, altitude_m: ftToM(ac.alt_baro || ac.alt_geom || 0),
        ground_speed: ac.gs || 0, track: ac.track || 0, on_ground: ac.alt_baro === 'ground' || ac.ground,
        // 추가 ADS-B 정보
        vertical_rate: ac.baro_rate || ac.geom_rate || 0, // ft/min
        squawk: ac.squawk || '',
        emergency: ac.emergency || '',
        registration: ac.r || '',
        icao_type: ac.t || '',
        operator: ac.ownOp || '',
        origin: ac.orig || '', // 출발 공항 (있으면)
        destination: ac.dest || '', // 도착 공항 (있으면)
        nav_altitude: ac.nav_altitude_mcp || ac.nav_altitude_fms || null,
        nav_heading: ac.nav_heading || null,
        ias: ac.ias || 0, // indicated airspeed
        tas: ac.tas || 0, // true airspeed
        mach: ac.mach || 0,
        mag_heading: ac.mag_heading || ac.track || 0,
        true_heading: ac.true_heading || ac.track || 0,
        timestamp: Date.now(),
      }));

      // 새로운 항공기들의 trace 로드 (이미 로드한 항공기 제외)
      // 새로고침 시 모든 비행중인 항공기의 이전 항적을 로드
      const newAircraft = processed.filter(ac => !tracesLoaded.has(ac.hex) && !ac.on_ground);
      if (newAircraft.length > 0) {
        // 처음 로드 시에는 모든 항공기 로드, 이후에는 10개씩 로드
        const isFirstLoad = tracesLoaded.size === 0;
        const maxLoad = isFirstLoad ? newAircraft.length : 10;
        const toLoad = newAircraft.slice(0, maxLoad);

        // 병렬로 trace 로드 (처음에는 모두, 이후에는 일부)
        const tracePromises = toLoad.map(ac => loadAircraftTrace(ac.hex).then(trace => ({ hex: ac.hex, trace })));
        const traces = await Promise.all(tracePromises);

        setTracesLoaded(prev => {
          const next = new Set(prev);
          toLoad.forEach(ac => next.add(ac.hex));
          return next;
        });

        setAircraftTrails(prev => {
          const trails = { ...prev };
          traces.forEach(({ hex, trace }) => {
            if (trace && trace.length > 0) {
              trails[hex] = trace;
            }
          });
          return trails;
        });
      }

      setAircraftTrails(prev => {
        const trails = { ...prev };
        processed.forEach(ac => {
          if (!trails[ac.hex]) trails[ac.hex] = [];
          const trail = trails[ac.hex];
          const last = trail[trail.length - 1];
          if (!last || last.lat !== ac.lat || last.lon !== ac.lon) {
            trail.push({ lat: ac.lat, lon: ac.lon, altitude_m: ac.altitude_m, altitude_ft: ac.altitude_ft, timestamp: ac.timestamp });
          }
          while (trail.length > 0 && Date.now() - trail[0].timestamp > trailDuration) trail.shift();
        });
        const activeHexes = new Set(processed.map(ac => ac.hex));
        Object.keys(trails).forEach(hex => { if (!activeHexes.has(hex)) delete trails[hex]; });
        return trails;
      });
      setAircraft(processed);
    } catch (e) { console.error('Aircraft fetch failed:', e); }
  }, [data?.airport, trailDuration, tracesLoaded, loadAircraftTrace]);

  useEffect(() => {
    if (!showAircraft || !data?.airport || !mapLoaded) return;
    fetchAircraftData();
    aircraftIntervalRef.current = setInterval(fetchAircraftData, AIRCRAFT_UPDATE_INTERVAL);
    return () => clearInterval(aircraftIntervalRef.current);
  }, [showAircraft, data?.airport, mapLoaded, fetchAircraftData]);

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES.dark,
      center: [129.3518, 35.5934],
      zoom: 11,
      pitch: 60,
      bearing: -30,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

    map.current.on('load', () => {
      map.current.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
      map.current.addLayer({ id: 'sky', type: 'sky', paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0.0, 90.0], 'sky-atmosphere-sun-intensity': 15 } });
      map.current.addLayer({
        id: '3d-buildings', source: 'composite', 'source-layer': 'building', type: 'fill-extrusion', minzoom: 12,
        paint: { 'fill-extrusion-color': '#aaa', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'min_height'], 'fill-extrusion-opacity': 0.6 }
      });
      map.current.addSource('runway', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[129.3505, 35.5890], [129.3530, 35.5978]] } } });
      map.current.addLayer({ id: 'runway', type: 'line', source: 'runway', paint: { 'line-color': '#FFFFFF', 'line-width': 8 } });

      // Create custom triangle arrow image for trail arrowheads
      const arrowSize = 24;
      const arrowCanvas = document.createElement('canvas');
      arrowCanvas.width = arrowSize;
      arrowCanvas.height = arrowSize;
      const ctx = arrowCanvas.getContext('2d');
      ctx.fillStyle = TRAIL_COLOR;
      ctx.beginPath();
      ctx.moveTo(arrowSize / 2, 0); // Top point
      ctx.lineTo(arrowSize, arrowSize); // Bottom right
      ctx.lineTo(arrowSize / 2, arrowSize * 0.7); // Center notch
      ctx.lineTo(0, arrowSize); // Bottom left
      ctx.closePath();
      ctx.fill();
      map.current.addImage('trail-arrow', ctx.getImageData(0, 0, arrowSize, arrowSize), { sdf: true });

      // Force resize for Android WebView compatibility
      // WebView often has delayed container sizing, so we need aggressive resize calls
      const doResize = () => {
        if (map.current) {
          map.current.resize();
          // Also trigger a re-render by slightly adjusting and restoring center
          const center = map.current.getCenter();
          map.current.setCenter([center.lng + 0.0001, center.lat]);
          setTimeout(() => {
            if (map.current) map.current.setCenter(center);
          }, 50);
        }
      };

      doResize();
      setTimeout(doResize, 100);
      setTimeout(doResize, 300);
      setTimeout(doResize, 500);
      setTimeout(doResize, 1000);
      setTimeout(doResize, 2000);
      setTimeout(doResize, 3000);
      setTimeout(doResize, 5000);

      // Keep checking for 10 seconds after load
      const resizeInterval = setInterval(() => {
        if (map.current) map.current.resize();
      }, 1000);
      setTimeout(() => clearInterval(resizeInterval), 10000);

      setMapLoaded(true);
    });

    // Window resize handler for WebView compatibility
    const handleResize = () => {
      if (map.current) map.current.resize();
    };
    window.addEventListener('resize', handleResize);

    // Also listen for orientation change
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 100);
      setTimeout(handleResize, 500);
    });

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (map.current) map.current.resize();
    });
    if (mapContainer.current) {
      resizeObserver.observe(mapContainer.current);
    }

    // Also observe document body for any size changes
    resizeObserver.observe(document.body);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (map.current) { map.current.remove(); map.current = null; }
    };
  }, []);

  // Handle terrain toggle
  // 3D 고도 표시가 활성화되면 terrain을 비활성화하여 MSL(해수면) 기준 절대 고도로 표시
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (is3DView && showTerrain && !show3DAltitude) {
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
    } else {
      map.current.setTerrain(null);
    }
  }, [showTerrain, is3DView, show3DAltitude, mapLoaded]);

  // Handle 2D/3D toggle
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (is3DView) {
      map.current.easeTo({ pitch: 60, bearing: -30, duration: 1000 });
    } else {
      map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      map.current.setTerrain(null);
    }
  }, [is3DView, mapLoaded]);

  // Handle 3D buildings visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    try {
      if (map.current.getLayer('3d-buildings')) {
        map.current.setLayoutProperty('3d-buildings', 'visibility', showBuildings && is3DView ? 'visible' : 'none');
      }
    } catch (e) {}
  }, [showBuildings, is3DView, mapLoaded]);

  // Fetch radar data from RainViewer API
  useEffect(() => {
    const fetchRadarData = async () => {
      try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await response.json();
        if (data?.radar?.past?.length > 0) {
          setRadarData(data);
        }
      } catch (e) {
        console.error('Failed to fetch radar data:', e);
      }
    };
    fetchRadarData();
    const interval = setInterval(fetchRadarData, 300000); // 5분마다 갱신
    return () => clearInterval(interval);
  }, []);

  // Radar layer management
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const removeRadarLayer = () => {
      try {
        if (map.current.getLayer('radar-layer')) map.current.removeLayer('radar-layer');
        if (map.current.getSource('radar-source')) map.current.removeSource('radar-source');
      } catch (e) {}
    };

    if (showRadar && radarData?.radar?.past?.length > 0) {
      const latestFrame = radarData.radar.past[radarData.radar.past.length - 1];
      const tileUrl = `${radarData.host}${latestFrame.path}/256/{z}/{x}/{y}/4/1_1.png`;

      removeRadarLayer();

      map.current.addSource('radar-source', {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256
      });

      map.current.addLayer({
        id: 'radar-layer',
        type: 'raster',
        source: 'radar-source',
        paint: { 'raster-opacity': 0.6 }
      }, map.current.getLayer('runway') ? 'runway' : undefined);
    } else {
      removeRadarLayer();
    }
  }, [showRadar, radarData, mapLoaded]);

  // Handle style change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    // 레이더 모드 + 검은 배경이면 완전 검은 스타일 적용
    let newStyle;
    if (atcOnlyMode && radarBlackBackground) {
      newStyle = MAP_STYLES.black;
    } else {
      newStyle = showSatellite ? MAP_STYLES.satellite : (isDarkMode ? MAP_STYLES.dark : MAP_STYLES.light);
    }
    const center = map.current.getCenter(), zoom = map.current.getZoom(), pitch = map.current.getPitch(), bearing = map.current.getBearing();

    map.current.setStyle(newStyle);
    map.current.once('style.load', () => {
      map.current.setCenter(center); map.current.setZoom(zoom); map.current.setPitch(pitch); map.current.setBearing(bearing);
      if (!map.current.getSource('mapbox-dem')) map.current.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
      // 3D 고도 표시가 활성화되면 terrain을 비활성화하여 MSL 기준 절대 고도로 표시
      if (is3DView && showTerrain && !show3DAltitude) map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
      if (!map.current.getLayer('sky')) map.current.addLayer({ id: 'sky', type: 'sky', paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0.0, 90.0], 'sky-atmosphere-sun-intensity': 15 } });
      // 검은 배경 모드가 아닐 때만 빌딩 추가
      if (!(atcOnlyMode && radarBlackBackground) && !map.current.getLayer('3d-buildings') && map.current.getSource('composite')) {
        map.current.addLayer({ id: '3d-buildings', source: 'composite', 'source-layer': 'building', type: 'fill-extrusion', minzoom: 12, paint: { 'fill-extrusion-color': '#aaa', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'min_height'], 'fill-extrusion-opacity': 0.6 } });
      }
      if (!map.current.getSource('runway')) map.current.addSource('runway', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[129.3505, 35.5890], [129.3530, 35.5978]] } } });
      if (!map.current.getLayer('runway')) map.current.addLayer({ id: 'runway', type: 'line', source: 'runway', paint: { 'line-color': '#FFFFFF', 'line-width': 8 } });
      setMapLoaded(false);
      setTimeout(() => setMapLoaded(true), 100);
    });
  }, [isDarkMode, showSatellite, atcOnlyMode, radarBlackBackground]);

  // Chart overlay management
  useEffect(() => {
    if (!map.current || !mapLoaded || Object.keys(chartBounds).length === 0) return;
    const safeRemove = (type, id) => { try { if (map.current[`get${type}`](id)) map.current[`remove${type}`](id); } catch (e) {} };

    Object.keys(PROCEDURE_CHARTS).forEach((chartId) => {
      const layerId = `chart-${chartId}`, sourceId = `chart-source-${chartId}`;
      const isActive = activeCharts[chartId], bounds = chartBounds[chartId]?.bounds;

      if (isActive && bounds) {
        if (!map.current.getSource(sourceId)) map.current.addSource(sourceId, { type: 'image', url: PROCEDURE_CHARTS[chartId].file, coordinates: bounds });
        if (!map.current.getLayer(layerId)) map.current.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': chartOpacities[chartId] || 0.7 } }, 'runway');
        else map.current.setPaintProperty(layerId, 'raster-opacity', chartOpacities[chartId] || 0.7);
      } else {
        safeRemove('Layer', layerId);
        safeRemove('Source', sourceId);
      }
    });
  }, [activeCharts, chartOpacities, chartBounds, mapLoaded]);

  // ATC Only Mode (Radar Display) - 검은 배경 + 50nm 주요 링 + 10nm 세부 링 (150nm까지)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const safeRemoveLayer = (id) => { try { if (map.current.getLayer(id)) map.current.removeLayer(id); } catch (e) {} };
    const safeRemoveSource = (id) => { try { if (map.current.getSource(id)) map.current.removeSource(id); } catch (e) {} };

    // Clean up previous radar layers
    for (let i = 1; i <= 15; i++) {
      safeRemoveLayer(`radar-ring-${i}`);
      safeRemoveLayer(`radar-ring-label-${i}`);
      safeRemoveSource(`radar-ring-${i}`);
      safeRemoveSource(`radar-ring-label-${i}`);
    }
    for (let i = 0; i < 36; i++) {
      safeRemoveLayer(`radar-bearing-${i}`);
      safeRemoveSource(`radar-bearing-${i}`);
    }
    safeRemoveLayer('radar-bearing-labels');
    safeRemoveSource('radar-bearing-labels');

    if (!atcOnlyMode) return;

    // 울산공항 좌표 (RKPU)
    const centerLon = 129.3517;
    const centerLat = 35.5935;

    // 거리 링 생성
    const createCircleCoords = (centerLon, centerLat, radiusNm, segments = 128) => {
      const coords = [];
      const radiusDeg = radiusNm / 60; // 1 degree ≈ 60 NM
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        coords.push([
          centerLon + radiusDeg * Math.cos(angle) / Math.cos(centerLat * Math.PI / 180),
          centerLat + radiusDeg * Math.sin(angle)
        ]);
      }
      return coords;
    };

    // radarRange에 따라 링 간격 결정 (작은 범위는 10nm, 큰 범위는 50nm)
    const ringInterval = radarRange <= 100 ? 10 : (radarRange <= 200 ? 25 : 50);
    const numRings = Math.ceil(radarRange / ringInterval);

    for (let i = 1; i <= numRings; i++) {
      const radiusNm = i * ringInterval;
      if (radiusNm > radarRange) break;
      const isMajor = radiusNm % 50 === 0; // 50nm 단위는 주요 링
      const ringCoords = createCircleCoords(centerLon, centerLat, radiusNm);

      map.current.addSource(`radar-ring-${i}`, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ringCoords }
        }
      });
      map.current.addLayer({
        id: `radar-ring-${i}`,
        type: 'line',
        source: `radar-ring-${i}`,
        paint: {
          'line-color': '#00FF00',
          'line-width': isMajor ? 1.5 : 0.5,
          'line-opacity': isMajor ? 0.8 : 0.4
        }
      });

      // 링 라벨 표시
      const labelLon = centerLon;
      const labelLat = centerLat + radiusNm / 60;
      map.current.addSource(`radar-ring-label-${i}`, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [labelLon, labelLat] },
          properties: { label: `${radiusNm}` }
        }
      });
      map.current.addLayer({
        id: `radar-ring-label-${i}`,
        type: 'symbol',
        source: `radar-ring-label-${i}`,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': isMajor ? 12 : 10,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#00FF00',
          'text-halo-color': '#000000',
          'text-halo-width': 1,
          'text-opacity': isMajor ? 1 : 0.7
        }
      });
    }

    // 베어링 라인 (10도 간격, 36개) - radarRange까지
    const bearingLabelFeatures = [];
    for (let i = 0; i < 36; i++) {
      const bearing = i * 10;
      const angle = (90 - bearing) * Math.PI / 180; // 북쪽 = 0도
      const maxRadius = radarRange / 60; // radarRange nm in degrees

      const endLon = centerLon + maxRadius * Math.cos(angle) / Math.cos(centerLat * Math.PI / 180);
      const endLat = centerLat + maxRadius * Math.sin(angle);

      map.current.addSource(`radar-bearing-${i}`, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[centerLon, centerLat], [endLon, endLat]] }
        }
      });
      map.current.addLayer({
        id: `radar-bearing-${i}`,
        type: 'line',
        source: `radar-bearing-${i}`,
        paint: {
          'line-color': '#00FF00',
          'line-width': bearing % 30 === 0 ? 1 : 0.3,
          'line-opacity': bearing % 30 === 0 ? 0.7 : 0.3,
          'line-dasharray': bearing % 30 === 0 ? [1, 0] : [2, 4]
        }
      });

      // 베어링 라벨 (30도마다 외곽에 표시)
      if (bearing % 30 === 0) {
        const labelRadius = (radarRange + 10) / 60;
        const labelLon = centerLon + labelRadius * Math.cos(angle) / Math.cos(centerLat * Math.PI / 180);
        const labelLat = centerLat + labelRadius * Math.sin(angle);
        bearingLabelFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [labelLon, labelLat] },
          properties: { label: `${bearing.toString().padStart(3, '0')}°` }
        });
      }
    }

    // 베어링 라벨 레이어
    map.current.addSource('radar-bearing-labels', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: bearingLabelFeatures }
    });
    map.current.addLayer({
      id: 'radar-bearing-labels',
      type: 'symbol',
      source: 'radar-bearing-labels',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-anchor': 'center'
      },
      paint: {
        'text-color': '#00FF00',
        'text-halo-color': '#000000',
        'text-halo-width': 1
      }
    });

  }, [atcOnlyMode, radarRange, mapLoaded]);

  // ATC Sector 3D visualization - multiple sectors
  useEffect(() => {
    if (!map.current || !mapLoaded || !atcData) return;

    // Helper to create circle polygon (NM to degrees approximation)
    const createCircleCoords = (center, radiusNm, segments = 64) => {
      const coords = [];
      const radiusDeg = radiusNm / 60; // 1 degree ≈ 60 NM
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        coords.push([
          center[0] + radiusDeg * Math.cos(angle),
          center[1] + radiusDeg * Math.sin(angle) * Math.cos(center[1] * Math.PI / 180)
        ]);
      }
      return [coords];
    };

    // Get all sectors and current selected set
    const allSectors = [...(atcData.ACC || []), ...(atcData.TMA || []), ...(atcData.CTR || [])];
    const selectedIds = Array.from(selectedAtcSectors);

    // Remove only unselected sectors (not all)
    allSectors.forEach(sector => {
      if (!selectedAtcSectors.has(sector.id)) {
        const sourceId = `atc-sector-${sector.id}`;
        const layerId = `atc-layer-${sector.id}`;
        const outlineId = `atc-outline-${sector.id}`;
        const labelSourceId = `atc-label-source-${sector.id}`;
        const labelLayerId = `atc-label-${sector.id}`;
        try {
          if (map.current.getLayer(labelLayerId)) map.current.removeLayer(labelLayerId);
          if (map.current.getSource(labelSourceId)) map.current.removeSource(labelSourceId);
          if (map.current.getLayer(outlineId)) map.current.removeLayer(outlineId);
          if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
          if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
        } catch (e) {}
      }
    });

    if (selectedAtcSectors.size === 0) return;

    // Add layers only for newly selected sectors (skip if already exists)
    let boundsCoords = [];

    selectedIds.forEach(sectorId => {
      // Skip if layer already exists
      if (map.current.getLayer(`atc-layer-${sectorId}`)) return;
      let sectorData = null;
      let sectorType = null;

      for (const acc of atcData.ACC || []) {
        if (acc.id === sectorId) { sectorData = acc; sectorType = 'ACC'; break; }
      }
      if (!sectorData) {
        for (const tma of atcData.TMA || []) {
          if (tma.id === sectorId) { sectorData = tma; sectorType = 'TMA'; break; }
        }
      }
      if (!sectorData) {
        for (const ctr of atcData.CTR || []) {
          if (ctr.id === sectorId) { sectorData = ctr; sectorType = 'CTR'; break; }
        }
      }

      if (!sectorData) return;

      // Get coordinates
      let coordinates;
      if (sectorData.coordinates) {
        coordinates = [sectorData.coordinates];
        boundsCoords.push(...sectorData.coordinates);
      } else if (sectorData.center && sectorData.radius_nm) {
        coordinates = createCircleCoords(sectorData.center, sectorData.radius_nm);
        boundsCoords.push(sectorData.center);
      } else {
        return;
      }

      const sourceId = `atc-sector-${sectorId}`;
      const layerId = `atc-layer-${sectorId}`;
      const outlineId = `atc-outline-${sectorId}`;
      const floorFt = sectorData.floor_ft || 0;
      const ceilingFt = sectorData.ceiling_ft || 10000;
      const color = sectorData.color || '#4ECDC4';

      // Add source
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: coordinates },
          properties: { name: sectorData.name, floor: floorFt, ceiling: ceilingFt }
        }
      });

      // Add 3D extrusion layer
      map.current.addLayer({
        id: layerId,
        type: 'fill-extrusion',
        source: sourceId,
        paint: {
          'fill-extrusion-color': color,
          'fill-extrusion-height': ftToM(ceilingFt),
          'fill-extrusion-base': ftToM(floorFt),
          'fill-extrusion-opacity': 0.3
        }
      });

      // Add outline layer
      map.current.addLayer({
        id: outlineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': color,
          'line-width': 2,
          'line-opacity': 0.8
        }
      });

      // Calculate center for label
      let centerLon, centerLat;
      if (sectorData.center) {
        [centerLon, centerLat] = sectorData.center;
      } else if (sectorData.coordinates && sectorData.coordinates.length > 0) {
        const coords = sectorData.coordinates;
        centerLon = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        centerLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
      }

      // Add label source and layer
      if (centerLon && centerLat) {
        const labelSourceId = `atc-label-source-${sectorId}`;
        const labelLayerId = `atc-label-${sectorId}`;

        // Extract short name (e.g., "T13" from "T13 - Osan TMA")
        const shortName = sectorData.name.split(' - ')[0] || sectorData.name;

        map.current.addSource(labelSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [centerLon, centerLat] },
            properties: { name: shortName }
          }
        });

        map.current.addLayer({
          id: labelLayerId,
          type: 'symbol',
          source: labelSourceId,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-anchor': 'center',
            'text-allow-overlap': true
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': color,
            'text-halo-width': 2
          }
        });
      }
    });

    // No automatic zoom - user controls the view

  }, [selectedAtcSectors, atcData, mapLoaded]);

  const toggleChart = (chartId) => setActiveCharts(prev => ({ ...prev, [chartId]: !prev[chartId] }));
  const updateChartOpacity = (chartId, opacity) => setChartOpacities(prev => ({ ...prev, [chartId]: opacity }));

  const getActiveWaypoints = useCallback(() => {
    if (!data) return [];
    const waypointMap = new Map();
    const extractWaypoints = (proc, color) => {
      if (!proc?.segments) return;
      proc.segments.forEach((seg) => {
        const coords = seg.coordinates;
        if (!coords || coords.length < 2) return;
        [coords[0], coords[coords.length - 1]].forEach(coord => {
          if (coord?.length >= 3) {
            const key = `${coord[0].toFixed(4)}_${coord[1].toFixed(4)}`;
            if (!waypointMap.has(key)) waypointMap.set(key, { lon: coord[0], lat: coord[1], altitude_m: coord[2], altitude_ft: Math.round(coord[2] / 0.3048), color });
          }
        });
      });
    };

    if (data.procedures?.SID) Object.entries(data.procedures.SID).forEach(([k, p]) => { if (sidVisible[k]) extractWaypoints(p, procColors.SID[k]); });
    if (data.procedures?.STAR) Object.entries(data.procedures.STAR).forEach(([k, p]) => { if (starVisible[k]) extractWaypoints(p, procColors.STAR[k]); });
    if (data.procedures?.APPROACH) Object.entries(data.procedures.APPROACH).forEach(([k, p]) => { if (apchVisible[k]) extractWaypoints(p, procColors.APPROACH[k]); });

    const namedWaypoints = Array.isArray(data.waypoints) ? data.waypoints : Object.values(data.waypoints || {});
    return Array.from(waypointMap.values()).map(wp => {
      const named = namedWaypoints.find(n => Math.abs(n.lon - wp.lon) < 0.001 && Math.abs(n.lat - wp.lat) < 0.001);
      return { ...wp, ident: named?.ident || '' };
    });
  }, [data, sidVisible, starVisible, apchVisible, procColors]);

  const hasActiveProcedure = Object.values(sidVisible).some(v => v) || Object.values(starVisible).some(v => v) || Object.values(apchVisible).some(v => v);

  // Create Three.js custom layer for procedures (terrain-independent MSL altitude)
  const createProcedureThreeLayer = useCallback((procedures, procColors, visibleState, typePrefix) => {
    if (!map.current) return null;

    const layerId = `${typePrefix}-three-layer`;

    // Collect segments from visible procedures - each segment is a separate line
    const procedureLines = [];
    Object.entries(procedures).forEach(([key, proc]) => {
      if (!visibleState[key]) return;
      const color = procColors[key];

      // Each segment is a separate line (don't merge)
      proc.segments?.forEach(seg => {
        if (seg.coordinates?.length >= 2) {
          procedureLines.push({ coords: seg.coordinates, color });
        }
      });
    });

    if (procedureLines.length === 0) return null;

    // Custom Three.js layer
    const customLayer = {
      id: layerId,
      type: 'custom',
      renderingMode: '3d',
      onAdd: function(map, gl) {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();

        const ribbonWidth = 0.000004; // Width in mercator units (halved)

        // Create continuous ribbon for each procedure
        procedureLines.forEach(({ coords, color }) => {
          const threeColor = new THREE.Color(color);

          // Build continuous ribbon geometry
          const vertices = [];
          const indices = [];

          for (let i = 0; i < coords.length; i++) {
            const [lon, lat, alt] = coords[i];
            const altM = alt || 0;
            const p = mapboxgl.MercatorCoordinate.fromLngLat([lon, lat], altM);

            // Calculate direction for ribbon width
            let dx, dy;
            if (i < coords.length - 1) {
              const [nextLon, nextLat, nextAlt] = coords[i + 1];
              const nextP = mapboxgl.MercatorCoordinate.fromLngLat([nextLon, nextLat], nextAlt || 0);
              dx = nextP.x - p.x;
              dy = nextP.y - p.y;
            } else if (i > 0) {
              const [prevLon, prevLat, prevAlt] = coords[i - 1];
              const prevP = mapboxgl.MercatorCoordinate.fromLngLat([prevLon, prevLat], prevAlt || 0);
              dx = p.x - prevP.x;
              dy = p.y - prevP.y;
            } else {
              dx = 1; dy = 0;
            }

            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) continue;

            // Perpendicular direction for ribbon width
            const nx = -dy / len * ribbonWidth;
            const ny = dx / len * ribbonWidth;

            // Add two vertices (left and right edge of ribbon)
            const baseIdx = vertices.length / 3;
            vertices.push(p.x + nx, p.y + ny, p.z); // left
            vertices.push(p.x - nx, p.y - ny, p.z); // right

            // Create triangles between this point and next
            if (i > 0) {
              const prevBase = baseIdx - 2;
              // Triangle 1: prev-left, prev-right, curr-right
              indices.push(prevBase, prevBase + 1, baseIdx + 1);
              // Triangle 2: prev-left, curr-right, curr-left
              indices.push(prevBase, baseIdx + 1, baseIdx);
            }
          }

          if (vertices.length >= 6 && indices.length >= 3) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

            const material = new THREE.MeshBasicMaterial({
              color: threeColor,
              transparent: true,
              opacity: 0.85,
              side: THREE.DoubleSide,
              depthWrite: false
            });

            const mesh = new THREE.Mesh(geometry, material);
            this.scene.add(mesh);
          }
        });

        this.renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true
        });
        this.renderer.autoClear = false;
      },
      render: function(gl, matrix) {
        const m = new THREE.Matrix4().fromArray(matrix);
        this.camera.projectionMatrix = m;
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
      }
    };

    return customLayer;
  }, []);

  // Main rendering - Using Three.js custom layer for terrain-independent MSL altitude
  useEffect(() => {
    if (!map.current || !data || !mapLoaded) return;

    const safeRemoveLayer = (id) => { try { if (map.current.getLayer(id)) map.current.removeLayer(id); } catch (e) {} };
    const safeRemoveSource = (id) => { try { if (map.current.getSource(id)) map.current.removeSource(id); } catch (e) {} };

    // Clean up previous layers
    ['waypoints-3d', 'waypoints-2d', 'waypoints-labels', 'proc-waypoints-labels', 'obstacles-3d', 'obstacles-2d', 'airspace', 'airspace-outline', 'notam-extrusion', 'notam-fill', 'notam-outline', 'notam-icons', 'notam-labels'].forEach(safeRemoveLayer);
    ['waypoints-3d', 'waypoints-2d', 'waypoints-labels', 'proc-waypoints-labels', 'obstacles-3d', 'obstacles-2d', 'airspace', 'notam-areas', 'notam-centers'].forEach(safeRemoveSource);

    // Remove old procedure layers (both Mapbox and Three.js) - including segment-based layers
    const cleanupProcedureLayers = (type, key, proc) => {
      ['3d', '2d', 'line'].forEach(suffix => {
        safeRemoveLayer(`${type}-${key}-${suffix}`);
        safeRemoveSource(`${type}-${key}-${suffix}`);
      });
      // Also remove segment-based layers (seg0, seg1, etc.)
      const segCount = proc?.segments?.length || 10;
      for (let i = 0; i < segCount; i++) {
        safeRemoveLayer(`${type}-${key}-seg${i}-line`);
        safeRemoveSource(`${type}-${key}-seg${i}-line`);
      }
    };
    Object.entries(data.procedures?.SID || {}).forEach(([k, p]) => cleanupProcedureLayers('sid', k, p));
    Object.entries(data.procedures?.STAR || {}).forEach(([k, p]) => cleanupProcedureLayers('star', k, p));
    Object.entries(data.procedures?.APPROACH || {}).forEach(([k, p]) => cleanupProcedureLayers('apch', k, p));

    // Remove Three.js custom layers
    ['sid-three-layer', 'star-three-layer', 'apch-three-layer'].forEach(safeRemoveLayer);

    // Render procedures using Three.js custom layer (terrain-independent)
    if (is3DView && show3DAltitude) {
      // Add Three.js layers for each procedure type
      if (data.procedures?.SID) {
        const sidLayer = createProcedureThreeLayer(data.procedures.SID, procColors.SID, sidVisible, 'sid');
        if (sidLayer) map.current.addLayer(sidLayer);
      }
      if (data.procedures?.STAR) {
        const starLayer = createProcedureThreeLayer(data.procedures.STAR, procColors.STAR, starVisible, 'star');
        if (starLayer) map.current.addLayer(starLayer);
      }
      if (data.procedures?.APPROACH) {
        const apchLayer = createProcedureThreeLayer(data.procedures.APPROACH, procColors.APPROACH, apchVisible, 'apch');
        if (apchLayer) map.current.addLayer(apchLayer);
      }
    } else {
      // 2D fallback - use simple line layers (each segment as separate line)
      const render2DProcedure = (type, key, proc, color) => {
        proc.segments?.forEach((seg, segIdx) => {
          if (seg.coordinates && seg.coordinates.length >= 2) {
            const sourceId = `${type}-${key}-seg${segIdx}-line`;
            const coords = seg.coordinates.map(c => [c[0], c[1]]);
            map.current.addSource(sourceId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
            map.current.addLayer({ id: sourceId, type: 'line', source: sourceId, paint: { 'line-color': color, 'line-width': 3, 'line-opacity': 0.8 } });
          }
        });
      };

      if (data.procedures?.SID) Object.entries(data.procedures.SID).forEach(([k, p]) => { if (sidVisible[k]) render2DProcedure('sid', k, p, procColors.SID[k]); });
      if (data.procedures?.STAR) Object.entries(data.procedures.STAR).forEach(([k, p]) => { if (starVisible[k]) render2DProcedure('star', k, p, procColors.STAR[k]); });
      if (data.procedures?.APPROACH) Object.entries(data.procedures.APPROACH).forEach(([k, p]) => { if (apchVisible[k]) render2DProcedure('apch', k, p, procColors.APPROACH[k]); });
    }

    // Waypoint labels - use symbol layer with proper elevation
    if (hasActiveProcedure) {
      const activeWaypoints = getActiveWaypoints();
      if (activeWaypoints.length > 0) {
        const features = activeWaypoints.map(wp => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [wp.lon, wp.lat, wp.altitude_m] },
          properties: { ident: wp.ident, altitude_ft: wp.altitude_ft, label: `${wp.ident}\n${wp.altitude_ft}ft`, color: wp.color }
        }));
        map.current.addSource('proc-waypoints-labels', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.current.addLayer({
          id: 'proc-waypoints-labels',
          type: 'symbol',
          source: 'proc-waypoints-labels',
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 12,
            'text-anchor': 'bottom',
            'text-offset': [0, -0.5],
            'text-allow-overlap': true,
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'symbol-z-elevate': true
          },
          paint: {
            'text-color': '#FFEB3B',
            'text-halo-color': 'rgba(0, 0, 0, 0.9)',
            'text-halo-width': 2
          }
        });
      }
    }

    // Airspace
    if (showAirspace && data.airspace) {
      const features = data.airspace.map((as) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: as.coordinates },
        properties: { name: as.name }
      }));
      map.current.addSource('airspace', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.current.addLayer({ id: 'airspace', type: 'fill', source: 'airspace', paint: { 'fill-color': '#E91E63', 'fill-opacity': 0.1 } });
      map.current.addLayer({ id: 'airspace-outline', type: 'line', source: 'airspace', paint: { 'line-color': '#E91E63', 'line-width': 2, 'line-dasharray': [4, 2] } });
    }

    // Active NOTAMs on map - only show when locations are selected
    if (notamLocationsOnMap.size > 0 && notamData?.data && notamData.data.length > 0) {
      // Build set of cancelled NOTAMs first
      const cancelledSet = buildCancelledNotamSet(notamData.data);

      // Filter NOTAMs: only selected locations, only currently active (not future), exclude expired
      const validNotams = notamData.data.filter(n => {
        // Must be in selected locations
        if (!notamLocationsOnMap.has(n.location)) return false;
        // Check if currently active only (not future, not expired/cancelled)
        const validity = getNotamValidity(n, cancelledSet);
        if (validity !== 'active') return false;
        // Must have coordinates (Q-line or airport fallback)
        const coords = getNotamDisplayCoords(n);
        if (!coords) return false;
        // Exclude NOTAMs with very large radius (100+ NM) that cover large portions of map
        if (coords.radiusNM && coords.radiusNM >= 100) return false;
        return true;
      });

      if (validNotams.length > 0) {
        const notamFeatures = validNotams.map(n => {
          const coords = getNotamDisplayCoords(n);
          const validity = getNotamValidity(n, cancelledSet);
          return {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: createNotamCircle(coords.lon, coords.lat, coords.radiusNM || 5) },
            properties: {
              id: n.id,
              notam_number: n.notam_number,
              location: n.location,
              qcode: n.qcode,
              qcode_mean: n.qcode_mean,
              e_text: n.e_text,
              full_text: n.full_text,
              effective_start: n.effective_start,
              effective_end: n.effective_end || 'PERM',
              series: n.series,
              fir: n.fir,
              lowerAlt: coords.lowerAlt,
              upperAlt: coords.upperAlt,
              validity: validity // 'active' or 'future'
            }
          };
        });

        // Center points for labels (include full properties for click handler)
        const notamCenterFeatures = validNotams.map(n => {
          const coords = getNotamDisplayCoords(n);
          const validity = getNotamValidity(n, cancelledSet);
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [coords.lon, coords.lat] },
            properties: {
              id: n.id,
              notam_number: n.notam_number,
              location: n.location,
              qcode: n.qcode,
              qcode_mean: n.qcode_mean,
              e_text: n.e_text,
              full_text: n.full_text,
              effective_start: n.effective_start,
              effective_end: n.effective_end || 'PERM',
              series: n.series,
              fir: n.fir,
              lowerAlt: coords.lowerAlt,
              upperAlt: coords.upperAlt,
              validity: validity // 'active' or 'future'
            }
          };
        });

        map.current.addSource('notam-areas', { type: 'geojson', data: { type: 'FeatureCollection', features: notamFeatures } });

        // 3D extrusion layer for NOTAMs (shows altitude range) - color by validity
        if (is3DView) {
          map.current.addLayer({
            id: 'notam-extrusion',
            type: 'fill-extrusion',
            source: 'notam-areas',
            paint: {
              'fill-extrusion-color': [
                'case',
                ['==', ['get', 'validity'], 'future'], '#2196F3', // Blue for future
                '#FF9800' // Orange for active
              ],
              'fill-extrusion-opacity': 0.35,
              'fill-extrusion-base': ['*', ['get', 'lowerAlt'], 0.3048], // Convert feet to meters
              'fill-extrusion-height': ['*', ['get', 'upperAlt'], 0.3048]
            }
          });
        }

        // 2D fill layer - color by validity (active: orange, future: blue)
        map.current.addLayer({
          id: 'notam-fill',
          type: 'fill',
          source: 'notam-areas',
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'validity'], 'future'], '#2196F3', // Blue for future
              '#FF9800' // Orange for active
            ],
            'fill-opacity': is3DView ? 0.05 : 0.15
          }
        });
        map.current.addLayer({
          id: 'notam-outline',
          type: 'line',
          source: 'notam-areas',
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'validity'], 'future'], '#2196F3',
              '#FF9800'
            ],
            'line-width': 2,
            'line-dasharray': [3, 2]
          }
        });

        map.current.addSource('notam-centers', { type: 'geojson', data: { type: 'FeatureCollection', features: notamCenterFeatures } });
        map.current.addLayer({
          id: 'notam-icons',
          type: 'circle',
          source: 'notam-centers',
          paint: {
            'circle-radius': 6,
            'circle-color': [
              'case',
              ['==', ['get', 'validity'], 'future'], '#2196F3',
              '#FF9800'
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff'
          }
        });
        map.current.addLayer({
          id: 'notam-labels',
          type: 'symbol',
          source: 'notam-centers',
          layout: {
            'text-field': ['get', 'notam_number'],
            'text-size': 10,
            'text-anchor': 'top',
            'text-offset': [0, 0.8],
            'text-allow-overlap': true, // Allow overlap to show all NOTAM labels
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold']
          },
          paint: {
            'text-color': [
              'case',
              ['==', ['get', 'validity'], 'future'], '#2196F3',
              '#FF9800'
            ],
            'text-halo-color': 'rgba(0, 0, 0, 0.9)',
            'text-halo-width': 1.5
          }
        });

        // Helper function to show NOTAM popup
        const showNotamPopup = (props, lngLat) => {
          // Format effective times (YYMMDDHHMM -> readable format)
          const formatNotamTime = (timeStr) => {
            if (!timeStr || timeStr === 'PERM') return 'PERM (영구)';
            if (timeStr.length < 10) return timeStr;
            const year = '20' + timeStr.substring(0, 2);
            const month = timeStr.substring(2, 4);
            const day = timeStr.substring(4, 6);
            const hour = timeStr.substring(6, 8);
            const minute = timeStr.substring(8, 10);
            return `${year}-${month}-${day} ${hour}:${minute}Z`;
          };

          const startTime = formatNotamTime(props.effective_start);
          const endTime = formatNotamTime(props.effective_end);
          const validity = props.validity;
          const validityColor = validity === 'future' ? '#2196F3' : '#FF9800';
          const validityText = validity === 'future' ? '예정' : '활성';
          const validityBgColor = validity === 'future' ? 'rgba(33,150,243,0.2)' : 'rgba(255,152,0,0.2)';

          // Escape and format full_text for HTML display
          const fullTextFormatted = (props.full_text || '')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\r\n/g, '<br>')
            .replace(/\n/g, '<br>');

          const popupContent = `
            <div style="max-width: 400px; font-size: 12px; max-height: 500px; overflow-y: auto;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid ${validityColor}40; padding-bottom: 6px;">
                <span style="font-weight: bold; color: ${validityColor}; font-size: 14px;">${props.notam_number}</span>
                <div style="display: flex; gap: 4px;">
                  <span style="background: ${validityBgColor}; color: ${validityColor}; padding: 2px 6px; border-radius: 3px; font-size: 10px;">${validityText}</span>
                  <span style="background: rgba(255,255,255,0.1); color: #aaa; padding: 2px 6px; border-radius: 3px; font-size: 10px;">${props.series || ''}</span>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; margin-bottom: 8px;">
                <span style="color: #888;">위치:</span><span>${props.location} (${props.fir || 'RKRR'})</span>
                <span style="color: #888;">Q-Code:</span><span>${props.qcode}</span>
                <span style="color: #888;">의미:</span><span>${props.qcode_mean || '-'}</span>
                <span style="color: #888;">유효시작:</span><span style="color: #4CAF50;">${startTime}</span>
                <span style="color: #888;">유효종료:</span><span style="color: #f44336;">${endTime}</span>
                <span style="color: #888;">고도:</span><span>FL${String(Math.round(props.lowerAlt/100)).padStart(3,'0')} ~ FL${String(Math.round(props.upperAlt/100)).padStart(3,'0')}</span>
              </div>
              <div style="margin-bottom: 8px;">
                <div style="color: #888; margin-bottom: 4px; font-size: 11px;">내용 (E):</div>
                <div style="background: ${validityBgColor}; padding: 8px; border-radius: 4px; white-space: pre-wrap; line-height: 1.4;">
                  ${props.e_text || '-'}
                </div>
              </div>
              <details style="margin-top: 8px;">
                <summary style="cursor: pointer; color: ${validityColor}; font-size: 11px;">전문 보기 (Full Text)</summary>
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; margin-top: 4px; font-family: monospace; font-size: 10px; white-space: pre-wrap; line-height: 1.3; color: #ccc;">
                  ${fullTextFormatted}
                </div>
              </details>
            </div>
          `;
          new mapboxgl.Popup({ closeButton: true, maxWidth: '450px' })
            .setLngLat(lngLat)
            .setHTML(popupContent)
            .addTo(map.current);
        };

        // Add popup on click for fill layer
        map.current.on('click', 'notam-fill', (e) => {
          if (e.features.length > 0) {
            showNotamPopup(e.features[0].properties, e.lngLat);
          }
        });

        map.current.on('mouseenter', 'notam-fill', () => {
          map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'notam-fill', () => {
          map.current.getCanvas().style.cursor = '';
        });

        // Also add click handler to notam-icons (center dots) for easier clicking
        map.current.on('click', 'notam-icons', (e) => {
          e.preventDefault(); // Prevent triggering notam-fill click
          if (e.features.length > 0) {
            showNotamPopup(e.features[0].properties, e.lngLat);
          }
        });

        map.current.on('mouseenter', 'notam-icons', () => {
          map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'notam-icons', () => {
          map.current.getCanvas().style.cursor = '';
        });
      }
    }

    // Waypoints (when no procedure is active)
    if (showWaypoints && !hasActiveProcedure && data.waypoints) {
      const waypointsArray = Array.isArray(data.waypoints) ? data.waypoints : Object.values(data.waypoints);
      if (waypointsArray.length > 0) {
        const features = waypointsArray.map(wp => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
          properties: { ident: wp.ident || '', type: wp.type || 'WPT' }
        }));
        map.current.addSource('waypoints-2d', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.current.addLayer({
          id: 'waypoints-2d',
          type: 'circle',
          source: 'waypoints-2d',
          paint: { 'circle-radius': 5, 'circle-color': '#00BCD4', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' }
        });
        map.current.addLayer({
          id: 'waypoints-labels',
          type: 'symbol',
          source: 'waypoints-2d',
          layout: {
            'text-field': ['get', 'ident'],
            'text-size': 11,
            'text-anchor': 'bottom',
            'text-offset': [0, -0.8],
            'text-allow-overlap': false,
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold']
          },
          paint: { 'text-color': '#00BCD4', 'text-halo-color': 'rgba(0, 0, 0, 0.9)', 'text-halo-width': 1.5 }
        });
      }
    }

    // Obstacles
    if (showObstacles && data.obstacles) {
      const filteredObstacles = data.obstacles.filter(obs => obs.height_m > 0);
      if (is3DView && show3DAltitude) {
        const features3d = filteredObstacles.map((obs) => ({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: createObstacleShape(obs.lon, obs.lat, obs.type, 0.0002) },
          properties: { height: obs.height_m, color: OBSTACLE_COLORS[obs.type] || OBSTACLE_COLORS.Unknown }
        }));
        if (features3d.length > 0) {
          map.current.addSource('obstacles-3d', { type: 'geojson', data: { type: 'FeatureCollection', features: features3d } });
          map.current.addLayer({ id: 'obstacles-3d', type: 'fill-extrusion', source: 'obstacles-3d', paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.85 } });
        }
      } else {
        const features2d = filteredObstacles.map((obs) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [obs.lon, obs.lat] },
          properties: { color: OBSTACLE_COLORS[obs.type] || OBSTACLE_COLORS.Unknown }
        }));
        if (features2d.length > 0) {
          map.current.addSource('obstacles-2d', { type: 'geojson', data: { type: 'FeatureCollection', features: features2d } });
          map.current.addLayer({ id: 'obstacles-2d', type: 'circle', source: 'obstacles-2d', paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-width': 1, 'circle-stroke-color': '#000' } });
        }
      }
    }

  }, [data, mapLoaded, showWaypoints, showObstacles, showAirspace, show3DAltitude, sidVisible, starVisible, apchVisible, procColors, is3DView, hasActiveProcedure, getActiveWaypoints, createProcedureThreeLayer, notamLocationsOnMap, notamData]);

  // Aircraft visualization - 레이어 재사용으로 깜빡임 방지
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // 헬퍼: 소스가 있으면 데이터 업데이트, 없으면 생성
    const updateOrCreateSource = (id, data) => {
      const source = map.current.getSource(id);
      if (source) {
        source.setData(data);
        return true; // 소스 존재함
      }
      return false; // 소스 없음
    };

    const emptyFeatureCollection = { type: 'FeatureCollection', features: [] };

    // 항공기 표시 끄기 - 빈 데이터로 업데이트
    if (!showAircraft || aircraft.length === 0) {
      ['aircraft-3d', 'aircraft-2d', 'aircraft-labels', 'aircraft-trails-2d', 'aircraft-trails-3d', 'aircraft-trails-arrows'].forEach(id => {
        const source = map.current.getSource(id);
        if (source) source.setData(emptyFeatureCollection);
      });
      return;
    }

    const flyingAircraft = aircraft.filter(ac => !ac.on_ground && ac.altitude_ft > 100);

    // Aircraft shape 생성 함수
    const createAircraftShape = (lon, lat, heading, size = 0.002) => {
      const rad = -(heading || 0) * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const points = [
        [0, size * 1.5],
        [-size * 0.5, -size],
        [0, -size * 0.3],
        [size * 0.5, -size],
      ];
      const rotated = points.map(([x, y]) => [
        lon + (x * cos - y * sin),
        lat + (x * sin + y * cos)
      ]);
      rotated.push(rotated[0]);
      return [rotated];
    };

    // 3D Aircraft 데이터 - 항상 표시 (고도에 맞게)
    const features3d = (show3DAircraft && flyingAircraft.length > 0) ?
      flyingAircraft.map(ac => {
        const altM = ftToM(ac.altitude_ft);
        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: createAircraftShape(ac.lon, ac.lat, ac.track, 0.008) },
          properties: { color: AIRCRAFT_CATEGORY_COLORS[ac.category] || '#00BCD4', height: altM + 150, base: altM }
        };
      }) : [];

    // 2D Aircraft 데이터 - 3D 항공기가 꺼져있을 때만 표시
    const features2d = (!show3DAircraft) && flyingAircraft.length > 0 ?
      flyingAircraft.map(ac => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ac.lon, ac.lat] },
        properties: { callsign: ac.callsign, color: AIRCRAFT_CATEGORY_COLORS[ac.category] || '#00BCD4', rotation: ac.track || 0 }
      })) : [];

    // Label 데이터 - 항공기 정보 표시 (선택된 항공기는 확장 라벨)
    const labelFeatures = flyingAircraft.map(ac => {
      const isEmergency = ['7700', '7600', '7500'].includes(ac.squawk);
      const vsIndicator = ac.vertical_rate > 100 ? '↑' : ac.vertical_rate < -100 ? '↓' : '';
      const isSelected = selectedAircraft?.hex === ac.hex;

      // 선택된 항공기는 확장 라벨, 아니면 기본 라벨
      let label;
      if (isSelected) {
        // 확장 라벨: 모든 정보 표시
        const route = (ac.origin || ac.destination) ? `${ac.origin || '???'}→${ac.destination || '???'}` : '';
        label = `${ac.callsign || ac.hex} [${ac.icao_type || ac.type || '?'}]` +
          `${ac.registration ? ` ${ac.registration}` : ''}` +
          `${route ? `\n${route}` : ''}` +
          `\nALT ${(ac.altitude_ft || 0).toLocaleString()}ft  GS ${ac.ground_speed || 0}kt` +
          `\nHDG ${Math.round(ac.track || 0)}°  VS ${ac.vertical_rate > 0 ? '+' : ''}${ac.vertical_rate || 0}fpm` +
          `\nSQK ${ac.squawk || '----'}`;
      } else {
        // 기본 라벨: 콜사인, 고도, 속도, 스쿽
        label = `${ac.callsign || ac.hex}\n${ac.altitude_ft || 0} ${ac.ground_speed || 0}kt${vsIndicator}\n${ac.squawk || '----'}`;
      }

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ac.lon, ac.lat] },
        properties: {
          label,
          hex: ac.hex,
          color: isEmergency ? '#ff0000' : (isSelected ? '#ffff00' : '#00ff88')
        }
      };
    });

    // 헤딩 지시선 3D 리본 (항공기 앞에 예측 시간 기반) - 고도에 맞게 표시
    const headingRibbonFeatures = [];
    if (headingPrediction > 0) {
      flyingAircraft.forEach(ac => {
        const heading = (ac.track || 0) * Math.PI / 180;
        const speedKt = ac.ground_speed || 0;
        const distanceNm = (speedKt / 3600) * headingPrediction;
        const distanceDeg = distanceNm * 0.0166;
        const lineLength = Math.max(0.005, distanceDeg);
        const endLon = ac.lon + Math.sin(heading) * lineLength;
        const endLat = ac.lat + Math.cos(heading) * lineLength;

        // 리본 생성 - createRibbonSegment는 (coord1, coord2, width) 형식
        const ribbon = createRibbonSegment(
          [ac.lon, ac.lat, ac.altitude_m],
          [endLon, endLat, ac.altitude_m],
          0.0008 // 항적과 동일한 너비
        );
        if (ribbon && ribbon.coordinates) {
          headingRibbonFeatures.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: ribbon.coordinates },
            properties: {
              color: '#00ffff', // 시안색 (청록색)
              height: ac.altitude_m + 50,
              base: ac.altitude_m - 50,
              hex: ac.hex
            }
          });
        }
      });
    }

    // 3D Aircraft 업데이트 또는 생성
    const data3d = { type: 'FeatureCollection', features: features3d };
    if (!updateOrCreateSource('aircraft-3d', data3d)) {
      map.current.addSource('aircraft-3d', { type: 'geojson', data: data3d });
      map.current.addLayer({
        id: 'aircraft-3d',
        type: 'fill-extrusion',
        source: 'aircraft-3d',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.9
        }
      });
    }

    // 2D Aircraft 업데이트 또는 생성
    const data2d = { type: 'FeatureCollection', features: features2d };
    if (!updateOrCreateSource('aircraft-2d', data2d)) {
      map.current.addSource('aircraft-2d', { type: 'geojson', data: data2d });
      map.current.addLayer({
        id: 'aircraft-2d',
        type: 'symbol',
        source: 'aircraft-2d',
        layout: {
          'icon-image': 'airport-15',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 1.5, 10, 2.5, 14, 3.5],
          'icon-rotate': ['get', 'rotation'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true
        },
        paint: { 'icon-color': ['get', 'color'] }
      });
    }

    // Labels 업데이트 또는 생성 - 사용자 드래그로 오프셋 조절 가능
    // anchor는 오프셋 방향에 따라 자동 결정
    const getAnchorFromOffset = (x, y) => {
      if (x >= 0 && y <= 0) return 'bottom-left';
      if (x < 0 && y <= 0) return 'bottom-right';
      if (x >= 0 && y > 0) return 'top-left';
      return 'top-right';
    };
    const currentAnchor = getAnchorFromOffset(labelOffset.x, labelOffset.y);

    const labelData = { type: 'FeatureCollection', features: labelFeatures };
    if (!updateOrCreateSource('aircraft-labels', labelData)) {
      map.current.addSource('aircraft-labels', { type: 'geojson', data: labelData });
      map.current.addLayer({
        id: 'aircraft-labels', type: 'symbol', source: 'aircraft-labels',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-anchor': currentAnchor,
          'text-offset': [labelOffset.x, labelOffset.y],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: { 'text-color': ['get', 'color'], 'text-halo-color': 'rgba(0, 0, 0, 0.9)', 'text-halo-width': 2 }
      });
    } else if (map.current.getLayer('aircraft-labels')) {
      // 라벨 위치가 변경되면 레이아웃 업데이트
      map.current.setLayoutProperty('aircraft-labels', 'text-anchor', currentAnchor);
      map.current.setLayoutProperty('aircraft-labels', 'text-offset', [labelOffset.x, labelOffset.y]);
    }

    // 헤딩 지시선 레이어 (3D 리본) - headingPrediction이 0이면 표시 안함
    const headingData = { type: 'FeatureCollection', features: headingRibbonFeatures };
    if (!updateOrCreateSource('aircraft-heading-lines', headingData)) {
      map.current.addSource('aircraft-heading-lines', { type: 'geojson', data: headingData });
      map.current.addLayer({
        id: 'aircraft-heading-lines',
        type: 'fill-extrusion',
        source: 'aircraft-heading-lines',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.85
        }
      });
    }

    // Aircraft trails - 항상 3D 리본 형태로 고도에 맞게 표시 + opacity 그라디언트
    const trail3dFeatures = [];

    const now = Date.now();

    if (showAircraftTrails && Object.keys(aircraftTrails).length > 0) {
      Object.entries(aircraftTrails).forEach(([hex, trail]) => {
        if (trail.length < 1) return;
        const ac = aircraft.find(a => a.hex === hex);
        if (!ac || ac.on_ground) return;

        // 현재 항공기 위치를 마지막 점으로 추가하여 끊김 방지
        const extendedTrail = [...trail];
        const lastTrail = trail[trail.length - 1];
        if (lastTrail && (lastTrail.lat !== ac.lat || lastTrail.lon !== ac.lon)) {
          extendedTrail.push({ lat: ac.lat, lon: ac.lon, altitude_m: ac.altitude_m, timestamp: now });
        }

        if (extendedTrail.length < 2) return;

        // 연속 항적 - 모든 세그먼트를 끊김 없이 표시
        for (let i = 0; i < extendedTrail.length - 1; i++) {
          const p1 = extendedTrail[i];
          const p2 = extendedTrail[i + 1];

          // 두 점 사이 거리가 너무 멀면 (비정상 점프) 건너뛰기
          const dist = Math.sqrt(Math.pow(p2.lon - p1.lon, 2) + Math.pow(p2.lat - p1.lat, 2));
          if (dist > 0.1) continue; // 약 10km 이상 점프는 무시

          // 세그먼트의 중간 시간으로 opacity 계산
          const segTime = (p1.timestamp + p2.timestamp) / 2;
          const age = now - segTime;
          // 0 (가장 최신) ~ trailDuration (가장 오래됨) -> 1.0 ~ 0.3 opacity
          const opacity = Math.max(0.3, 1.0 - (age / trailDuration) * 0.7);

          // 항상 3D 리본 형태로 표시 (고도에 맞게)
          const colorWithAlpha = `rgba(0, 255, 136, ${opacity})`; // TRAIL_COLOR with opacity

          const ribbon = createRibbonSegment([p1.lon, p1.lat, p1.altitude_m || 100], [p2.lon, p2.lat, p2.altitude_m || 100], 0.001);
          if (ribbon) trail3dFeatures.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: ribbon.coordinates },
            properties: { height: ribbon.avgAlt + 30, base: Math.max(0, ribbon.avgAlt - 30), color: colorWithAlpha }
          });
        }
      });
    }

    // 3D Trails 업데이트 또는 생성 - 항상 고도에 맞게 표시
    const trail3dData = { type: 'FeatureCollection', features: trail3dFeatures };
    if (!updateOrCreateSource('aircraft-trails-3d', trail3dData)) {
      map.current.addSource('aircraft-trails-3d', { type: 'geojson', data: trail3dData });
      map.current.addLayer({ id: 'aircraft-trails-3d', type: 'fill-extrusion', source: 'aircraft-trails-3d', paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'base'],
        'fill-extrusion-opacity': 0.9
      } });
    }

    // 2D Trails 레이어는 더 이상 사용하지 않음 (빈 데이터로 유지)
    const emptyTrail2dData = { type: 'FeatureCollection', features: [] };
    if (!updateOrCreateSource('aircraft-trails-2d', emptyTrail2dData)) {
      map.current.addSource('aircraft-trails-2d', { type: 'geojson', data: emptyTrail2dData });
    }

    // 화살표 레이어 제거 (더 이상 사용하지 않음)
    const emptyArrowData = { type: 'FeatureCollection', features: [] };
    updateOrCreateSource('aircraft-trails-arrows', emptyArrowData);

  }, [aircraft, aircraftTrails, showAircraft, showAircraftTrails, show3DAircraft, is3DView, show3DAltitude, mapLoaded, getModelForAircraft, trailDuration, headingPrediction, selectedAircraft, labelOffset]);

  // Aircraft click handler - 클릭 시 상세정보 표시
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const handleAircraftClick = (e) => {
      if (e.features && e.features.length > 0) {
        const hex = e.features[0].properties.hex;
        if (hex) {
          // 토글 방식: 같은 항공기 클릭 시 선택 해제
          if (selectedAircraft?.hex === hex) {
            setSelectedAircraft(null);
          } else {
            const ac = aircraft.find(a => a.hex === hex);
            if (ac) {
              setSelectedAircraft(ac);
            }
          }
        }
      }
    };

    const handleMapClick = (e) => {
      // 항공기 레이어 외부 클릭 시 선택 해제
      const features = map.current.queryRenderedFeatures(e.point, { layers: ['aircraft-labels', 'aircraft-3d', 'aircraft-2d', 'aircraft-heading-lines'] });
      if (features.length === 0) {
        setSelectedAircraft(null);
      }
    };

    // 라벨 클릭으로 항공기 선택
    if (map.current.getLayer('aircraft-labels')) {
      map.current.on('click', 'aircraft-labels', handleAircraftClick);
      map.current.on('mouseenter', 'aircraft-labels', () => { map.current.getCanvas().style.cursor = 'pointer'; });
      map.current.on('mouseleave', 'aircraft-labels', () => { map.current.getCanvas().style.cursor = ''; });
    }

    // 항적 클릭으로도 항공기 선택 가능
    if (map.current.getLayer('aircraft-trails-3d')) {
      map.current.on('click', 'aircraft-trails-3d', handleAircraftClick);
      map.current.on('mouseenter', 'aircraft-trails-3d', () => { map.current.getCanvas().style.cursor = 'pointer'; });
      map.current.on('mouseleave', 'aircraft-trails-3d', () => { map.current.getCanvas().style.cursor = ''; });
    }

    map.current.on('click', handleMapClick);

    return () => {
      if (map.current) {
        try {
          map.current.off('click', 'aircraft-labels', handleAircraftClick);
          map.current.off('click', 'aircraft-trails-3d', handleAircraftClick);
          map.current.off('click', handleMapClick);
        } catch (e) {}
      }
    };
  }, [mapLoaded, aircraft, selectedAircraft]);

  // Fetch aircraft photo when selectedAircraft changes
  useEffect(() => {
    if (!selectedAircraft) {
      setAircraftPhoto(null);
      setShowAircraftPanel(false);
      return;
    }

    setShowAircraftPanel(true);
    setAircraftPhotoLoading(true);
    setAircraftPhoto(null);

    const hex = selectedAircraft.hex?.toUpperCase();
    const reg = selectedAircraft.registration;

    // Vercel API Route를 통한 사진 조회 (CORS 해결)
    const fetchPhoto = async () => {
      try {
        const params = new URLSearchParams();
        if (hex) params.append('hex', hex);
        if (reg) params.append('reg', reg);

        const res = await fetch(`/api/aircraft-photo?${params}`);
        const data = await res.json();

        if (data.image) {
          setAircraftPhoto(data);
        }
        setAircraftPhotoLoading(false);
      } catch (err) {
        console.warn('Failed to fetch aircraft photo:', err);
        setAircraftPhotoLoading(false);
      }
    };

    fetchPhoto();
  }, [selectedAircraft?.hex]);

  // Fetch aircraft details from hexdb.io when selectedAircraft changes
  useEffect(() => {
    if (!selectedAircraft) {
      setAircraftDetails(null);
      return;
    }

    const hex = selectedAircraft.hex?.toUpperCase();
    if (!hex) return;

    setAircraftDetailsLoading(true);
    setAircraftDetails(null);

    const fetchDetails = async () => {
      try {
        const res = await fetch(`https://hexdb.io/api/v1/aircraft/${hex}`);
        if (res.ok) {
          const data = await res.json();
          setAircraftDetails(data);
        }
      } catch (err) {
        console.warn('Failed to fetch aircraft details from hexdb.io:', err);
      } finally {
        setAircraftDetailsLoading(false);
      }
    };

    fetchDetails();
  }, [selectedAircraft?.hex]);

  // Fetch flight route from FlightRadar24 (primary) or aviationstack (fallback)
  useEffect(() => {
    if (!selectedAircraft) {
      setFlightSchedule(null);
      return;
    }

    const callsign = selectedAircraft.callsign?.trim();
    const hex = selectedAircraft.hex;
    if (!callsign && !hex) return;

    setFlightScheduleLoading(true);
    setFlightSchedule(null);

    const fetchSchedule = async () => {
      // ICAO to IATA 변환 맵 (UBIKAIS 데이터용)
      const icaoToIata = {
        'RKSI': 'ICN', 'RKSS': 'GMP', 'RKPK': 'PUS', 'RKPC': 'CJU',
        'RKPU': 'USN', 'RKTN': 'TAE', 'RKTU': 'CJJ', 'RKJB': 'MWX',
        'RKNY': 'YNY', 'RKJY': 'RSU', 'RKPS': 'HIN', 'RKTH': 'KPO',
        'RJTT': 'HND', 'RJAA': 'NRT', 'RJBB': 'KIX', 'RJOO': 'ITM',
        'RJFF': 'FUK', 'RJCC': 'CTS', 'VHHH': 'HKG', 'RCTP': 'TPE',
        'WSSS': 'SIN', 'VTBS': 'BKK', 'WMKK': 'KUL', 'RPLL': 'MNL',
        'ZGGG': 'CAN', 'ZSPD': 'PVG', 'ZSSS': 'SHA', 'ZBAA': 'PEK',
        'VVTS': 'SGN', 'VVNB': 'HAN', 'VVCR': 'CXR', 'VVDN': 'DAD', 'VVPQ': 'PQC',
        'OMDB': 'DXB', 'OTHH': 'DOH', 'HAAB': 'ADD', 'LTFM': 'IST',
        'KLAX': 'LAX', 'KJFK': 'JFK', 'KORD': 'ORD', 'KCVG': 'CVG', 'PANC': 'ANC',
        'EDDF': 'FRA', 'EDDP': 'LEJ', 'EBBR': 'BRU', 'LIMC': 'MXP',
        'ZMCK': 'UBN', 'WBKK': 'BKI', 'ZSYT': 'YNT'
      };

      try {
        // 1차: 로컬 UBIKAIS 정적 JSON 파일 직접 검색 (API 없이 작동)
        const reg = selectedAircraft?.registration;
        try {
          const ubikaisRes = await fetch('/flight_schedule.json');
          if (ubikaisRes.ok) {
            const ubikaisData = await ubikaisRes.json();
            const departures = ubikaisData.departures || [];
            let matchedFlight = null;

            // callsign으로 검색
            if (callsign) {
              const normalizedCallsign = callsign.replace(/\s/g, '').toUpperCase();
              matchedFlight = departures.find(f => {
                const flightNum = f.flight_number?.replace(/\s/g, '').toUpperCase();
                return flightNum === normalizedCallsign ||
                       flightNum === normalizedCallsign.replace(/^([A-Z]+)0*/, '$1');
              });
            }

            // registration으로 검색
            if (!matchedFlight && reg) {
              const normalizedReg = reg.replace(/-/g, '').toUpperCase();
              matchedFlight = departures.find(f => {
                const flightReg = f.registration?.replace(/-/g, '').toUpperCase();
                return flightReg === normalizedReg;
              });
            }

            if (matchedFlight) {
              const originIcao = matchedFlight.origin;
              const destIcao = matchedFlight.destination;
              setFlightSchedule({
                flight: { iata: matchedFlight.flight_number, icao: callsign },
                departure: originIcao ? {
                  iata: icaoToIata[originIcao] || originIcao,
                  icao: originIcao,
                  airport: AIRPORT_DATABASE[originIcao]?.name
                } : null,
                arrival: destIcao ? {
                  iata: icaoToIata[destIcao] || destIcao,
                  icao: destIcao,
                  airport: AIRPORT_DATABASE[destIcao]?.name
                } : null,
                flight_status: matchedFlight.status,
                schedule: {
                  std: matchedFlight.std,
                  etd: matchedFlight.etd,
                  atd: matchedFlight.atd,
                  sta: matchedFlight.sta,
                  eta: matchedFlight.eta,
                  status: matchedFlight.status,
                  nature: matchedFlight.nature
                },
                aircraft_info: {
                  registration: matchedFlight.registration,
                  type: matchedFlight.aircraft_type
                },
                _source: 'ubikais',
                _lastUpdated: ubikaisData.last_updated
              });
              setFlightScheduleLoading(false);
              console.log('UBIKAIS match found:', matchedFlight.flight_number);
              return;
            }
          }
        } catch (e) {
          console.warn('UBIKAIS static JSON search error:', e.message);
        }

        // 2차: UBIKAIS + FlightRadar24 통합 API로 출발/도착 정보 가져오기
        const params = new URLSearchParams();
        if (callsign) params.append('callsign', callsign);
        if (hex) params.append('hex', hex);
        if (reg) params.append('reg', reg);

        const fr24Res = await fetch(`/api/flight-route?${params}`);
        if (fr24Res.ok) {
          const routeData = await fr24Res.json();
          if (routeData?.origin?.iata || routeData?.destination?.iata) {
            // UBIKAIS 또는 FR24 데이터를 통합 형식으로 변환
            const isUbikais = routeData.source === 'ubikais';
            setFlightSchedule({
              flight: { iata: routeData.callsign, icao: callsign },
              departure: routeData.origin ? {
                iata: routeData.origin.iata,
                icao: routeData.origin.icao,
                airport: routeData.origin.name || AIRPORT_DATABASE[routeData.origin.icao]?.name
              } : null,
              arrival: routeData.destination ? {
                iata: routeData.destination.iata,
                icao: routeData.destination.icao,
                airport: routeData.destination.name || AIRPORT_DATABASE[routeData.destination.icao]?.name
              } : null,
              flight_status: routeData.schedule?.status || routeData.status?.text || 'active',
              // UBIKAIS/FR24 스케줄 정보 (모든 소스에서 사용)
              schedule: routeData.schedule || null,
              aircraft_info: routeData.aircraft,
              // FR24 항공기 사진 (fallback용)
              aircraft_images: routeData.aircraft?.images || [],
              _source: routeData.source,
              _lastUpdated: routeData.lastUpdated
            });
            setFlightScheduleLoading(false);
            return;
          }
        }

        // 2차: aviationstack API 백업 (FR24에서 못 찾으면)
        if (AVIATIONSTACK_API_KEY && callsign) {
          const icaoMatch = callsign.match(/^([A-Z]{3})(\d+)/);
          let flightNumber = callsign;

          if (icaoMatch) {
            const icaoCode = icaoMatch[1];
            const number = icaoMatch[2];
            const iataCode = ICAO_TO_IATA[icaoCode];
            if (iataCode) {
              flightNumber = iataCode + number;
            }
          }

          const avRes = await fetch(`/api/flight-schedule?flight=${flightNumber}`);
          if (avRes.ok) {
            const avData = await avRes.json();
            if (avData?.data?.length > 0) {
              setFlightSchedule({ ...avData.data[0], _source: 'aviationstack' });
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch flight schedule:', err);
      } finally {
        setFlightScheduleLoading(false);
      }
    };

    fetchSchedule();
  }, [selectedAircraft?.hex, selectedAircraft?.callsign]);

  // Fetch flight track from OpenSky Network tracks API when selectedAircraft changes
  useEffect(() => {
    if (!selectedAircraft) {
      setFlightTrack(null);
      return;
    }

    const hex = selectedAircraft.hex?.toLowerCase();
    if (!hex) return;

    setFlightTrackLoading(true);
    setFlightTrack(null);

    const fetchTrack = async () => {
      try {
        // OpenSky tracks API - time=0 means current flight
        // path: [[time, lat, lon, baro_altitude, true_track, on_ground], ...]
        const res = await fetch(
          `https://opensky-network.org/api/tracks/all?icao24=${hex}&time=0`
        );
        if (res.ok) {
          const data = await res.json();
          if (data && data.path && data.path.length > 0) {
            // path 배열을 그래프용 데이터로 변환
            const trackData = data.path.map(p => ({
              time: p[0],
              lat: p[1],
              lon: p[2],
              altitude_ft: p[3] ? Math.round(p[3] * 3.28084) : 0, // meters to feet
              track: p[4],
              on_ground: p[5]
            }));
            setFlightTrack({
              icao24: data.icao24,
              callsign: data.callsign,
              startTime: data.startTime,
              endTime: data.endTime,
              path: trackData
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch flight track from OpenSky:', err);
      } finally {
        setFlightTrackLoading(false);
      }
    };

    fetchTrack();
  }, [selectedAircraft?.hex]);

  // Korea Airspace Routes and Waypoints layer
  useEffect(() => {
    if (!map.current || !mapLoaded || !koreaAirspaceData) return;

    const safeRemoveLayer = (id) => { try { if (map.current.getLayer(id)) map.current.removeLayer(id); } catch (e) {} };
    const safeRemoveSource = (id) => { try { if (map.current.getSource(id)) map.current.removeSource(id); } catch (e) {} };

    // Clean up existing layers
    ['korea-routes', 'korea-routes-3d', 'korea-routes-labels', 'korea-waypoints', 'korea-waypoint-labels', 'korea-navaids', 'korea-navaid-labels',
     'korea-airspaces-fill', 'korea-airspaces-3d', 'korea-airspaces-outline', 'korea-airspaces-labels'].forEach(safeRemoveLayer);
    ['korea-routes', 'korea-routes-3d', 'korea-waypoints', 'korea-waypoint-labels-src', 'korea-navaids', 'korea-airspaces'].forEach(safeRemoveSource);

    // Helper function to create ribbon polygon for 3D route segments
    const createRouteRibbon = (p1, p2, width = 0.003) => {
      const dx = p2.lon - p1.lon;
      const dy = p2.lat - p1.lat;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.0001) return null;
      // Perpendicular unit vector
      const px = -dy / len * width;
      const py = dx / len * width;
      return [
        [p1.lon - px, p1.lat - py],
        [p1.lon + px, p1.lat + py],
        [p2.lon + px, p2.lat + py],
        [p2.lon - px, p2.lat - py],
        [p1.lon - px, p1.lat - py] // close polygon
      ];
    };

    // Routes layer
    if (showKoreaRoutes && koreaAirspaceData.routes?.length > 0) {
      // Create line features for 2D view and labels
      const routeLineFeatures = koreaAirspaceData.routes
        .filter(route => route.points?.length >= 2)
        .map(route => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: route.points.map(p => [p.lon, p.lat])
          },
          properties: {
            name: route.name,
            type: route.type,
            color: route.type === 'RNAV' ? '#00BFFF' : '#FFD700'
          }
        }));

      // Helper to clamp MEA to reasonable values (max FL600 = 60000ft)
      const clampMEA = (mea) => {
        if (!mea || mea <= 0) return 5000; // default
        if (mea > 60000) return 5000; // invalid data, use default
        return mea;
      };

      // Create 3D ribbon features for fill-extrusion
      const route3dFeatures = [];
      koreaAirspaceData.routes.forEach(route => {
        if (!route.points || route.points.length < 2) return;
        const color = route.type === 'RNAV' ? '#00BFFF' : '#FFD700';
        for (let i = 0; i < route.points.length - 1; i++) {
          const p1 = route.points[i];
          const p2 = route.points[i + 1];
          const ribbon = createRouteRibbon(p1, p2, 0.004);
          if (!ribbon) continue;
          // Use MEA (Minimum Enroute Altitude) for height, clamped to reasonable values
          const alt1 = clampMEA(p1.mea_ft);
          const alt2 = clampMEA(p2.mea_ft);
          const avgAltM = ftToM((alt1 + alt2) / 2);
          route3dFeatures.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ribbon] },
            properties: {
              name: route.name,
              color: color,
              height: avgAltM + 50, // Slight thickness
              base: avgAltM
            }
          });
        }
      });

      if (routeLineFeatures.length > 0) {
        map.current.addSource('korea-routes', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: routeLineFeatures }
        });

        // 3D view: use fill-extrusion for routes
        if (is3DView && show3DAltitude && route3dFeatures.length > 0) {
          map.current.addSource('korea-routes-3d', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: route3dFeatures }
          });
          map.current.addLayer({
            id: 'korea-routes-3d',
            type: 'fill-extrusion',
            source: 'korea-routes-3d',
            paint: {
              'fill-extrusion-color': ['get', 'color'],
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'base'],
              'fill-extrusion-opacity': 0.7
            }
          });
        } else {
          // 2D view: use line layer
          map.current.addLayer({
            id: 'korea-routes',
            type: 'line',
            source: 'korea-routes',
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 8, 2, 12, 3],
              'line-opacity': 0.7,
              'line-dasharray': [2, 1]
            }
          });
        }

        // Route name labels along the line
        map.current.addLayer({
          id: 'korea-routes-labels',
          type: 'symbol',
          source: 'korea-routes',
          minzoom: 6,
          layout: {
            'symbol-placement': 'line',
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-rotation-alignment': 'map',
            'text-allow-overlap': false,
            'symbol-spacing': 300
          },
          paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': 'rgba(0,0,0,0.9)',
            'text-halo-width': 1.5
          }
        });
      }
    }

    // Waypoints layer - 3D mode shows at altitude
    if (showKoreaWaypoints && koreaAirspaceData.waypoints?.length > 0) {
      // Create a map of waypoint altitudes from route data (clamp to reasonable values)
      const waypointAltitudes = {};
      if (koreaAirspaceData.routes) {
        koreaAirspaceData.routes.forEach(route => {
          if (route.points) {
            route.points.forEach(p => {
              if (p.name && p.mea_ft && p.mea_ft > 0 && p.mea_ft <= 60000) {
                // Keep highest altitude for each waypoint (only valid altitudes)
                if (!waypointAltitudes[p.name] || waypointAltitudes[p.name] < p.mea_ft) {
                  waypointAltitudes[p.name] = p.mea_ft;
                }
              }
            });
          }
        });
      }

      // 3D waypoints as small cylinders at altitude
      if (is3DView && show3DAltitude) {
        const wp3dFeatures = [];
        koreaAirspaceData.waypoints.forEach(wp => {
          const altFt = waypointAltitudes[wp.name] || 5000; // Default 5000ft if not found
          const altM = ftToM(altFt);
          // Create small diamond shape for waypoint
          const size = 0.008;
          const coords = [
            [wp.lon, wp.lat + size],
            [wp.lon + size, wp.lat],
            [wp.lon, wp.lat - size],
            [wp.lon - size, wp.lat],
            [wp.lon, wp.lat + size]
          ];
          wp3dFeatures.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: {
              name: wp.name,
              height: altM + 100,
              base: altM,
              color: '#00FF7F'
            }
          });
        });

        map.current.addSource('korea-waypoints', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: wp3dFeatures }
        });
        map.current.addLayer({
          id: 'korea-waypoints',
          type: 'fill-extrusion',
          source: 'korea-waypoints',
          paint: {
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-opacity': 0.8
          }
        });
      } else {
        // 2D mode - use circles
        const wpFeatures = koreaAirspaceData.waypoints.map(wp => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
          properties: { name: wp.name, type: wp.type }
        }));

        map.current.addSource('korea-waypoints', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: wpFeatures }
        });
        map.current.addLayer({
          id: 'korea-waypoints',
          type: 'circle',
          source: 'korea-waypoints',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2, 10, 4, 14, 6],
            'circle-color': '#00FF7F',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff'
          }
        });
      }
      // Waypoint labels - need separate source for 3D mode with Point geometry
      if (is3DView && show3DAltitude) {
        // Create point features with altitude for labels
        const labelFeatures = koreaAirspaceData.waypoints.map(wp => {
          const altFt = waypointAltitudes[wp.name] || null;
          const altM = altFt ? ftToM(altFt) : 0;
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [wp.lon, wp.lat, altM] },
            properties: {
              name: wp.name,
              altitude_ft: altFt,
              label: altFt ? `${wp.name}\n${altFt}ft` : wp.name
            }
          };
        });
        map.current.addSource('korea-waypoint-labels-src', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: labelFeatures }
        });
        map.current.addLayer({
          id: 'korea-waypoint-labels',
          type: 'symbol',
          source: 'korea-waypoint-labels-src',
          minzoom: 7,
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 10,
            'text-offset': [0, -1],
            'text-anchor': 'bottom',
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
            'symbol-z-elevate': true
          },
          paint: {
            'text-color': '#00FF7F',
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 1
          }
        });
      } else {
        // 2D mode - add altitude info to labels
        const labelFeatures = koreaAirspaceData.waypoints.map(wp => {
          const altFt = waypointAltitudes[wp.name] || null;
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
            properties: {
              name: wp.name,
              altitude_ft: altFt,
              label: altFt ? `${wp.name}\n${altFt}ft` : wp.name
            }
          };
        });
        map.current.addSource('korea-waypoint-labels-src', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: labelFeatures }
        });
        map.current.addLayer({
          id: 'korea-waypoint-labels',
          type: 'symbol',
          source: 'korea-waypoint-labels-src',
          minzoom: 8,
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 10,
            'text-offset': [0, 1],
            'text-anchor': 'top',
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold']
          },
          paint: {
            'text-color': '#00FF7F',
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 1
          }
        });
      }
    }

    // NAVAIDs layer
    if (showKoreaNavaids && koreaAirspaceData.navaids?.length > 0) {
      const navaidFeatures = koreaAirspaceData.navaids.map(nav => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [nav.lon, nav.lat] },
        properties: {
          name: nav.ident || nav.name,
          type: nav.type,
          freq: nav.freq,
          label: `${nav.ident || ''} ${nav.type}\n${nav.freq || ''}MHz`
        }
      }));

      map.current.addSource('korea-navaids', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: navaidFeatures }
      });
      map.current.addLayer({
        id: 'korea-navaids',
        type: 'circle',
        source: 'korea-navaids',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 10, 8, 14, 12],
          'circle-color': '#FF69B4',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });
      map.current.addLayer({
        id: 'korea-navaid-labels',
        type: 'symbol',
        source: 'korea-navaids',
        minzoom: 7,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold']
        },
        paint: {
          'text-color': '#FF69B4',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1
        }
      });
    }

    // Airspaces layer (PRD, MOA, CATA, UA)
    if (showKoreaAirspaces && koreaAirspaceData.airspaces?.length > 0) {
      // 공역 유형별 색상
      const airspaceColors = {
        'P': '#FF0000',    // Prohibited - Red
        'R': '#FFA500',    // Restricted - Orange
        'D': '#FFFF00',    // Danger - Yellow
        'MOA': '#800080',  // Military - Purple
        'HTA': '#9932CC',  // Helicopter Training - Dark Orchid
        'CATA': '#4169E1', // Civil Aircraft Training - Royal Blue
        'UA': '#32CD32',   // Ultralight - Lime Green
        'ALERT': '#FF6347' // Alert - Tomato
      };

      const airspaceFeatures = koreaAirspaceData.airspaces
        .filter(asp => asp.boundary && asp.boundary.length >= 3)
        .map(asp => {
          // Close the polygon if not closed
          let boundary = [...asp.boundary];
          if (boundary.length > 0) {
            const first = boundary[0];
            const last = boundary[boundary.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              boundary.push([first[0], first[1]]);
            }
          }
          return {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [boundary]
            },
            properties: {
              name: asp.name,
              type: asp.type,
              category: asp.category,
              color: airspaceColors[asp.type] || '#808080',
              upper_limit: asp.upper_limit_ft || 5000,
              lower_limit: asp.lower_limit_ft || 0,
              upperAltM: ftToM(asp.upper_limit_ft || 5000),
              lowerAltM: ftToM(asp.lower_limit_ft || 0),
              active_time: asp.active_time || ''
            }
          };
        });

      map.current.addSource('korea-airspaces', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: airspaceFeatures }
      });

      // 3D view: use fill-extrusion for airspaces
      if (is3DView && show3DAltitude) {
        map.current.addLayer({
          id: 'korea-airspaces-3d',
          type: 'fill-extrusion',
          source: 'korea-airspaces',
          paint: {
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'upperAltM'],
            'fill-extrusion-base': ['get', 'lowerAltM'],
            'fill-extrusion-opacity': 0.25
          }
        });
      } else {
        // 2D view: use fill layer
        map.current.addLayer({
          id: 'korea-airspaces-fill',
          type: 'fill',
          source: 'korea-airspaces',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.15
          }
        });
      }

      // Outline layer (always show)
      map.current.addLayer({
        id: 'korea-airspaces-outline',
        type: 'line',
        source: 'korea-airspaces',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.8
        }
      });

      // Labels
      map.current.addLayer({
        id: 'korea-airspaces-labels',
        type: 'symbol',
        source: 'korea-airspaces',
        minzoom: 6,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-allow-overlap': false,
          'symbol-placement': 'point'
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1
        }
      });
    }
  }, [mapLoaded, koreaAirspaceData, showKoreaRoutes, showKoreaWaypoints, showKoreaNavaids, showKoreaAirspaces, is3DView, show3DAltitude]);

  // Wind thread animation - thin silk-like threads with fade in/out
  useEffect(() => {
    if (!map.current || !mapLoaded || !weatherData?.metar?.wdir || !data?.airport) return;

    const windDir = weatherData.metar.wdir;
    const windSpd = weatherData.metar.wspd || 5;
    if (windDir === 'VRB' || windDir === 0) return;

    const centerLon = data.airport.lon || 129.3518;
    const centerLat = data.airport.lat || 35.5934;
    const windRad = ((windDir + 180) % 360) * Math.PI / 180;

    // Thread configuration
    const threadCount = 30;
    const areaRadius = 0.022;
    const maxLife = 180; // Frames until respawn

    // Initialize threads
    let threads = [];
    for (let i = 0; i < threadCount; i++) {
      threads.push(createThread());
    }

    function createThread() {
      // Start from upwind edge with random lateral position
      const lateralOffset = (Math.random() - 0.5) * areaRadius * 2;
      const startLon = centerLon + Math.sin(windRad + Math.PI) * areaRadius * 1.2 + Math.cos(windRad) * lateralOffset;
      const startLat = centerLat + Math.cos(windRad + Math.PI) * areaRadius * 1.2 - Math.sin(windRad) * lateralOffset;
      return {
        points: [[startLon, startLat]],
        speed: 0.6 + Math.random() * 0.5,
        life: 0,
        maxLife: maxLife * (0.7 + Math.random() * 0.6)
      };
    }

    const sourceId = 'wind-threads';
    const glowSourceId = 'wind-threads-glow';
    const layerId = 'wind-threads-layer';
    const glowLayerId = 'wind-threads-glow-layer';

    [layerId, glowLayerId].forEach(id => { try { if (map.current.getLayer(id)) map.current.removeLayer(id); } catch (e) {} });
    [sourceId, glowSourceId].forEach(id => { try { if (map.current.getSource(id)) map.current.removeSource(id); } catch (e) {} });

    map.current.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.current.addSource(glowSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    // Glow layer (wider, softer)
    map.current.addLayer({
      id: glowLayerId,
      type: 'line',
      source: glowSourceId,
      paint: {
        'line-color': '#00d4ff',
        'line-width': 3,
        'line-opacity': ['get', 'opacity'],
        'line-blur': 2
      }
    });

    // Main thread layer
    map.current.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['get', 'width'],
        'line-opacity': ['get', 'opacity']
      }
    });

    const baseSpeed = 0.00012 * (windSpd / 10 + 0.5);
    let animFrame;

    const animate = () => {
      const features = [];
      const glowFeatures = [];

      threads.forEach((thread, idx) => {
        thread.life++;

        // Calculate life progress (0 to 1)
        const lifeProgress = thread.life / thread.maxLife;

        // Fade in (0-20%), full (20-70%), fade out (70-100%)
        let opacity;
        if (lifeProgress < 0.15) {
          opacity = lifeProgress / 0.15; // Fade in
        } else if (lifeProgress < 0.7) {
          opacity = 1; // Full
        } else {
          opacity = 1 - (lifeProgress - 0.7) / 0.3; // Fade out
        }
        opacity = Math.max(0, Math.min(1, opacity)) * 0.6;

        // Respawn if life ended
        if (thread.life >= thread.maxLife) {
          threads[idx] = createThread();
          return;
        }

        // Move head
        const head = thread.points[0];
        const wobble = (Math.random() - 0.5) * 0.00002;
        const newLon = head[0] + Math.sin(windRad) * baseSpeed * thread.speed + Math.cos(windRad) * wobble;
        const newLat = head[1] + Math.cos(windRad) * baseSpeed * thread.speed - Math.sin(windRad) * wobble;

        // Add new point at head
        thread.points.unshift([newLon, newLat]);

        // Limit trail length based on life
        const maxPoints = Math.min(50, Math.floor(thread.life * 0.5) + 5);
        if (thread.points.length > maxPoints) {
          thread.points = thread.points.slice(0, maxPoints);
        }

        if (thread.points.length >= 2 && opacity > 0.02) {
          // Create gradient segments (head is brighter, tail fades)
          const segmentCount = Math.min(5, Math.floor(thread.points.length / 3));
          const pointsPerSegment = Math.floor(thread.points.length / segmentCount);

          for (let s = 0; s < segmentCount; s++) {
            const startIdx = s * pointsPerSegment;
            const endIdx = Math.min((s + 1) * pointsPerSegment + 1, thread.points.length);
            const segmentPoints = thread.points.slice(startIdx, endIdx);

            if (segmentPoints.length >= 2) {
              // Opacity decreases towards tail
              const segOpacity = opacity * (1 - s * 0.18);
              const segWidth = 1.2 - s * 0.15;

              features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: segmentPoints },
                properties: { opacity: segOpacity, width: Math.max(0.5, segWidth) }
              });

              // Glow only for head segments
              if (s < 2) {
                glowFeatures.push({
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: segmentPoints },
                  properties: { opacity: segOpacity * 0.3 }
                });
              }
            }
          }
        }
      });

      try {
        map.current?.getSource(sourceId)?.setData({ type: 'FeatureCollection', features });
        map.current?.getSource(glowSourceId)?.setData({ type: 'FeatureCollection', features: glowFeatures });
      } catch (e) {}

      animFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animFrame);
      [layerId, glowLayerId].forEach(id => { try { if (map.current?.getLayer(id)) map.current.removeLayer(id); } catch (e) {} });
      [sourceId, glowSourceId].forEach(id => { try { if (map.current?.getSource(id)) map.current.removeSource(id); } catch (e) {} });
    };
  }, [weatherData?.metar?.wdir, weatherData?.metar?.wspd, mapLoaded, data?.airport]);

  // Lightning layer rendering
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const sourceId = 'lightning-strikes';
    const layerId = 'lightning-strikes-layer';
    const glowLayerId = 'lightning-glow-layer';

    // Remove existing
    [layerId, glowLayerId].forEach(id => { try { if (map.current.getLayer(id)) map.current.removeLayer(id); } catch (e) {} });
    try { if (map.current.getSource(sourceId)) map.current.removeSource(sourceId); } catch (e) {}

    if (!showLightning || !lightningData?.strikes?.length) return;

    const features = lightningData.strikes.map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { amplitude: Math.abs(s.amplitude || 30) }
    }));

    map.current.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features }
    });

    // Glow layer
    map.current.addLayer({
      id: glowLayerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 12,
        'circle-color': '#ffff00',
        'circle-opacity': 0.3,
        'circle-blur': 1
      }
    });

    // Main strike layer
    map.current.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 4,
        'circle-color': '#ffff00',
        'circle-stroke-color': '#ff8800',
        'circle-stroke-width': 2,
        'circle-opacity': 0.9
      }
    });

    return () => {
      [layerId, glowLayerId].forEach(id => { try { if (map.current?.getLayer(id)) map.current.removeLayer(id); } catch (e) {} });
      try { if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId); } catch (e) {}
    };
  }, [showLightning, lightningData, mapLoaded]);

  // SIGMET rendering
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const sourceId = 'sigmet-areas';
    const layerId = 'sigmet-fill-layer';
    const outlineLayerId = 'sigmet-outline-layer';
    const labelLayerId = 'sigmet-label-layer';

    [layerId, outlineLayerId, labelLayerId].forEach(id => { try { if (map.current.getLayer(id)) map.current.removeLayer(id); } catch (e) {} });
    try { if (map.current.getSource(sourceId)) map.current.removeSource(sourceId); } catch (e) {}

    if (!showSigmet || !sigmetData) return;

    // Process SIGMET data
    const features = [];
    const intlSigmets = sigmetData.international || [];

    intlSigmets.forEach((sig, idx) => {
      if (sig.coords && sig.coords.length >= 3) {
        const color = sig.hazard === 'TURB' ? '#ff9800' :
                      sig.hazard === 'ICE' ? '#2196f3' :
                      sig.hazard === 'TS' || sig.hazard === 'CONVECTIVE' ? '#f44336' :
                      sig.hazard === 'VA' ? '#9c27b0' : '#ff5722';

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [sig.coords.map(c => [c.lon, c.lat]).concat([[sig.coords[0].lon, sig.coords[0].lat]])]
          },
          properties: {
            type: sig.hazard || 'SIGMET',
            color,
            raw: sig.rawSigmet || ''
          }
        });
      }
    });

    if (features.length === 0) return;

    map.current.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features }
    });

    map.current.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.2
      }
    });

    map.current.addLayer({
      id: outlineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2,
        'line-dasharray': [4, 2]
      }
    });

    return () => {
      [layerId, outlineLayerId, labelLayerId].forEach(id => { try { if (map.current?.getLayer(id)) map.current.removeLayer(id); } catch (e) {} });
      try { if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId); } catch (e) {}
    };
  }, [showSigmet, sigmetData, mapLoaded]);


  // Radar overlay rendering
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const sourceId = 'radar-overlay';
    const layerId = 'radar-layer';

    try { if (map.current.getLayer(layerId)) map.current.removeLayer(layerId); } catch (e) {}
    try { if (map.current.getSource(sourceId)) map.current.removeSource(sourceId); } catch (e) {}

    if (!showRadar) return;

    // RainViewer API - global radar tiles
    const timestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago

    map.current.addSource(sourceId, {
      type: 'raster',
      tiles: [
        `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/{z}/{x}/{y}/2/1_1.png`
      ],
      tileSize: 256
    });

    map.current.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': 0.6,
        'raster-fade-duration': 0
      }
    }, 'aeroway-line'); // Place under airport features

    return () => {
      try { if (map.current?.getLayer(layerId)) map.current.removeLayer(layerId); } catch (e) {}
      try { if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId); } catch (e) {}
    };
  }, [showRadar, mapLoaded]);

  // Surface wind - removed (per user request, no background particle animation)

  const flyToAirport = () => {
    map.current?.flyTo({ center: [129.3518, 35.5934], zoom: 12, pitch: is3DView ? 60 : 0, bearing: is3DView ? -30 : 0, duration: 2000 });
  };

  const chartsByRunway = {
    '18': Object.entries(PROCEDURE_CHARTS).filter(([_, c]) => c.runway === '18'),
    '36': Object.entries(PROCEDURE_CHARTS).filter(([_, c]) => c.runway === '36'),
  };

  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <div ref={mapContainer} id="map" />

      {/* Time & Weather Display */}
      <div className="time-weather-display">
        <div className="time-display">
          <span className="time-utc">{formatUTC(currentTime)}</span>
          <span className="time-separator">|</span>
          <span className="time-kst">{formatKST(currentTime)}</span>
        </div>
        {weatherData?.metar && (
          <div className="weather-compact">
            <span className="wx-label">METAR</span>
            <span className={`wx-cat ${weatherData.metar.fltCat?.toLowerCase() || 'vfr'}`}>{weatherData.metar.fltCat || 'VFR'}</span>
            <span className="wx-time" title="관측시간 (KST)">{parseMetarTime(weatherData.metar)}</span>
            {parseMetar(weatherData.metar)?.wind && <span className="wx-item" title={parseMetar(weatherData.metar).windMs}>{parseMetar(weatherData.metar).wind}</span>}
            {parseMetar(weatherData.metar)?.visibility && <span className="wx-item">{parseMetar(weatherData.metar).visibility}</span>}
            {parseMetar(weatherData.metar)?.rvr && <span className="wx-item wx-rvr">{parseMetar(weatherData.metar).rvr}</span>}
            {parseMetar(weatherData.metar)?.temp && <span className="wx-item">{parseMetar(weatherData.metar).temp}</span>}
            {weatherData.metar.altim && <span className="wx-item">Q{weatherData.metar.altim}</span>}
            <button
              className={`wx-metar-btn ${metarPinned ? 'pinned' : ''}`}
              onMouseEnter={() => !metarPinned && setShowMetarPopup(true)}
              onMouseLeave={() => !metarPinned && setShowMetarPopup(false)}
              onClick={() => { setMetarPinned(!metarPinned); setShowMetarPopup(!metarPinned); }}
            >
              METAR
            </button>
            {weatherData?.taf && (
              <button
                className={`wx-metar-btn ${tafPinned ? 'pinned' : ''}`}
                onMouseEnter={() => !tafPinned && setShowTafPopup(true)}
                onMouseLeave={() => !tafPinned && setShowTafPopup(false)}
                onClick={() => { setTafPinned(!tafPinned); setShowTafPopup(!tafPinned); }}
              >
                TAF
              </button>
            )}
          </div>
        )}
        {(showMetarPopup || metarPinned) && weatherData?.metar && (
          <div className="metar-popup metar-popup-compact">
            <div className="metar-compact-row">
              <span className="mc-item"><b>Wind</b> {parseMetar(weatherData.metar)?.wind} ({weatherData.metar.wspdMs}m/s)</span>
              <span className="mc-item"><b>Vis</b> {weatherData.metar.visibM}m</span>
              {(weatherData.metar.lRvr || weatherData.metar.rRvr) && <span className="mc-item mc-rvr"><b>RVR</b> {weatherData.metar.lRvr || '-'}/{weatherData.metar.rRvr || '-'}m</span>}
              <span className="mc-item"><b>Temp</b> {weatherData.metar.temp}/{weatherData.metar.dewp}°C</span>
              <span className="mc-item"><b>QNH</b> {weatherData.metar.altim}</span>
              {weatherData.metar.ceiling && <span className="mc-item"><b>Ceil</b> {weatherData.metar.ceiling}ft</span>}
            </div>
            <div className="metar-raw-line">{weatherData.metar.rawOb}</div>
          </div>
        )}
        {(showTafPopup || tafPinned) && weatherData?.taf && (
          <div className="metar-popup taf-popup">
            <div className="metar-popup-section">
              <div className="metar-popup-label">TAF</div>
              <div className="metar-popup-text">{weatherData.taf.rawTAF}</div>
            </div>
          </div>
        )}
      </div>

      {/* View Controls */}
      <div className="view-controls">
        <button className={`view-btn ${is3DView ? 'active' : ''}`} onClick={() => setIs3DView(true)}>3D</button>
        <button className={`view-btn ${!is3DView ? 'active' : ''}`} onClick={() => setIs3DView(false)}>2D</button>
        <button className="view-btn icon-btn" onClick={() => setIsDarkMode(!isDarkMode)} title={isDarkMode ? '라이트 모드' : '다크 모드'}>{isDarkMode ? '🌙' : '☀️'}</button>
        <button className={`view-btn icon-btn ${showSatellite ? 'active' : ''}`} onClick={() => setShowSatellite(!showSatellite)} title="위성 사진">🛰️</button>
        <div className="wx-dropdown-wrapper">
          <button className={`view-btn ${wxLayersExpanded ? 'active' : ''}`} onClick={() => setWxLayersExpanded(!wxLayersExpanded)} title="기상정보">기상</button>
          {wxLayersExpanded && (
            <div className="wx-dropdown">
              <div className={`wx-dropdown-item ${showRadar ? 'active' : ''}`} onClick={() => setShowRadar(!showRadar)}>
                <input type="checkbox" checked={showRadar} readOnly />
                <span>레이더</span>
              </div>
              <div className={`wx-dropdown-item ${showSatelliteWx ? 'active' : ''}`} onClick={() => setShowSatelliteWx(!showSatelliteWx)}>
                <input type="checkbox" checked={showSatelliteWx} readOnly />
                <span>위성영상</span>
              </div>
              <div className={`wx-dropdown-item ${showLightning ? 'active' : ''}`} onClick={() => setShowLightning(!showLightning)}>
                <input type="checkbox" checked={showLightning} readOnly />
                <span>낙뢰</span>
              </div>
              <div className={`wx-dropdown-item ${showSigmet ? 'active' : ''}`} onClick={() => setShowSigmet(!showSigmet)}>
                <input type="checkbox" checked={showSigmet} readOnly />
                <span>SIGMET</span>
              </div>
              <div className="wx-dropdown-divider"></div>
              <div className="wx-dropdown-item" onClick={() => setShowWxPanel(true)}>
                <span>상세 기상정보 ▶</span>
              </div>
            </div>
          )}
        </div>
        <div className="atc-dropdown-wrapper">
          <button className={`view-btn ${showAtcPanel || atcOnlyMode ? 'active' : ''}`} onClick={() => setShowAtcPanel(!showAtcPanel)} title="관제구역">관제</button>
          {showAtcPanel && atcData && (
            <div className="atc-dropdown">
              <div className="atc-dropdown-header">
                <span className="atc-dropdown-title">{atcData.FIR.name}</span>
                <button className="atc-clear-btn" onClick={() => setSelectedAtcSectors(new Set())}>초기화</button>
              </div>
              <div className="atc-dropdown-batch" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', marginBottom: '8px' }}>
                <button
                  className={`atc-mini-btn ${atcOnlyMode ? 'active' : ''}`}
                  style={{ width: '100%', background: atcOnlyMode ? '#00FF00' : 'rgba(0,255,0,0.2)', color: atcOnlyMode ? '#000' : '#00FF00' }}
                  onClick={() => {
                    setAtcOnlyMode(!atcOnlyMode);
                    if (!atcOnlyMode) {
                      // 레이더 모드 켜기: 검은 배경으로 변경하고 공항 중심으로 이동
                      setIsDarkMode(true);
                      setShowSatellite(false);
                      if (map.current) {
                        map.current.flyTo({ center: [129.3517, 35.5935], zoom: 5, pitch: 0, bearing: 0, duration: 1000 });
                      }
                    }
                  }}
                >
                  📡 레이더 뷰 ({radarRange}nm)
                </button>
                {atcOnlyMode && (
                  <div style={{ marginTop: '8px', padding: '4px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#00FF00', marginBottom: '4px' }}>
                      <span>범위:</span>
                      <span>{radarRange}nm</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="500"
                      step="50"
                      value={radarRange}
                      onChange={(e) => setRadarRange(parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: '#00FF00' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#888', marginTop: '2px' }}>
                      <span>50</span>
                      <span>150</span>
                      <span>300</span>
                      <span>500</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '11px', color: '#00FF00', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={radarBlackBackground}
                        onChange={(e) => setRadarBlackBackground(e.target.checked)}
                        style={{ accentColor: '#00FF00' }}
                      />
                      검은 배경
                    </label>
                  </div>
                )}
              </div>
              <div className="atc-dropdown-batch">
                <button className={`atc-mini-btn ${atcData.ACC.every(s => selectedAtcSectors.has(s.id)) ? 'active' : ''}`}
                  onClick={() => {
                    const ids = atcData.ACC.map(s => s.id);
                    const all = ids.every(id => selectedAtcSectors.has(id));
                    setSelectedAtcSectors(prev => { const n = new Set(prev); ids.forEach(id => all ? n.delete(id) : n.add(id)); return n; });
                  }}>ACC ({atcData.ACC.length})</button>
                <button className={`atc-mini-btn ${atcData.TMA.every(s => selectedAtcSectors.has(s.id)) ? 'active' : ''}`}
                  onClick={() => {
                    const ids = atcData.TMA.map(s => s.id);
                    const all = ids.every(id => selectedAtcSectors.has(id));
                    setSelectedAtcSectors(prev => { const n = new Set(prev); ids.forEach(id => all ? n.delete(id) : n.add(id)); return n; });
                  }}>TMA ({atcData.TMA.length})</button>
                <button className={`atc-mini-btn ${atcData.CTR.every(s => selectedAtcSectors.has(s.id)) ? 'active' : ''}`}
                  onClick={() => {
                    const ids = atcData.CTR.map(s => s.id);
                    const all = ids.every(id => selectedAtcSectors.has(id));
                    setSelectedAtcSectors(prev => { const n = new Set(prev); ids.forEach(id => all ? n.delete(id) : n.add(id)); return n; });
                  }}>CTR ({atcData.CTR.length})</button>
              </div>
              <div className="atc-dropdown-sections">
                {/* ACC */}
                <div className="atc-dropdown-section">
                  <div className="atc-section-label" onClick={() => setAtcExpanded(p => ({ ...p, ACC: !p.ACC }))}>
                    ACC <span className={`atc-expand-icon ${atcExpanded.ACC ? 'expanded' : ''}`}>▼</span>
                  </div>
                  {atcExpanded.ACC && (
                    <div className="atc-grid">
                      {atcData.ACC.map(s => (
                        <label key={s.id} className={`atc-chip ${selectedAtcSectors.has(s.id) ? 'selected' : ''}`} title={`${s.name}\n${s.vertical_limits}`}>
                          <input type="checkbox" checked={selectedAtcSectors.has(s.id)} onChange={e => setSelectedAtcSectors(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n; })} />
                          <span className="atc-chip-color" style={{ background: s.color }}></span>
                          <span className="atc-chip-name">{s.name.replace(/Daegu ACC - |Incheon ACC - /g, '')}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {/* TMA */}
                <div className="atc-dropdown-section">
                  <div className="atc-section-label" onClick={() => setAtcExpanded(p => ({ ...p, TMA: !p.TMA }))}>
                    TMA <span className={`atc-expand-icon ${atcExpanded.TMA ? 'expanded' : ''}`}>▼</span>
                  </div>
                  {atcExpanded.TMA && (
                    <div className="atc-grid">
                      {atcData.TMA.map(s => (
                        <label key={s.id} className={`atc-chip ${selectedAtcSectors.has(s.id) ? 'selected' : ''}`} title={`${s.name}\n${s.vertical_limits}`}>
                          <input type="checkbox" checked={selectedAtcSectors.has(s.id)} onChange={e => setSelectedAtcSectors(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n; })} />
                          <span className="atc-chip-color" style={{ background: s.color }}></span>
                          <span className="atc-chip-name">{s.name.replace(/ - .* TMA| TMA/g, '')}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {/* CTR */}
                <div className="atc-dropdown-section">
                  <div className="atc-section-label" onClick={() => setAtcExpanded(p => ({ ...p, CTR: !p.CTR }))}>
                    CTR <span className={`atc-expand-icon ${atcExpanded.CTR ? 'expanded' : ''}`}>▼</span>
                  </div>
                  {atcExpanded.CTR && (
                    <div className="atc-grid">
                      {atcData.CTR.map(s => (
                        <label key={s.id} className={`atc-chip ${selectedAtcSectors.has(s.id) ? 'selected' : ''}`} title={`${s.name}\n${s.vertical_limits || ''}`}>
                          <input type="checkbox" checked={selectedAtcSectors.has(s.id)} onChange={e => setSelectedAtcSectors(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n; })} />
                          <span className="atc-chip-color" style={{ background: s.color }}></span>
                          <span className="atc-chip-name">{s.name.replace(/ CTR/g, '')}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="notam-dropdown-wrapper">
          <button className={`view-btn ${showNotamPanel ? 'active' : ''}`} onClick={() => setShowNotamPanel(!showNotamPanel)} title="NOTAM">NOTAM</button>
          {showNotamPanel && (
            <div className="notam-dropdown">
              <div className="notam-dropdown-header">
                <span className="notam-dropdown-title">NOTAM</span>
                <div className="notam-header-controls">
                  <select
                    className="notam-period-select"
                    value={notamPeriod}
                    onChange={(e) => setNotamPeriod(e.target.value)}
                    title="기간"
                  >
                    <option value="current">현재 유효</option>
                    <option value="1month">1개월</option>
                    <option value="1year">1년</option>
                    <option value="all">전체</option>
                  </select>
                  <select
                    className="notam-location-select"
                    value={notamLocationFilter}
                    onChange={(e) => setNotamLocationFilter(e.target.value)}
                  >
                    <option value="">전체 지역</option>
                    {(() => {
                      const locations = [...new Set(notamData?.data?.map(n => n.location).filter(Boolean))];
                      const counts = {};
                      locations.forEach(loc => {
                        counts[loc] = notamData.data.filter(n => n.location === loc).length;
                      });

                      // 국제공항
                      const intlAirports = locations.filter(loc => KOREA_AIRPORTS[loc]?.type === 'international').sort();
                      // 국내공항
                      const domesticAirports = locations.filter(loc => KOREA_AIRPORTS[loc]?.type === 'domestic').sort();
                      // FIR/기타
                      const firOther = locations.filter(loc => KOREA_AIRPORTS[loc]?.type === 'fir').sort();
                      // 알 수 없는 지역
                      const others = locations.filter(loc => !KOREA_AIRPORTS[loc]).sort();

                      return (
                        <>
                          {intlAirports.length > 0 && (
                            <optgroup label="🌏 국제공항">
                              {intlAirports.map(loc => (
                                <option key={loc} value={loc}>{loc} {KOREA_AIRPORTS[loc]?.name} ({counts[loc]})</option>
                              ))}
                            </optgroup>
                          )}
                          {domesticAirports.length > 0 && (
                            <optgroup label="🏠 국내공항">
                              {domesticAirports.map(loc => (
                                <option key={loc} value={loc}>{loc} {KOREA_AIRPORTS[loc]?.name} ({counts[loc]})</option>
                              ))}
                            </optgroup>
                          )}
                          {firOther.length > 0 && (
                            <optgroup label="📡 FIR/ACC">
                              {firOther.map(loc => (
                                <option key={loc} value={loc}>{loc} {KOREA_AIRPORTS[loc]?.name} ({counts[loc]})</option>
                              ))}
                            </optgroup>
                          )}
                          {others.length > 0 && (
                            <optgroup label="기타">
                              {others.map(loc => (
                                <option key={loc} value={loc}>{loc} ({counts[loc]})</option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                  <button className="notam-refresh-btn" onClick={() => fetchNotamData(notamPeriod, true)} title="새로고침 (캐시 무시)">↻</button>
                  {notamCacheAge !== null && (
                    <span className="notam-cache-info" title="캐시된 데이터 사용 중">
                      📦 {Math.floor(notamCacheAge / 1000)}초 전
                    </span>
                  )}
                </div>
              </div>
              <div className="notam-search">
                <input
                  type="text"
                  placeholder="검색 (NOTAM 번호, 내용...)"
                  value={notamFilter}
                  onChange={(e) => setNotamFilter(e.target.value)}
                  className="notam-search-input"
                />
              </div>
              {/* 지도에 표시할 공항 선택 - 국가별 그룹화 */}
              <div className="notam-map-toggle-section">
                <span className="notam-map-toggle-label">지도 표시 필터 (좌표 있는 공항만):</span>
                {(() => {
                  const locations = [...new Set(notamData?.data?.map(n => n.location).filter(Boolean))];

                  // 좌표 있는 공항만 필터 (Q-line 좌표 또는 AIRPORT_COORDINATES)
                  const locationsWithCoords = locations.filter(loc => AIRPORT_COORDINATES[loc]);
                  const locationsNoCoords = locations.filter(loc => !AIRPORT_COORDINATES[loc]);

                  // 국가별로 그룹화 (좌표 있는 것만)
                  const byCountry = {};
                  locationsWithCoords.forEach(loc => {
                    const info = AIRPORT_DATABASE[loc];
                    const country = info?.country || 'OTHER';
                    if (!byCountry[country]) byCountry[country] = [];
                    byCountry[country].push(loc);
                  });

                  // 국가 우선순위 (한국 먼저)
                  const countryOrder = ['KR', 'JP', 'CN', 'TW', 'HK', 'VN', 'TH', 'SG', 'PH', 'US', 'OTHER'];
                  const sortedCountries = Object.keys(byCountry).sort((a, b) => {
                    const ai = countryOrder.indexOf(a);
                    const bi = countryOrder.indexOf(b);
                    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                  });

                  return (
                    <>
                      {sortedCountries.map(country => {
                        const countryInfo = COUNTRY_INFO[country];
                        const countryName = countryInfo?.name || '기타';
                        const countryFlag = countryInfo?.flag || '🌐';
                        const airportsInCountry = byCountry[country].sort();

                        // 한국은 타입별로 세분화
                        if (country === 'KR') {
                          const hub = airportsInCountry.filter(loc => AIRPORT_DATABASE[loc]?.type === 'hub');
                          const general = airportsInCountry.filter(loc => AIRPORT_DATABASE[loc]?.type === 'general');
                          const military = airportsInCountry.filter(loc => AIRPORT_DATABASE[loc]?.type === 'military');
                          const fir = airportsInCountry.filter(loc => AIRPORT_DATABASE[loc]?.type === 'fir');
                          const other = airportsInCountry.filter(loc => !['hub', 'general', 'military', 'fir'].includes(AIRPORT_DATABASE[loc]?.type));

                          // 공항별 NOTAM 수 계산 (유효한 것만: NOTAMC 제외, 만료된 것 제외)
                          const notamCounts = {};
                          const cancelledSetForCount = buildCancelledNotamSet(notamData?.data || []);
                          notamData?.data?.forEach(n => {
                            // NOTAMC 타입은 제외
                            const nType = getNotamType(n.full_text);
                            if (nType === 'C') return;
                            // 만료된 것도 제외
                            const validity = getNotamValidity(n, cancelledSetForCount);
                            if (!validity) return;
                            notamCounts[n.location] = (notamCounts[n.location] || 0) + 1;
                          });

                          const renderChips = (locs, label) => locs.length > 0 && (
                            <div className="notam-country-subgroup" key={label}>
                              <span className="notam-subgroup-label">{label}</span>
                              <div className="notam-map-location-chips">
                                {locs.map(loc => {
                                  const isActive = notamLocationsOnMap.has(loc);
                                  const info = AIRPORT_DATABASE[loc];
                                  const shortName = info?.name?.replace('국제공항', '').replace('공항', '').replace('비행장', '') || loc;
                                  const count = notamCounts[loc] || 0;
                                  return (
                                    <button
                                      key={loc}
                                      className={`notam-map-chip ${isActive ? 'active' : ''} ${info?.type || 'other'}`}
                                      onClick={() => {
                                        const newSet = new Set(notamLocationsOnMap);
                                        isActive ? newSet.delete(loc) : newSet.add(loc);
                                        setNotamLocationsOnMap(newSet);
                                      }}
                                      title={`${loc} ${info?.name || ''} (${count}건) - 지도에 ${isActive ? '숨기기' : '표시'}`}
                                    >
                                      {loc} {shortName !== loc ? shortName : ''} ({count})
                                    </button>
                                  );
                                })}
                                <button
                                  className="notam-select-all-btn"
                                  onClick={() => {
                                    const newSet = new Set(notamLocationsOnMap);
                                    const allSelected = locs.every(loc => newSet.has(loc));
                                    locs.forEach(loc => allSelected ? newSet.delete(loc) : newSet.add(loc));
                                    setNotamLocationsOnMap(newSet);
                                  }}
                                >
                                  {locs.every(loc => notamLocationsOnMap.has(loc)) ? '전체해제' : '전체선택'}
                                </button>
                              </div>
                            </div>
                          );

                          return (
                            <div className="notam-country-group" key={country}>
                              <div className="notam-country-header">{countryFlag} {countryName}</div>
                              {renderChips(hub, '거점공항')}
                              {renderChips(general, '일반공항')}
                              {renderChips(military, '군공항')}
                              {renderChips(fir, 'FIR/ACC')}
                              {renderChips(other, '기타')}
                            </div>
                          );
                        }

                        // 다른 국가는 단순 리스트
                        // 공항별 NOTAM 수 계산 (유효한 것만)
                        const notamCountsOther = {};
                        const cancelledSetOther = buildCancelledNotamSet(notamData?.data || []);
                        notamData?.data?.forEach(n => {
                          const nType = getNotamType(n.full_text);
                          if (nType === 'C') return;
                          const validity = getNotamValidity(n, cancelledSetOther);
                          if (!validity) return;
                          notamCountsOther[n.location] = (notamCountsOther[n.location] || 0) + 1;
                        });

                        return (
                          <div className="notam-country-group" key={country}>
                            <div className="notam-country-header">{countryFlag} {countryName}</div>
                            <div className="notam-map-location-chips">
                              {airportsInCountry.map(loc => {
                                const isActive = notamLocationsOnMap.has(loc);
                                const info = AIRPORT_DATABASE[loc];
                                const shortName = info?.name?.replace('공항', '').replace('국제', '') || loc;
                                const count = notamCountsOther[loc] || 0;
                                return (
                                  <button
                                    key={loc}
                                    className={`notam-map-chip ${isActive ? 'active' : ''} ${info?.type || 'other'}`}
                                    onClick={() => {
                                      const newSet = new Set(notamLocationsOnMap);
                                      isActive ? newSet.delete(loc) : newSet.add(loc);
                                      setNotamLocationsOnMap(newSet);
                                    }}
                                    title={`${loc} ${info?.name || ''} (${count}건) - 지도에 ${isActive ? '숨기기' : '표시'}`}
                                  >
                                    {loc} {shortName !== loc ? shortName : ''} ({count})
                                  </button>
                                );
                              })}
                              <button
                                className="notam-select-all-btn"
                                onClick={() => {
                                  const newSet = new Set(notamLocationsOnMap);
                                  const allSelected = airportsInCountry.every(loc => newSet.has(loc));
                                  airportsInCountry.forEach(loc => allSelected ? newSet.delete(loc) : newSet.add(loc));
                                  setNotamLocationsOnMap(newSet);
                                }}
                              >
                                {airportsInCountry.every(loc => notamLocationsOnMap.has(loc)) ? '전체해제' : '전체선택'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                {notamLocationsOnMap.size > 0 && (
                  <button
                    className="notam-map-clear-btn"
                    onClick={() => setNotamLocationsOnMap(new Set())}
                  >
                    필터 해제 ({notamLocationsOnMap.size}개 선택됨)
                  </button>
                )}
              </div>
              {/* NOTAM 지도 범례 */}
              <div className="notam-map-legend">
                <span className="notam-legend-item notam-legend-active">
                  <span className="notam-legend-dot" style={{ background: '#FF9800' }}></span>
                  활성 NOTAM
                </span>
                <span className="notam-legend-item notam-legend-future">
                  <span className="notam-legend-dot" style={{ background: '#2196F3' }}></span>
                  예정 NOTAM
                </span>
                <span className="notam-legend-info">
                  {notamLocationsOnMap.size === 0 ? '공항 선택 시 지도 표시' : `${notamLocationsOnMap.size}개 공항 표시 중`}
                </span>
              </div>
              <div className="notam-content">
                {notamLoading && <div className="notam-loading">로딩 중...</div>}
                {notamError && <div className="notam-error">오류: {notamError}</div>}
                {notamData && !notamLoading && (
                  <div className="notam-list">
                    {(() => {
                      // Build cancelled set for filtering
                      const cancelledSet = buildCancelledNotamSet(notamData.data);

                      const filtered = notamData.data?.filter(n => {
                        // 지도 표시 필터 (공항 선택된 경우에만 해당 공항 표시)
                        const matchMapFilter = notamLocationsOnMap.size === 0 || notamLocationsOnMap.has(n.location);
                        // 검색어 필터
                        const matchSearch = !notamFilter ||
                          n.notam_number?.toLowerCase().includes(notamFilter.toLowerCase()) ||
                          n.location?.toLowerCase().includes(notamFilter.toLowerCase()) ||
                          n.e_text?.toLowerCase().includes(notamFilter.toLowerCase()) ||
                          n.qcode_mean?.toLowerCase().includes(notamFilter.toLowerCase());
                        // Filter by validity (time, type, cancellation)
                        const isValid = isNotamActive(n, cancelledSet);
                        return matchMapFilter && matchSearch && isValid;
                      }) || [];
                      if (filtered.length === 0) {
                        return <div className="notam-empty">해당 조건의 유효한 NOTAM이 없습니다.</div>;
                      }
                      return filtered.map((n, idx) => {
                        const notamType = getNotamType(n.full_text);
                        const typeLabel = notamType === 'R' ? 'REPLACE' : notamType === 'C' ? 'CANCEL' : 'NEW';
                        const cancelledRef = getCancelledNotamRef(n.full_text);
                        const validity = getNotamValidity(n, cancelledSet);
                        const validityLabel = validity === 'future' ? '예정' : '활성';

                        return (
                          <div key={n.id || idx} className={`notam-item notam-type-${notamType} notam-validity-${validity}`}>
                            <div
                              className="notam-item-header"
                              onClick={() => setNotamExpanded(p => ({ ...p, [n.id || idx]: !p[n.id || idx] }))}
                            >
                              <span className="notam-location">{n.location}</span>
                              <span className="notam-number">{n.notam_number}</span>
                              <span className={`notam-validity-badge notam-validity-${validity}`}>{validityLabel}</span>
                              <span className={`notam-type-badge notam-type-${notamType}`}>{typeLabel}</span>
                              <span className={`notam-expand-icon ${notamExpanded[n.id || idx] ? 'expanded' : ''}`}>▼</span>
                            </div>
                            {notamExpanded[n.id || idx] && (
                              <div className="notam-item-detail">
                                {notamType === 'R' && cancelledRef && (
                                  <div className="notam-detail-row notam-replaced-ref">
                                    <span className="notam-label">대체 대상:</span>
                                    <span>{cancelledRef}</span>
                                  </div>
                                )}
                                <div className="notam-detail-row">
                                  <span className="notam-label">Q-Code:</span>
                                  <span>{n.qcode} - {n.qcode_mean}</span>
                                </div>
                                <div className="notam-detail-row">
                                  <span className="notam-label">유효기간:</span>
                                  <span>{n.effective_start || '-'} ~ {n.effective_end || 'PERM'}</span>
                                </div>
                                <div className="notam-detail-row">
                                  <span className="notam-label">내용:</span>
                                </div>
                                <div className="notam-e-text">{n.e_text}</div>
                                {n.full_text && (
                                  <>
                                    <div className="notam-detail-row">
                                      <span className="notam-label">전문:</span>
                                    </div>
                                    <div className="notam-full-text">{n.full_text}</div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
              <div className="notam-footer">
                {notamData && <span className="notam-count">
                  {notamLocationsOnMap.size > 0
                    ? `선택 공항 NOTAM ${notamData.data?.filter(n => notamLocationsOnMap.has(n.location)).length || 0}건`
                    : `전체 ${notamData.returned?.toLocaleString() || notamData.data?.length || 0}건`
                  }
                </span>}
                <span className="notam-update-time">
                  {notamLocationsOnMap.size > 0 ? [...notamLocationsOnMap].join(', ') : '지도 영역 기준'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Menu Toggle Button */}
      <button
        className="mobile-menu-toggle"
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        aria-label={isPanelOpen ? '메뉴 닫기' : '메뉴 열기'}
      >
        {isPanelOpen ? '✕' : '☰'}
      </button>
      <div className={`control-panel ${isPanelOpen ? 'open' : 'closed'}`}>
        <div className="panel-header">
          <span className="panel-title">RKPU 울산공항</span>
          <button className="panel-close-btn" onClick={() => setIsPanelOpen(false)} aria-label="패널 닫기">✕</button>
        </div>

        <div className="panel-content">
          {/* Altitude Legend */}
          <div className="section">
            <div className="section-title">고도 범례</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <span style={{ fontSize: '11px', color: '#9aa0a6' }}>0ft</span>
              <div style={{ flex: 1, height: '12px', borderRadius: '6px', background: 'linear-gradient(to right, rgb(0,255,50), rgb(255,255,50), rgb(255,0,50))' }} />
              <span style={{ fontSize: '11px', color: '#9aa0a6' }}>8000ft</span>
            </div>
          </div>

          {/* Basic Layers - Accordion */}
          <div className="section accordion">
            <div className="accordion-header" onClick={() => setLayersExpanded(!layersExpanded)}>
              <span>기본 레이어</span>
              <span className={`accordion-icon ${layersExpanded ? 'expanded' : ''}`}>▼</span>
            </div>
            <div className={`toggle-group accordion-content ${!layersExpanded ? 'collapsed' : ''}`}>
              <div className={`toggle-item ${showWaypoints && !hasActiveProcedure ? 'active' : ''} ${hasActiveProcedure ? 'disabled' : ''}`} onClick={() => !hasActiveProcedure && setShowWaypoints(!showWaypoints)}>
                <input type="checkbox" className="toggle-checkbox" checked={showWaypoints && !hasActiveProcedure} readOnly disabled={hasActiveProcedure} />
                <span className="toggle-label">웨이포인트 {hasActiveProcedure && <span className="hint">(절차별)</span>}</span>
              </div>
              <div className={`toggle-item ${showObstacles ? 'active' : ''}`} onClick={() => setShowObstacles(!showObstacles)}><input type="checkbox" className="toggle-checkbox" checked={showObstacles} readOnly /><span className="toggle-label">장애물</span></div>
              <div className={`toggle-item ${showAirspace ? 'active' : ''}`} onClick={() => setShowAirspace(!showAirspace)}><input type="checkbox" className="toggle-checkbox" checked={showAirspace} readOnly /><span className="toggle-label">공역</span></div>
              {is3DView && <div className={`toggle-item ${show3DAltitude ? 'active' : ''}`} onClick={() => setShow3DAltitude(!show3DAltitude)}><input type="checkbox" className="toggle-checkbox" checked={show3DAltitude} readOnly /><span className="toggle-label">3D 고도 표시</span></div>}
              {is3DView && <div className={`toggle-item ${showTerrain ? 'active' : ''}`} onClick={() => setShowTerrain(!showTerrain)}><input type="checkbox" className="toggle-checkbox" checked={showTerrain} readOnly /><span className="toggle-label">지형</span></div>}
              {is3DView && <div className={`toggle-item ${showBuildings ? 'active' : ''}`} onClick={() => setShowBuildings(!showBuildings)}><input type="checkbox" className="toggle-checkbox" checked={showBuildings} readOnly /><span className="toggle-label">3D 건물</span></div>}
              <div className={`toggle-item ${showRadar ? 'active' : ''}`} onClick={() => setShowRadar(!showRadar)}><input type="checkbox" className="toggle-checkbox" checked={showRadar} readOnly /><span className="toggle-label">기상 레이더</span></div>
            </div>
          </div>

          {/* Korea Routes/Waypoints/Airspaces - Accordion */}
          {koreaAirspaceData && (
            <div className="section accordion">
              <div className="accordion-header" onClick={() => setKoreaRoutesExpanded(!koreaRoutesExpanded)}>
                <span>국내 항로/공역</span>
                <span className="badge">{(koreaAirspaceData.routes?.length || 0) + (koreaAirspaceData.airspaces?.length || 0)}개</span>
                <span className={`accordion-icon ${koreaRoutesExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              <div className={`toggle-group accordion-content ${!koreaRoutesExpanded ? 'collapsed' : ''}`}>
                <div className={`toggle-item ${showKoreaRoutes ? 'active' : ''}`} onClick={() => setShowKoreaRoutes(!showKoreaRoutes)}>
                  <input type="checkbox" className="toggle-checkbox" checked={showKoreaRoutes} readOnly />
                  <span className="toggle-label">항로 (ATS/RNAV)</span>
                  <span className="toggle-count">{koreaAirspaceData.routes?.length || 0}</span>
                </div>
                <div className={`toggle-item ${showKoreaWaypoints ? 'active' : ''}`} onClick={() => setShowKoreaWaypoints(!showKoreaWaypoints)}>
                  <input type="checkbox" className="toggle-checkbox" checked={showKoreaWaypoints} readOnly />
                  <span className="toggle-label">웨이포인트</span>
                  <span className="toggle-count">{koreaAirspaceData.waypoints?.length || 0}</span>
                </div>
                <div className={`toggle-item ${showKoreaNavaids ? 'active' : ''}`} onClick={() => setShowKoreaNavaids(!showKoreaNavaids)}>
                  <input type="checkbox" className="toggle-checkbox" checked={showKoreaNavaids} readOnly />
                  <span className="toggle-label">NAVAID (VOR/DME)</span>
                  <span className="toggle-count">{koreaAirspaceData.navaids?.length || 0}</span>
                </div>
                <div className={`toggle-item ${showKoreaAirspaces ? 'active' : ''}`} onClick={() => setShowKoreaAirspaces(!showKoreaAirspaces)}>
                  <input type="checkbox" className="toggle-checkbox" checked={showKoreaAirspaces} readOnly />
                  <span className="toggle-label">공역 (P/R/D/MOA)</span>
                  <span className="toggle-count">{koreaAirspaceData.airspaces?.length || 0}</span>
                </div>
                <div className="korea-airspace-info">
                  <small>출처: eAIP Korea (AIRAC {koreaAirspaceData.metadata?.airac})</small>
                </div>
              </div>
            </div>
          )}

          {/* Aircraft - Accordion */}
          <div className="section accordion">
            <div className="accordion-header" onClick={() => setAircraftExpanded(!aircraftExpanded)}>
              <span>실시간 항공기</span>
              <span className={`accordion-icon ${aircraftExpanded ? 'expanded' : ''}`}>▼</span>
            </div>
            <div className={`toggle-group accordion-content ${!aircraftExpanded ? 'collapsed' : ''}`}>
              <div className={`toggle-item ${showAircraft ? 'active' : ''}`} onClick={() => setShowAircraft(!showAircraft)}><input type="checkbox" className="toggle-checkbox" checked={showAircraft} readOnly /><span className="toggle-label">항공기 표시</span></div>
              <div className={`toggle-item ${showAircraftTrails ? 'active' : ''}`} onClick={() => setShowAircraftTrails(!showAircraftTrails)}><input type="checkbox" className="toggle-checkbox" checked={showAircraftTrails} readOnly /><span className="toggle-label">항적 표시</span></div>
              {showAircraftTrails && (
                <>
                  <div className="trail-duration-select">
                    <span className="trail-duration-label">히스토리 길이:</span>
                    <select
                      value={trailDuration}
                      onChange={(e) => setTrailDuration(Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {TRAIL_DURATION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="trail-duration-select">
                    <span className="trail-duration-label">헤딩 예측:</span>
                    <select
                      value={headingPrediction}
                      onChange={(e) => setHeadingPrediction(Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value={0}>없음</option>
                      <option value={30}>30초</option>
                      <option value={60}>1분</option>
                      <option value={120}>2분</option>
                      <option value={180}>3분</option>
                      <option value={300}>5분</option>
                    </select>
                  </div>
                  <div className="trail-duration-select" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span className="trail-duration-label" style={{ marginBottom: '4px' }}>라벨 위치 (드래그):</span>
                    <div
                      className="label-position-pad"
                      style={{
                        width: '60px', height: '60px', background: 'rgba(0,0,0,0.5)',
                        border: '1px solid rgba(0,255,136,0.5)', borderRadius: '4px',
                        position: 'relative', cursor: 'crosshair'
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setIsDraggingLabel(true);
                      }}
                      onMouseMove={(e) => {
                        if (!isDraggingLabel) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 4; // -2 ~ 2 범위
                        const y = ((e.clientY - rect.top) / rect.height - 0.5) * 4;
                        setLabelOffset({ x: Math.max(-2, Math.min(2, x)), y: Math.max(-2, Math.min(2, y)) });
                      }}
                      onMouseUp={() => setIsDraggingLabel(false)}
                      onMouseLeave={() => setIsDraggingLabel(false)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* 중심 + 표시 */}
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'rgba(0,255,136,0.3)', fontSize: '20px' }}>✈</div>
                      {/* 현재 라벨 위치 표시 */}
                      <div style={{
                        position: 'absolute',
                        left: `${50 + labelOffset.x * 12.5}%`,
                        top: `${50 + labelOffset.y * 12.5}%`,
                        transform: 'translate(-50%, -50%)',
                        width: '8px', height: '8px',
                        background: '#00ff88', borderRadius: '50%',
                        boxShadow: '0 0 4px #00ff88'
                      }}></div>
                    </div>
                    <span style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>
                      X:{labelOffset.x.toFixed(1)} Y:{labelOffset.y.toFixed(1)}
                    </span>
                  </div>
                </>
              )}
              {is3DView && <div className={`toggle-item ${show3DAircraft ? 'active' : ''}`} onClick={() => setShow3DAircraft(!show3DAircraft)}><input type="checkbox" className="toggle-checkbox" checked={show3DAircraft} readOnly /><span className="toggle-label">3D 항공기 (GLB)</span></div>}
            </div>
          </div>

          {/* SID - Accordion with Runway Groups */}
          {data?.procedures?.SID && Object.keys(data.procedures.SID).length > 0 && (
            <div className="section accordion">
              <div className="accordion-header" onClick={() => setSidExpanded(!sidExpanded)}>
                <span>SID 출발절차</span>
                <span className={`accordion-icon ${sidExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              <div className={`toggle-group accordion-content ${!sidExpanded ? 'collapsed' : ''}`}>
                <div className="runway-group">
                  <div className="runway-label">RWY 18 (2-6, 2-7)</div>
                  {Object.entries(data.procedures.SID).filter(([k]) => k.startsWith('2-6') || k.startsWith('2-7')).map(([k, p]) => (
                    <div key={k} className={`toggle-item ${sidVisible[k] ? 'active' : ''}`} onClick={() => setSidVisible(prev => ({ ...prev, [k]: !prev[k] }))}>
                      <input type="checkbox" className="toggle-checkbox" checked={sidVisible[k] || false} readOnly />
                      <span className="toggle-label">{p.display_name}</span>
                      <span className="toggle-color" style={{ background: procColors.SID[k] }}></span>
                    </div>
                  ))}
                </div>
                <div className="runway-group">
                  <div className="runway-label">RWY 36 (2-8, 2-9)</div>
                  {Object.entries(data.procedures.SID).filter(([k]) => k.startsWith('2-8') || k.startsWith('2-9')).map(([k, p]) => (
                    <div key={k} className={`toggle-item ${sidVisible[k] ? 'active' : ''}`} onClick={() => setSidVisible(prev => ({ ...prev, [k]: !prev[k] }))}>
                      <input type="checkbox" className="toggle-checkbox" checked={sidVisible[k] || false} readOnly />
                      <span className="toggle-label">{p.display_name}</span>
                      <span className="toggle-color" style={{ background: procColors.SID[k] }}></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STAR - Accordion with Runway Groups */}
          {data?.procedures?.STAR && Object.keys(data.procedures.STAR).length > 0 && (
            <div className="section accordion">
              <div className="accordion-header" onClick={() => setStarExpanded(!starExpanded)}>
                <span>STAR 도착절차</span>
                <span className={`accordion-icon ${starExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              <div className={`toggle-group accordion-content ${!starExpanded ? 'collapsed' : ''}`}>
                <div className="runway-group">
                  <div className="runway-label">RWY 18 (2-10)</div>
                  {Object.entries(data.procedures.STAR).filter(([k]) => k.startsWith('2-10')).map(([k, p]) => (
                    <div key={k} className={`toggle-item ${starVisible[k] ? 'active' : ''}`} onClick={() => setStarVisible(prev => ({ ...prev, [k]: !prev[k] }))}>
                      <input type="checkbox" className="toggle-checkbox" checked={starVisible[k] || false} readOnly />
                      <span className="toggle-label">{p.display_name}</span>
                      <span className="toggle-color" style={{ background: procColors.STAR[k] }}></span>
                    </div>
                  ))}
                </div>
                <div className="runway-group">
                  <div className="runway-label">RWY 36 (2-11)</div>
                  {Object.entries(data.procedures.STAR).filter(([k]) => k.startsWith('2-11')).map(([k, p]) => (
                    <div key={k} className={`toggle-item ${starVisible[k] ? 'active' : ''}`} onClick={() => setStarVisible(prev => ({ ...prev, [k]: !prev[k] }))}>
                      <input type="checkbox" className="toggle-checkbox" checked={starVisible[k] || false} readOnly />
                      <span className="toggle-label">{p.display_name}</span>
                      <span className="toggle-color" style={{ background: procColors.STAR[k] }}></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* APPROACH - Accordion with Runway Groups */}
          {data?.procedures?.APPROACH && Object.keys(data.procedures.APPROACH).length > 0 && (
            <div className="section accordion">
              <div className="accordion-header" onClick={() => setApchExpanded(!apchExpanded)}>
                <span>APCH 접근절차</span>
                <span className={`accordion-icon ${apchExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              <div className={`toggle-group accordion-content ${!apchExpanded ? 'collapsed' : ''}`}>
                <div className="runway-group">
                  <div className="runway-label">RWY 18</div>
                  {Object.entries(data.procedures.APPROACH).filter(([k]) => k.includes('RWY 18')).map(([k, p]) => (
                    <div key={k} className={`toggle-item ${apchVisible[k] ? 'active' : ''}`} onClick={() => setApchVisible(prev => ({ ...prev, [k]: !prev[k] }))}>
                      <input type="checkbox" className="toggle-checkbox" checked={apchVisible[k] || false} readOnly />
                      <span className="toggle-label">{p.display_name}</span>
                      <span className="toggle-color" style={{ background: procColors.APPROACH[k] }}></span>
                    </div>
                  ))}
                </div>
                <div className="runway-group">
                  <div className="runway-label">RWY 36</div>
                  {Object.entries(data.procedures.APPROACH).filter(([k]) => k.includes('RWY 36')).map(([k, p]) => (
                    <div key={k} className={`toggle-item ${apchVisible[k] ? 'active' : ''}`} onClick={() => setApchVisible(prev => ({ ...prev, [k]: !prev[k] }))}>
                      <input type="checkbox" className="toggle-checkbox" checked={apchVisible[k] || false} readOnly />
                      <span className="toggle-label">{p.display_name}</span>
                      <span className="toggle-color" style={{ background: procColors.APPROACH[k] }}></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Chart Overlays - Accordion */}
          <div className="section accordion">
            <div className="accordion-header" onClick={() => setChartExpanded(!chartExpanded)}>
              <span>차트 오버레이</span>
              <span className={`accordion-icon ${chartExpanded ? 'expanded' : ''}`}>▼</span>
            </div>
            <div className={`toggle-group accordion-content ${!chartExpanded ? 'collapsed' : ''}`}>
              <div className="runway-group">
                <div className="runway-label">RWY 18</div>
                {chartsByRunway['18'].map(([chartId, chart]) => (
                  <div key={chartId} className="chart-control-item">
                    <div className={`toggle-item ${activeCharts[chartId] ? 'active' : ''}`} onClick={() => toggleChart(chartId)}>
                      <input type="checkbox" className="toggle-checkbox" checked={activeCharts[chartId] || false} readOnly />
                      <span className="toggle-label">{chart.name}</span>
                    </div>
                    {activeCharts[chartId] && (
                      <div className="opacity-control">
                        <input type="range" min="0" max="1" step="0.1" value={chartOpacities[chartId] || 0.7} onChange={(e) => updateChartOpacity(chartId, parseFloat(e.target.value))} onClick={(e) => e.stopPropagation()} />
                        <span className="opacity-value">{Math.round((chartOpacities[chartId] || 0.7) * 100)}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="runway-group">
                <div className="runway-label">RWY 36</div>
                {chartsByRunway['36'].map(([chartId, chart]) => (
                  <div key={chartId} className="chart-control-item">
                    <div className={`toggle-item ${activeCharts[chartId] ? 'active' : ''}`} onClick={() => toggleChart(chartId)}>
                      <input type="checkbox" className="toggle-checkbox" checked={activeCharts[chartId] || false} readOnly />
                      <span className="toggle-label">{chart.name}</span>
                    </div>
                    {activeCharts[chartId] && (
                      <div className="opacity-control">
                        <input type="range" min="0" max="1" step="0.1" value={chartOpacities[chartId] || 0.7} onChange={(e) => updateChartOpacity(chartId, parseFloat(e.target.value))} onClick={(e) => e.stopPropagation()} />
                        <span className="opacity-value">{Math.round((chartOpacities[chartId] || 0.7) * 100)}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="section">
            <button className="fly-btn" onClick={flyToAirport}>공항으로 이동</button>
          </div>
        </div>
      </div>

      {/* Aircraft Detail Panel (FR24 Style) */}
      {(() => {
        // Get real-time aircraft data from aircraft array
        const displayAircraft = selectedAircraft ? aircraft.find(a => a.hex === selectedAircraft.hex) || selectedAircraft : null;
        return (
      <div className={`aircraft-panel ${showAircraftPanel && displayAircraft ? 'open' : ''}`}>
        {showAircraftPanel && displayAircraft && (
          <div className="aircraft-panel-content">
            {/* Header with callsign */}
            <div className="aircraft-panel-header">
              <div className="aircraft-header-main">
                <span className="aircraft-callsign">{displayAircraft.callsign || displayAircraft.hex}</span>
                <span className="aircraft-reg">{displayAircraft.registration || 'N/A'}</span>
              </div>
              <button className="aircraft-close-btn" onClick={() => { setShowAircraftPanel(false); setSelectedAircraft(null); }}>×</button>
            </div>

            {/* Aircraft Photo - airport-data.com 또는 기종별 기본 이미지 */}
            <div className="aircraft-photo-section">
              {aircraftPhotoLoading && (
                <div className="aircraft-photo-loading">
                  <div className="loading-spinner"></div>
                </div>
              )}
              {!aircraftPhotoLoading && (aircraftPhoto?.image || flightSchedule?.aircraft_images?.[0]?.src) && (
                <img
                  src={aircraftPhoto?.image || flightSchedule?.aircraft_images?.[0]?.src}
                  alt={displayAircraft.registration || displayAircraft.callsign}
                  className="aircraft-photo"
                  onError={(e) => {
                    // 사진 로드 실패 시 기종별 이미지로 대체
                    e.target.src = getAircraftImage(displayAircraft.icao_type || displayAircraft.type);
                    e.target.onerror = null;
                  }}
                />
              )}
              {!aircraftPhotoLoading && !aircraftPhoto?.image && !flightSchedule?.aircraft_images?.[0]?.src && (
                <img
                  src={getAircraftImage(displayAircraft.icao_type || displayAircraft.type)}
                  alt={displayAircraft.type || 'Aircraft'}
                  className="aircraft-photo aircraft-photo-default"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              {(aircraftPhoto?.photographer || (flightSchedule?.aircraft_images?.[0]?.src && flightSchedule?._source === 'flightradar24')) && (
                <div className="aircraft-photo-credit">
                  📷 {aircraftPhoto?.photographer || 'FlightRadar24'}
                </div>
              )}
              {!aircraftPhoto?.image && !flightSchedule?.aircraft_images?.[0]?.src && (displayAircraft.icao_type || displayAircraft.type) && (
                <div className="aircraft-photo-credit type-info">
                  {displayAircraft.icao_type || displayAircraft.type}
                </div>
              )}
            </div>

            {/* Route Info - aviationstack 또는 기본 데이터 */}
            <div className="aircraft-route-section">
              <div className="route-display">
                <div className="route-airport origin">
                  <span className="route-code">
                    {flightSchedule?.departure?.iata || displayAircraft.origin || '???'}
                  </span>
                  <span className="route-name">
                    {flightSchedule?.departure?.airport || AIRPORT_DATABASE[displayAircraft.origin]?.name || ''}
                  </span>
                  {(flightSchedule?.schedule?.std || flightSchedule?.schedule?.etd || flightSchedule?.departure?.scheduled) && (
                    <span className="route-time">
                      {flightSchedule?.schedule?.std || flightSchedule?.schedule?.etd ||
                       (flightSchedule?.departure?.scheduled ? new Date(flightSchedule.departure.scheduled).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : '')}
                    </span>
                  )}
                </div>
                <div className="route-arrow">
                  <div className="route-line"></div>
                  <span className="route-icon">✈</span>
                  <div className="route-line"></div>
                </div>
                <div className="route-airport destination">
                  <span className="route-code">
                    {flightSchedule?.arrival?.iata || displayAircraft.destination || '???'}
                  </span>
                  <span className="route-name">
                    {flightSchedule?.arrival?.airport || AIRPORT_DATABASE[displayAircraft.destination]?.name || ''}
                  </span>
                  {(flightSchedule?.schedule?.sta || flightSchedule?.schedule?.eta || flightSchedule?.arrival?.scheduled) && (
                    <span className="route-time">
                      {flightSchedule?.schedule?.sta || flightSchedule?.schedule?.eta ||
                       (flightSchedule?.arrival?.scheduled ? new Date(flightSchedule.arrival.scheduled).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : '')}
                    </span>
                  )}
                </div>
              </div>
              {flightScheduleLoading && (
                <div className="route-loading">스케줄 조회중...</div>
              )}
            </div>

            {/* Takeoff/Landing Time Display */}
            {(flightSchedule?.schedule?.atd || flightSchedule?.schedule?.std || flightSchedule?.departure?.actual) && (
              <div className="takeoff-landing-section">
                <div className="takeoff-landing-grid">
                  <div className={`tl-item takeoff ${flightSchedule?.schedule?.atd || flightSchedule?.departure?.actual ? '' : 'estimated'}`}>
                    <span className="tl-label">이륙</span>
                    <span className="tl-time">
                      {flightSchedule?.schedule?.atd ||
                       (flightSchedule?.departure?.actual ? new Date(flightSchedule.departure.actual).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null) ||
                       flightSchedule?.schedule?.etd ||
                       flightSchedule?.schedule?.std ||
                       (flightSchedule?.departure?.scheduled ? new Date(flightSchedule.departure.scheduled).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : '--:--')}
                    </span>
                  </div>
                  <div className={`tl-item landing ${flightSchedule?.arrival?.actual ? '' : 'estimated'}`}>
                    <span className="tl-label">착륙</span>
                    <span className="tl-time">
                      {(flightSchedule?.arrival?.actual ? new Date(flightSchedule.arrival.actual).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null) ||
                       flightSchedule?.schedule?.eta ||
                       flightSchedule?.schedule?.sta ||
                       (flightSchedule?.arrival?.scheduled ? new Date(flightSchedule.arrival.scheduled).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : '--:--')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Flight Data Grid - 핵심 데이터만 */}
            <div className="aircraft-data-section">
              <div className="data-row">
                <div className="data-item">
                  <span className="data-label">고도</span>
                  <span className="data-value">{(displayAircraft.altitude_ft || 0).toLocaleString()} ft</span>
                </div>
                <div className="data-item">
                  <span className="data-label">속도</span>
                  <span className="data-value">{displayAircraft.ground_speed || 0} kt</span>
                </div>
                <div className="data-item">
                  <span className="data-label">방향</span>
                  <span className="data-value">{Math.round(displayAircraft.track || 0)}°</span>
                </div>
              </div>
              <div className="data-row">
                <div className="data-item">
                  <span className="data-label">수직속도</span>
                  <span className={`data-value ${displayAircraft.vertical_rate > 100 ? 'climbing' : displayAircraft.vertical_rate < -100 ? 'descending' : ''}`}>
                    {displayAircraft.vertical_rate > 0 ? '+' : ''}{displayAircraft.vertical_rate || 0} fpm
                  </span>
                </div>
                <div className="data-item">
                  <span className="data-label">Squawk</span>
                  <span className={`data-value squawk ${['7700', '7600', '7500'].includes(displayAircraft.squawk) ? 'emergency' : ''}`}>
                    {displayAircraft.squawk || '----'}
                  </span>
                </div>
              </div>
            </div>

            {/* Flight Status Section - 비행 단계, 공역, 항로 정보 */}
            <div className="flight-status-section collapsible-section">
              <div className="collapsible-header" onClick={() => toggleSection('flightStatus')}>
                <div className="section-title">
                  비행 상태
                </div>
                <span className={`collapsible-icon ${sectionExpanded.flightStatus ? 'expanded' : ''}`}>▼</span>
              </div>
              <div className={`collapsible-content ${!sectionExpanded.flightStatus ? 'collapsed' : ''}`}>
                {(() => {
                  const flightPhase = detectFlightPhase(displayAircraft, data?.airport);
                  const currentAirspaces = detectCurrentAirspace(displayAircraft, atcData);
                  const nearestWaypoints = findNearestWaypoints(displayAircraft, data?.waypoints, 3);
                  const currentProcedure = detectCurrentProcedure(displayAircraft, data?.procedures, flightPhase.phase);

                  return (
                    <>
                      {/* 비행 단계 */}
                      <div className="status-item flight-phase">
                        <span className="status-label">비행 단계</span>
                        <span className="status-value" style={{ color: flightPhase.color }}>
                          {flightPhase.icon} {flightPhase.phase_kr}
                        </span>
                      </div>

                      {/* 현재 공역 */}
                      {currentAirspaces.length > 0 && (
                        <div className="status-item airspace-info">
                          <span className="status-label">현재 공역</span>
                          <div className="status-value-list">
                            {currentAirspaces.slice(0, 3).map((as, idx) => (
                              <div key={idx} className="airspace-chip" style={{ borderColor: as.color || '#64b5f6' }}>
                                <span className="airspace-type">{as.type}</span>
                                <span className="airspace-name">{as.name}</span>
                                {as.frequencies && as.frequencies[0] && (
                                  <span className="airspace-freq">{as.frequencies[0]}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 현재 절차 (SID/STAR/APCH) */}
                      {currentProcedure && (
                        <div className="status-item procedure-info">
                          <span className="status-label">현재 절차</span>
                          <span className="status-value procedure">
                            <span className="procedure-type">{currentProcedure.type}</span>
                            {currentProcedure.name}
                          </span>
                        </div>
                      )}

                      {/* 다음 Waypoint */}
                      {nearestWaypoints.length > 0 && (
                        <div className="status-item waypoint-info">
                          <span className="status-label">다음 경유지</span>
                          <div className="waypoint-list">
                            {nearestWaypoints.map((wp, idx) => (
                              <div key={idx} className="waypoint-item">
                                <span className="waypoint-ident">{wp.ident}</span>
                                <span className="waypoint-dist">{wp.distance_nm.toFixed(1)} NM</span>
                                {wp.etaMinutes && (
                                  <span className="waypoint-eta">
                                    {wp.etaMinutes < 1 ? '<1분' : `${Math.round(wp.etaMinutes)}분`}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Aircraft Info - Combined with hexdb.io data */}
            <div className="aircraft-info-section collapsible-section">
              <div className="collapsible-header" onClick={() => toggleSection('aircraftInfo')}>
                <div className="section-title">
                  기체 정보
                  {aircraftDetailsLoading && <span className="loading-dot">...</span>}
                </div>
                <span className={`collapsible-icon ${sectionExpanded.aircraftInfo ? 'expanded' : ''}`}>▼</span>
              </div>
              <div className={`collapsible-content ${!sectionExpanded.aircraftInfo ? 'collapsed' : ''}`}>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">기종</span>
                  <span className="info-value">{aircraftDetails?.Type || displayAircraft.icao_type || displayAircraft.type || '-'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">등록번호</span>
                  <span className="info-value">{aircraftDetails?.Registration || displayAircraft.registration || '-'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Mode-S Hex</span>
                  <span className="info-value hex">{displayAircraft.hex?.toUpperCase() || '-'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">운항사</span>
                  <span className="info-value">{aircraftDetails?.RegisteredOwners || '-'}</span>
                </div>
                {aircraftDetails?.ICAOTypeCode && (
                  <div className="info-item">
                    <span className="info-label">ICAO 기종코드</span>
                    <span className="info-value">{aircraftDetails.ICAOTypeCode}</span>
                  </div>
                )}
                {aircraftDetails?.OperatorFlagCode && (
                  <div className="info-item">
                    <span className="info-label">운항사 코드</span>
                    <span className="info-value">{aircraftDetails.OperatorFlagCode}</span>
                  </div>
                )}
                {aircraftDetails?.Manufacturer && (
                  <div className="info-item full-width">
                    <span className="info-label">제조사</span>
                    <span className="info-value">{aircraftDetails.Manufacturer}</span>
                  </div>
                )}
              </div>
              </div>
            </div>

            {/* Flight Schedule from UBIKAIS/FR24 */}
            {(flightSchedule || flightScheduleLoading) && (
              <div className="aircraft-schedule-section collapsible-section">
                <div className="collapsible-header" onClick={() => toggleSection('schedule')}>
                  <div className="section-title">
                    스케줄 정보
                    {flightScheduleLoading && <span className="loading-dot">...</span>}
                    {flightSchedule?._source === 'ubikais' && <span className="data-source ubikais"> (UBIKAIS)</span>}
                    {flightSchedule?._source === 'flightradar24' && <span className="data-source fr24"> (FR24)</span>}
                  </div>
                  <span className={`collapsible-icon ${sectionExpanded.schedule ? 'expanded' : ''}`}>▼</span>
                </div>
                <div className={`collapsible-content ${!sectionExpanded.schedule ? 'collapsed' : ''}`}>
                {flightSchedule && (
                  <div className="schedule-grid">
                    <div className="schedule-item">
                      <span className="schedule-label">항공편</span>
                      <span className="schedule-value">{flightSchedule.flight?.iata || flightSchedule.flight?.icao || '-'}</span>
                    </div>
                    <div className="schedule-item">
                      <span className="schedule-label">상태</span>
                      <span className={`schedule-value status-${flightSchedule.flight_status}`}>
                        {flightSchedule.flight_status === 'DEP' ? '출발' :
                         flightSchedule.flight_status === 'ARR' ? '도착' :
                         flightSchedule.flight_status === 'DLA' ? '지연' :
                         flightSchedule.flight_status === 'CNL' ? '취소' :
                         flightSchedule.flight_status === 'active' ? '운항중' :
                         flightSchedule.flight_status === 'scheduled' ? '예정' :
                         flightSchedule.flight_status === 'landed' ? '착륙' :
                         flightSchedule.flight_status === 'cancelled' ? '취소' :
                         flightSchedule.flight_status || '-'}
                      </span>
                    </div>
                    {/* UBIKAIS 운항 유형 표시 */}
                    {flightSchedule.schedule?.nature && (
                      <div className="schedule-item">
                        <span className="schedule-label">유형</span>
                        <span className={`schedule-value nature-${flightSchedule.schedule.nature}`}>
                          {flightSchedule.schedule.nature === 'PAX' ? '✈️ 여객' :
                           flightSchedule.schedule.nature === 'CGO' ? '📦 화물' :
                           flightSchedule.schedule.nature === 'STP' ? '🛑 기술착륙' :
                           flightSchedule.schedule.nature === 'GEN' ? '🛩️ 일반' :
                           flightSchedule.schedule.nature}
                        </span>
                      </div>
                    )}
                    {/* UBIKAIS 기종 정보 */}
                    {flightSchedule.aircraft_info?.type && (
                      <div className="schedule-item">
                        <span className="schedule-label">기종</span>
                        <span className="schedule-value">{flightSchedule.aircraft_info.type}</span>
                      </div>
                    )}
                    <div className="schedule-item">
                      <span className="schedule-label">출발</span>
                      <span className="schedule-value">
                        {flightSchedule.departure?.iata || flightSchedule.departure?.icao || '-'}
                        {flightSchedule.departure?.scheduled && (
                          <span className="schedule-time">
                            {new Date(flightSchedule.departure.scheduled).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'})}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="schedule-item">
                      <span className="schedule-label">도착</span>
                      <span className="schedule-value">
                        {flightSchedule.arrival?.iata || flightSchedule.arrival?.icao || '-'}
                        {flightSchedule.arrival?.scheduled && (
                          <span className="schedule-time">
                            {new Date(flightSchedule.arrival.scheduled).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'})}
                          </span>
                        )}
                      </span>
                    </div>
                    {/* UBIKAIS 시간 정보 */}
                    {flightSchedule.schedule && (
                      <>
                        <div className="schedule-item">
                          <span className="schedule-label">계획 출발</span>
                          <span className="schedule-value">{flightSchedule.schedule.std || '-'}</span>
                        </div>
                        <div className="schedule-item">
                          <span className="schedule-label">예상 출발</span>
                          <span className="schedule-value">{flightSchedule.schedule.etd || '-'}</span>
                        </div>
                        {flightSchedule.schedule.atd && (
                          <div className="schedule-item">
                            <span className="schedule-label">실제 출발</span>
                            <span className="schedule-value highlight">{flightSchedule.schedule.atd}</span>
                          </div>
                        )}
                        <div className="schedule-item">
                          <span className="schedule-label">계획 도착</span>
                          <span className="schedule-value">{flightSchedule.schedule.sta || '-'}</span>
                        </div>
                        <div className="schedule-item">
                          <span className="schedule-label">예상 도착</span>
                          <span className="schedule-value">{flightSchedule.schedule.eta || '-'}</span>
                        </div>
                      </>
                    )}
                    {flightSchedule.departure?.delay && (
                      <div className="schedule-item full-width">
                        <span className="schedule-label">지연</span>
                        <span className="schedule-value delay">{flightSchedule.departure.delay}분</span>
                      </div>
                    )}
                    {flightSchedule.departure?.gate && (
                      <div className="schedule-item">
                        <span className="schedule-label">출발 게이트</span>
                        <span className="schedule-value">{flightSchedule.departure.gate}</span>
                      </div>
                    )}
                    {flightSchedule.arrival?.gate && (
                      <div className="schedule-item">
                        <span className="schedule-label">도착 게이트</span>
                        <span className="schedule-value">{flightSchedule.arrival.gate}</span>
                      </div>
                    )}
                    {/* UBIKAIS 데이터 시간 표시 */}
                    {flightSchedule._lastUpdated && (
                      <div className="schedule-item full-width">
                        <span className="schedule-label">데이터 시각</span>
                        <span className="schedule-value small">{flightSchedule._lastUpdated}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
                </div>
            )}

            {/* Flight Track Graph - OpenSky history or local trail */}
            {(flightTrack?.path?.length > 3 || (aircraftTrails[displayAircraft.hex]?.length > 3)) && (
              <div className="aircraft-graph-section">
                <div className="section-title">
                  비행 고도 그래프
                  {flightTrackLoading && <span className="loading-dot">...</span>}
                  {flightTrack && <span className="graph-source"> (OpenSky)</span>}
                </div>
                <div className="graph-container" style={{ position: "relative" }}>
                  <svg
                    viewBox="0 0 320 120"
                    className="flight-graph"
                    style={{ cursor: 'crosshair' }}
                    onMouseMove={(e) => {
                      const svg = e.currentTarget;
                      const rect = svg.getBoundingClientRect();
                      const x = ((e.clientX - rect.left) / rect.width) * 320;
                      const trackData = flightTrack?.path || aircraftTrails[displayAircraft.hex] || [];
                      const validAltData = trackData.filter(t => typeof t.altitude_ft === 'number' && !isNaN(t.altitude_ft) && t.altitude_ft >= 0);
                      if (validAltData.length < 2 || x < 30 || x > 310) { setGraphHoverData(null); return; }
                      const xScale = 280 / Math.max(validAltData.length - 1, 1);
                      const idx = Math.round((x - 30) / xScale);
                      const dp = validAltData[Math.max(0, Math.min(idx, validAltData.length - 1))];
                      if (dp) {
                        setGraphHoverData({
                          time: dp.time ? new Date(dp.time * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : dp.timestamp ? new Date(dp.timestamp).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null,
                          altitude: dp.altitude_ft, x: (x / 320) * 100
                        });
                      }
                    }}
                    onTouchMove={(e) => {
                      e.preventDefault();
                      const touch = e.touches[0];
                      const svg = e.currentTarget;
                      const rect = svg.getBoundingClientRect();
                      const x = ((touch.clientX - rect.left) / rect.width) * 320;
                      const trackData = flightTrack?.path || aircraftTrails[displayAircraft.hex] || [];
                      const validAltData = trackData.filter(t => typeof t.altitude_ft === 'number' && !isNaN(t.altitude_ft) && t.altitude_ft >= 0);
                      if (validAltData.length < 2 || x < 30 || x > 310) { setGraphHoverData(null); return; }
                      const xScale = 280 / Math.max(validAltData.length - 1, 1);
                      const idx = Math.round((x - 30) / xScale);
                      const dp = validAltData[Math.max(0, Math.min(idx, validAltData.length - 1))];
                      if (dp) {
                        setGraphHoverData({
                          time: dp.time ? new Date(dp.time * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : dp.timestamp ? new Date(dp.timestamp).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null,
                          altitude: dp.altitude_ft, x: (x / 320) * 100
                        });
                      }
                    }}
                    onTouchEnd={() => setGraphHoverData(null)}
                    onMouseLeave={() => setGraphHoverData(null)}
                  >
                    <defs>
                      <linearGradient id="altGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(100,181,246,0.3)" />
                        <stop offset="100%" stopColor="rgba(100,181,246,0)" />
                      </linearGradient>
                    </defs>
                    {[0, 25, 50, 75, 100].map(y => (
                      <line key={y} x1="30" y1={10 + y} x2="310" y2={10 + y} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    ))}
                    {(() => {
                      // OpenSky track 우선, 없으면 로컬 trail 사용
                      const trackData = flightTrack?.path || aircraftTrails[displayAircraft.hex] || [];
                      if (trackData.length < 2) return null;

                      // altitude_ft 값이 있는 데이터만 필터링
                      const validAltData = trackData.filter(t => typeof t.altitude_ft === 'number' && !isNaN(t.altitude_ft) && t.altitude_ft >= 0);
                      if (validAltData.length < 2) return null;

                      const altitudes = validAltData.map(t => t.altitude_ft);
                      const maxAlt = Math.max(...altitudes, 1000);
                      const minAlt = Math.min(...altitudes.filter(a => a > 0), 0);
                      const xScale = 280 / Math.max(validAltData.length - 1, 1);
                      const altRange = Math.max(maxAlt - minAlt, 1000);

                      // Altitude path - NaN 체크 추가
                      const altPath = validAltData.map((t, i) => {
                        const x = 30 + i * xScale;
                        const y = 105 - ((t.altitude_ft - minAlt) / altRange) * 90;
                        // NaN 체크
                        if (isNaN(x) || isNaN(y)) return '';
                        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                      }).filter(p => p).join(' ');

                      if (!altPath || altPath.length < 5) return null;
                      const altArea = altPath + ` L310,105 L30,105 Z`;

                      return (
                        <>
                          <path d={altArea} fill="url(#altGradient)" />
                          <path d={altPath} fill="none" stroke="#64b5f6" strokeWidth="2" />
                        </>
                      );
                    })()}
                    {/* Y-axis labels with min/max values */}
                    {(() => {
                      const trackData = flightTrack?.path || aircraftTrails[displayAircraft.hex] || [];
                      if (trackData.length < 2) return null;
                      const maxAlt = Math.max(...trackData.map(t => t.altitude_ft || 0), 1000);
                      return (
                        <>
                          <text x="5" y="15" fill="#64b5f6" fontSize="8">{(maxAlt / 1000).toFixed(0)}k</text>
                          <text x="5" y="108" fill="#64b5f6" fontSize="8">0</text>
                          {graphHoverData && <line x1={graphHoverData.x * 3.2} y1="10" x2={graphHoverData.x * 3.2} y2="105" stroke="#fff" strokeWidth="1" strokeDasharray="3,3" />}
                        </>
                      );
                    })()}
                  </svg>
                  {/* Hover Tooltip */}
                  {graphHoverData && (
                    <div className="graph-hover-tooltip" style={{ left: `${Math.min(Math.max(graphHoverData.x, 15), 85)}%`, transform: 'translateX(-50%)' }}>
                      <div className="tooltip-altitude">{graphHoverData.altitude?.toLocaleString()} ft</div>
                      {graphHoverData.time && <div className="tooltip-time">{graphHoverData.time}</div>}
                    </div>
                  )}
                  <div className="graph-info">
                    {(() => {
                      const trackData = flightTrack?.path || aircraftTrails[displayAircraft.hex] || [];
                      const validAltData = trackData.filter(t => typeof t.altitude_ft === 'number' && !isNaN(t.altitude_ft) && t.altitude_ft >= 0);
                      if (validAltData.length < 2) return null;
                      const fp = validAltData[0], lp = validAltData[validAltData.length - 1];
                      const startTime = fp.time ? new Date(fp.time * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : fp.timestamp ? new Date(fp.timestamp).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null;
                      const endTime = lp.time ? new Date(lp.time * 1000).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : lp.timestamp ? new Date(lp.timestamp).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : null;
                      const altChange = lp.altitude_ft - fp.altitude_ft;
                      return (
                        <div className="graph-summary">
                          <span className="flight-duration">{startTime || '--:--'} ~ {endTime || '현재'}</span>
                          <span className={`alt-change ${altChange > 500 ? 'climbing' : altChange < -500 ? 'descending' : ''}`}>
                            {fp.altitude_ft?.toLocaleString()}ft → {lp.altitude_ft?.toLocaleString()}ft ({altChange > 0 ? '+' : ''}{altChange?.toLocaleString()}ft)
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Position Info */}
            <div className="aircraft-position-section">
              <div className="section-title">위치 정보</div>
              <div className="position-data">
                <div className="position-item">
                  <span className="pos-label">LAT</span>
                  <span className="pos-value">{displayAircraft.lat?.toFixed(5) || '-'}</span>
                </div>
                <div className="position-item">
                  <span className="pos-label">LON</span>
                  <span className="pos-value">{displayAircraft.lon?.toFixed(5) || '-'}</span>
                </div>
              </div>
              <div className="data-source">
                <span>📡 ADS-B: airplanes.live | 기체DB: hexdb.io</span>
              </div>
            </div>
          </div>
        )}
      </div>
        );
      })()}

      {/* Right Weather Panel */}
      <div className={`wx-right-panel ${showWxPanel ? 'open' : ''}`}>
        {showWxPanel && (
          <div className="wx-panel-content">
            <div className="wx-panel-header">
              <h3>항공기상 정보</h3>
              <button className="wx-close-btn" onClick={() => setShowWxPanel(false)}>×</button>
            </div>

            <div className="wx-tabs">
              <button className={`wx-tab ${wxPanelTab === 'sigmet' ? 'active' : ''}`} onClick={() => setWxPanelTab('sigmet')}>
                SIGMET
                {sigmetData?.international?.length > 0 && <span className="wx-badge warn">{sigmetData.international.length}</span>}
              </button>
              <button className={`wx-tab ${wxPanelTab === 'notam' ? 'active' : ''}`} onClick={() => setWxPanelTab('notam')}>
                NOTAM
                {((notamData?.RKPU?.length || 0) + (notamData?.RKPK?.length || 0)) > 0 && <span className="wx-badge">{(notamData?.RKPU?.length || 0) + (notamData?.RKPK?.length || 0)}</span>}
              </button>
              <button className={`wx-tab ${wxPanelTab === 'lightning' ? 'active' : ''}`} onClick={() => setWxPanelTab('lightning')}>
                낙뢰
                {lightningData?.strikes?.length > 0 && <span className="wx-badge alert">{lightningData.strikes.length}</span>}
              </button>
            </div>

            <div className="wx-tab-content">
              {wxPanelTab === 'sigmet' && (
                <div className="wx-sigmet-list">
                  <div className="wx-section-title">
                    <span>한국 FIR SIGMET</span>
                    <span className="wx-count">{sigmetData?.kma?.length || 0}건</span>
                  </div>
                  {(!sigmetData?.kma || sigmetData.kma.length === 0) && (
                    <div className="wx-no-data">현재 발효중인 SIGMET 없음</div>
                  )}
                  {sigmetData?.kma?.map((sig, i) => (
                    <div key={i} className={`wx-sigmet-item hazard-${(sig.hazard || 'unknown').toLowerCase()}`}>
                      <div className="sigmet-header">
                        <span className="sigmet-type">{sig.hazard || 'SIGMET'}</span>
                        <span className="sigmet-id">{sig.seriesId}</span>
                      </div>
                      <div className="sigmet-raw">{sig.rawSigmet}</div>
                    </div>
                  ))}

                  <div className="wx-section-title" style={{ marginTop: '16px' }}>
                    <span>국제 SIGMET (전 세계)</span>
                    <span className="wx-count">{sigmetData?.international?.length || 0}건</span>
                  </div>
                  {sigmetData?.international?.slice(0, 15).map((sig, i) => (
                    <div key={i} className={`wx-sigmet-item hazard-${(sig.hazard || 'unknown').toLowerCase()}`}>
                      <div className="sigmet-header">
                        <span className="sigmet-type">{sig.hazard || 'SIGMET'}</span>
                        <span className="sigmet-fir">{sig.firName?.split(' ')[0]}</span>
                        <span className="sigmet-id">{sig.seriesId}</span>
                      </div>
                      <div className="sigmet-info">
                        {sig.base && sig.top && <span>FL{Math.round(sig.base/100)}-{Math.round(sig.top/100)}</span>}
                        {sig.dir && sig.spd && <span>MOV {sig.dir} {sig.spd}kt</span>}
                      </div>
                      <div className="sigmet-raw">{sig.rawSigmet?.slice(0, 200)}...</div>
                    </div>
                  ))}
                </div>
              )}

              {wxPanelTab === 'notam' && (
                <div className="wx-notam-list">
                  <div className="wx-section-title">
                    <span>RKPU NOTAM</span>
                    <span className="wx-count">{(notamData?.RKPU?.length || 0) + (notamData?.RKPK?.length || 0)}건</span>
                  </div>
                  {(!notamData || ((notamData.RKPU?.length || 0) + (notamData.RKPK?.length || 0) === 0)) && (
                    <div className="wx-no-data">{notamData?.note || '현재 발효중인 NOTAM 없음'}</div>
                  )}
                  {notamData?.RKPU?.slice(0, 15).map((notam, i) => (
                    <div key={`rkpu-${i}`} className="wx-notam-item">
                      <div className="notam-header">
                        <span className="notam-id">{notam.notam_id || `RKPU #${i + 1}`}</span>
                        <span className="notam-type">{notam.classification || 'NOTAM'}</span>
                      </div>
                      <div className="notam-text">{notam.traditional_message || notam.message || JSON.stringify(notam).slice(0, 300)}</div>
                    </div>
                  ))}
                  {notamData?.RKPK?.length > 0 && (
                    <>
                      <div className="wx-section-title" style={{marginTop: '12px'}}>
                        <span>RKPK 김해공항 NOTAM</span>
                        <span className="wx-count">{notamData.RKPK.length}건</span>
                      </div>
                      {notamData.RKPK.slice(0, 10).map((notam, i) => (
                        <div key={`rkpk-${i}`} className="wx-notam-item">
                          <div className="notam-header">
                            <span className="notam-id">{notam.notam_id || `RKPK #${i + 1}`}</span>
                            <span className="notam-type">{notam.classification || 'NOTAM'}</span>
                          </div>
                          <div className="notam-text">{notam.traditional_message || notam.message || JSON.stringify(notam).slice(0, 300)}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {wxPanelTab === 'lightning' && (
                <div className="wx-lightning-list">
                  <div className="wx-section-title">
                    <span>낙뢰 정보 (1시간)</span>
                    <span className="wx-count">{lightningData?.strikes?.length || 0}건</span>
                  </div>
                  {(!lightningData?.strikes || lightningData.strikes.length === 0) && (
                    <div className="wx-no-data">최근 1시간 내 낙뢰 발생 없음</div>
                  )}
                  <div className="lightning-summary">
                    {lightningData?.timeRange && (
                      <div className="lightning-time">
                        관측기간: {lightningData.timeRange.start?.slice(8, 12)} - {lightningData.timeRange.end?.slice(8, 12)}
                      </div>
                    )}
                  </div>
                  {lightningData?.strikes?.slice(0, 50).map((strike, i) => (
                    <div key={i} className="wx-lightning-item">
                      <span className="lightning-icon">⚡</span>
                      <span className="lightning-pos">{strike.lat?.toFixed(3)}°N {strike.lon?.toFixed(3)}°E</span>
                      {strike.amplitude && <span className="lightning-amp">{strike.amplitude}kA</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="wx-legend">
              <div className="legend-title">SIGMET 유형</div>
              <div className="legend-items">
                <span className="legend-item"><span className="legend-color turb"></span>TURB 난류</span>
                <span className="legend-item"><span className="legend-color ice"></span>ICE 착빙</span>
                <span className="legend-item"><span className="legend-color ts"></span>TS 뇌우</span>
                <span className="legend-item"><span className="legend-color va"></span>VA 화산재</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
