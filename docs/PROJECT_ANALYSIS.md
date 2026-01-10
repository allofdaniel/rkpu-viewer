# RKPU-Viewer 프로젝트 종합 분석 보고서

## DO-278A AL4 인증을 위한 소프트웨어 분석 및 개선 계획

---

## 1. 프로젝트 개요

### 1.1 시스템 정의
| 항목 | 내용 |
|------|------|
| 시스템명 | RKPU-Viewer (울산공항 비행절차 뷰어) |
| App ID | com.allofdaniel.rkpuviewer |
| 목적 | 실시간 항공기 추적, 비행절차 시각화, 항공기상 정보 제공 |
| 플랫폼 | Web (Vercel), Mobile (Capacitor/Android) |
| 버전 | 1.0.0 |

### 1.2 기술 스택
| 구분 | 기술 | 버전 |
|------|------|------|
| Frontend | React | 18.3.1 |
| 3D Map | Mapbox GL | 3.17.0 |
| 3D Graphics | Three.js | 0.182.0 |
| Backend | Vercel Serverless Functions | Node.js |
| Mobile | Capacitor | 8.0.0 |
| Build | Vite | 6.0.3 |
| Cloud Storage | AWS S3 | - |
| Database | SQLite (eAIP) | - |

---

## 2. 현재 아키텍처 분석

### 2.1 디렉토리 구조

```
rkpu-viewer/
├── src/
│   ├── App.jsx              # 5,641줄 - 모놀리식 메인 컴포넌트
│   ├── main.jsx             # React 진입점
│   └── index.css            # 전역 스타일
├── api/                     # Vercel Serverless Functions (9개)
│   ├── aircraft.js          # 실시간 항공기 위치 (airplanes.live)
│   ├── aircraft-trace.js    # 항공기 항적 데이터
│   ├── aircraft-photo.js    # 항공기 사진 (planespotters.net)
│   ├── weather.js           # 기상 데이터 (686줄, 16개 타입)
│   ├── notam.js             # NOTAM 데이터 (AWS S3)
│   ├── flight-route.js      # 비행경로 조회
│   ├── flight-schedule.js   # 비행스케줄
│   ├── ubikais-route.js     # UBIKAIS 항공기 경로
│   └── docs.js              # 문서 조회
├── public/
│   ├── *.glb                # 3D 모델 (A380, B737, B777, 헬리콥터, 레이더)
│   ├── aviation_data.json   # RKPU 공항 데이터
│   ├── atc_sectors.json     # ATC 섹터 정의
│   ├── charts/              # 절차 차트 이미지
│   └── data/
│       └── korea_airspace.json  # 전국 웨이포인트/항로/공역
├── eaip-crawler/            # eAIP 데이터 수집 시스템
│   ├── eaip_crawler.py      # 3,500+ 줄, SQLite DB 구축
│   └── deploy_to_nas.py     # NAS 배포 스크립트
└── capacitor.config.json    # 앱 설정
```

### 2.2 App.jsx 구조 분석

| 라인 범위 | 내용 | 문제점 |
|-----------|------|--------|
| 1-10 | Import 문 | React, Mapbox, Three.js 혼재 |
| 11-340 | 전역 상수/데이터 | AIRPORT_DATABASE 등 하드코딩 |
| 341-840 | 유틸리티 함수들 | 분리 필요 |
| 840-1000 | useState 선언 (45개+) | 상태 관리 복잡 |
| 1000-2000 | 데이터 페칭 로직 | 중복, 에러 처리 미흡 |
| 2000-3500 | 맵 렌더링 로직 | Mapbox 레이어 관리 |
| 3500-4500 | 3D 항공기 렌더링 | Three.js 통합 |
| 4500-5641 | JSX 렌더링 | UI 컴포넌트 혼재 |

### 2.3 API 엔드포인트 분석

| 엔드포인트 | 파일 | 기능 | 외부 API |
|------------|------|------|----------|
| `/api/aircraft` | aircraft.js | 실시간 항공기 위치 | airplanes.live |
| `/api/aircraft-trace` | aircraft-trace.js | 항공기 항적 | airplanes.live |
| `/api/aircraft-photo` | aircraft-photo.js | 항공기 사진 | planespotters.net |
| `/api/weather` | weather.js | 기상 데이터 (16종) | KMA, aviationweather.gov, Open-Meteo |
| `/api/notam` | notam.js | NOTAM | AWS S3 |
| `/api/flight-route` | flight-route.js | 비행경로 | - |
| `/api/flight-schedule` | flight-schedule.js | 스케줄 | - |
| `/api/ubikais-route` | ubikais-route.js | UBIKAIS 경로 | UBIKAIS |
| `/api/docs` | docs.js | 문서 | - |

---

## 3. 문제점 식별

### 3.1 코드 품질 문제

| ID | 문제 | 심각도 | 위치 | 설명 |
|----|------|--------|------|------|
| CQ-001 | 모놀리식 구조 | 심각 | App.jsx | 5,641줄 단일 파일, 모든 로직 혼재 |
| CQ-002 | 상태 관리 복잡 | 높음 | App.jsx:840-1000 | 45개 이상 useState, 관계 파악 어려움 |
| CQ-003 | 관심사 미분리 | 높음 | 전체 | UI, 비즈니스 로직, 데이터 접근 혼재 |
| CQ-004 | 중복 코드 | 중간 | API 호출 로직 | 유사 패턴 반복 |
| CQ-005 | 하드코딩 | 중간 | App.jsx:49-340 | 공항 정보, 설정값 하드코딩 |
| CQ-006 | 타입 안전성 없음 | 높음 | 전체 | JavaScript 사용, 타입 정의 없음 |
| CQ-007 | 테스트 없음 | 심각 | 전체 | 테스트 커버리지 0% |
| CQ-008 | 문서화 부재 | 높음 | 전체 | JSDoc, README 부족 |

### 3.2 보안 취약점

| ID | 취약점 | 심각도 | 위치 | CWE |
|----|--------|--------|------|-----|
| SEC-001 | API 키 하드코딩 | 심각 | api/weather.js:4 | CWE-798 |
| SEC-002 | Mapbox 토큰 노출 | 높음 | App.jsx:7 | CWE-798 |
| SEC-003 | CORS 전체 허용 | 높음 | 모든 API | CWE-942 |
| SEC-004 | 입력 검증 부재 | 높음 | API 쿼리 파라미터 | CWE-20 |
| SEC-005 | Rate Limiting 없음 | 중간 | 모든 API | CWE-770 |
| SEC-006 | 에러 정보 노출 | 낮음 | API 응답 | CWE-209 |

### 3.3 아키텍처 문제

| ID | 문제 | 영향 |
|----|------|------|
| ARCH-001 | 레이어 분리 없음 | 유지보수 어려움, 테스트 불가능 |
| ARCH-002 | 의존성 역전 없음 | 모듈 교체 불가능 |
| ARCH-003 | 상태 관리 패턴 없음 | 예측 불가능한 동작 |
| ARCH-004 | 에러 처리 표준 없음 | 장애 대응 어려움 |
| ARCH-005 | 로깅 시스템 없음 | 디버깅/모니터링 불가 |

### 3.4 DO-278A 인증 준비도

| 항목 | 현재 상태 | AL4 요구사항 | Gap |
|------|----------|-------------|-----|
| 테스트 커버리지 | 0% | >80% | -80% |
| 요구사항 추적성 | 없음 | 완전 추적 | 전체 |
| 설계 문서 | 없음 | SRS, SDD, SVV | 전체 |
| 코드 리뷰 | 없음 | 필수 | 전체 |
| 형상 관리 | Git 사용 | 승인 프로세스 | 부분 |
| 결함 관리 | 없음 | 추적 시스템 | 전체 |

---

## 4. 개선 계획

### 4.1 Phase 1: 프로젝트 기반 구축

**목표**: TypeScript, 테스트 환경, 코드 품질 도구 설정

**작업 항목**:
1. TypeScript 설정 (tsconfig.json)
2. ESLint + Prettier 설정
3. Vitest + React Testing Library 설정
4. Husky + lint-staged (pre-commit hooks)
5. 환경변수 설정 (.env.example)

**산출물**:
- `tsconfig.json`
- `.eslintrc.cjs`
- `.prettierrc`
- `vitest.config.ts`
- `.env.example`

### 4.2 Phase 2: 보안 취약점 수정

**목표**: 모든 보안 취약점 해결

**작업 항목**:
1. API 키를 환경변수로 이동
2. Mapbox 토큰 환경변수 처리
3. CORS 화이트리스트 적용
4. 입력 검증 (Zod 스키마)
5. Rate Limiting 구현

**산출물**:
- 수정된 API 파일들
- 입력 검증 스키마
- CORS 설정 파일

### 4.3 Phase 3: Domain 레이어 구축

**목표**: 핵심 비즈니스 로직 분리

**디렉토리 구조**:
```
src/domain/
├── entities/
│   ├── Aircraft.ts
│   ├── Waypoint.ts
│   ├── Route.ts
│   ├── Airspace.ts
│   ├── Weather.ts
│   ├── Notam.ts
│   └── FlightProcedure.ts
├── usecases/
│   ├── aircraft/
│   │   ├── TrackAircraft.ts
│   │   └── GetAircraftTrail.ts
│   ├── weather/
│   │   ├── FetchMetar.ts
│   │   └── FetchTaf.ts
│   └── gis/
│       ├── RenderFlightPath.ts
│       └── DetectAirspace.ts
└── repositories/
    ├── IAircraftRepository.ts
    ├── IWeatherRepository.ts
    └── IGISRepository.ts
```

### 4.4 Phase 4: Infrastructure 레이어 구축

**목표**: 외부 시스템 연동 분리

**디렉토리 구조**:
```
src/infrastructure/
├── api/
│   ├── clients/
│   │   ├── AirplanesLiveClient.ts
│   │   ├── KMAWeatherClient.ts
│   │   ├── OpenMeteoClient.ts
│   │   └── EAIPClient.ts
│   └── config/
│       └── apiConfig.ts
├── repositories/
│   ├── AircraftRepository.ts
│   ├── WeatherRepository.ts
│   └── GISRepository.ts
└── storage/
    ├── S3Storage.ts
    └── LocalStorage.ts
```

### 4.5 Phase 5: Presentation 레이어 분리

**목표**: UI 컴포넌트 모듈화

**디렉토리 구조**:
```
src/presentation/
├── components/
│   ├── map/
│   │   ├── MapContainer.tsx
│   │   ├── AircraftLayer.tsx
│   │   ├── WaypointLayer.tsx
│   │   ├── RouteLayer.tsx
│   │   ├── AirspaceLayer.tsx
│   │   └── ProcedureRibbon.tsx
│   ├── weather/
│   │   ├── MetarPanel.tsx
│   │   ├── TafPanel.tsx
│   │   ├── SigmetOverlay.tsx
│   │   └── NotamList.tsx
│   ├── aircraft/
│   │   ├── AircraftInfo.tsx
│   │   ├── AircraftList.tsx
│   │   ├── TrailRenderer.tsx
│   │   └── Model3D.tsx
│   ├── procedure/
│   │   ├── ProcedureList.tsx
│   │   ├── ChartViewer.tsx
│   │   └── ProcedurePanel.tsx
│   └── common/
│       ├── Panel.tsx
│       ├── Button.tsx
│       ├── Toggle.tsx
│       └── Accordion.tsx
├── hooks/
│   ├── useAircraft.ts
│   ├── useWeather.ts
│   ├── useMap.ts
│   ├── useProcedures.ts
│   └── useNotam.ts
├── contexts/
│   ├── MapContext.tsx
│   ├── AircraftContext.tsx
│   └── WeatherContext.tsx
└── pages/
    └── MainView.tsx
```

### 4.6 Phase 6: App.jsx 리팩토링

**목표**: 5,641줄 → 300줄 미만

**작업 단계**:
1. 상수/데이터 → `src/config/` 이동
2. 유틸리티 함수 → `src/utils/` 이동
3. 상태 관리 → Context API 적용
4. 맵 렌더링 → MapContainer 컴포넌트
5. 항공기 렌더링 → AircraftLayer 컴포넌트
6. UI 패널 → 개별 컴포넌트
7. 최종 통합 및 검증

### 4.7 Phase 7: 테스트 작성

**테스트 유형**:
1. Unit Tests (60%)
   - Domain entities
   - Use cases
   - Utility functions

2. Integration Tests (30%)
   - API 클라이언트
   - Repository 구현체
   - 컴포넌트 통합

3. E2E Tests (10%)
   - 주요 사용자 시나리오
   - Playwright 사용

**커버리지 목표**: 80% 이상

---

## 5. 목표 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  Map    │  │Weather  │  │Aircraft │  │Procedure│        │
│  │Components│  │Components│  │Components│  │Components│      │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
│  ┌────┴────────────┴────────────┴────────────┴────┐        │
│  │              Custom Hooks / Context             │        │
│  └─────────────────────┬───────────────────────────┘        │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                    Domain Layer                              │
│  ┌─────────────────────┴───────────────────────────┐        │
│  │                   Use Cases                      │        │
│  │  TrackAircraft, FetchWeather, RenderFlightPath  │        │
│  └─────────────────────┬───────────────────────────┘        │
│                        │                                     │
│  ┌─────────────────────┴───────────────────────────┐        │
│  │                   Entities                       │        │
│  │  Aircraft, Waypoint, Route, Weather, Notam      │        │
│  └─────────────────────┬───────────────────────────┘        │
│                        │                                     │
│  ┌─────────────────────┴───────────────────────────┐        │
│  │           Repository Interfaces                  │        │
│  └─────────────────────┬───────────────────────────┘        │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                Infrastructure Layer                          │
│  ┌─────────────────────┴───────────────────────────┐        │
│  │            Repository Implementations            │        │
│  └───────┬─────────────┬─────────────┬─────────────┘        │
│          │             │             │                       │
│  ┌───────┴───┐ ┌───────┴───┐ ┌───────┴───┐                  │
│  │API Clients│ │  Storage  │ │  Config   │                  │
│  └───────────┘ └───────────┘ └───────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. DO-278A 인증 문서 계획

### 6.1 필수 문서 목록

| 문서 | 설명 | 작성 Phase |
|------|------|-----------|
| PSAC | Plan for Software Aspects of Certification | Phase 1 |
| SDP | Software Development Plan | Phase 1 |
| SVP | Software Verification Plan | Phase 1 |
| SCM | Software Configuration Management Plan | Phase 1 |
| SQA | Software Quality Assurance Plan | Phase 1 |
| SRS | Software Requirements Specification | Phase 3 |
| SDD | Software Design Document | Phase 4-5 |
| SVR | Software Verification Results | Phase 7 |
| SECI | Software Environment Configuration Index | Phase 7 |

### 6.2 요구사항 추적 매트릭스

요구사항 ID 체계:
- `SRS-MAP-xxx`: 지도 관련 요구사항
- `SRS-ACF-xxx`: 항공기 관련 요구사항
- `SRS-WX-xxx`: 기상 관련 요구사항
- `SRS-PROC-xxx`: 절차 관련 요구사항
- `SRS-SEC-xxx`: 보안 관련 요구사항

---

## 7. 일정 계획

| Phase | 작업 | 예상 소요 |
|-------|------|----------|
| 1 | 프로젝트 기반 구축 | 2-3시간 |
| 2 | 보안 취약점 수정 | 1-2시간 |
| 3 | Domain 레이어 구축 | 3-4시간 |
| 4 | Infrastructure 레이어 구축 | 2-3시간 |
| 5 | Presentation 레이어 분리 | 4-5시간 |
| 6 | App.jsx 리팩토링 | 3-4시간 |
| 7 | 테스트 작성 | 3-4시간 |

**총 예상 소요**: 18-25시간

---

## 8. 위험 요소 및 대응

| 위험 | 영향 | 확률 | 대응 |
|------|------|------|------|
| 기존 기능 손상 | 높음 | 중간 | 단계별 검증, 테스트 우선 |
| API 호환성 문제 | 중간 | 낮음 | API 계약 유지 |
| 성능 저하 | 중간 | 낮음 | 성능 벤치마크 |
| 학습 곡선 | 낮음 | 중간 | 문서화 철저 |

---

*문서 버전: 1.0*
*작성일: 2026-01-11*
*AIRAC 기준: 2025-12-24*
