# TBAS 배포 및 운영 구조

본 문서는 TBAS의 GitHub, Vercel, Supabase, 자체 크롤러 서버 배포 구조를 정리한 문서입니다.

## 1. 저장소 및 운영 URL

| 항목 | 값 |
|---|---|
| GitHub repository | `https://github.com/allofdaniel/tbas.git` |
| 기본 branch | `master` |
| 운영 URL | `https://tbas.vercel.app` |
| 배포 플랫폼 | Vercel |
| 프론트엔드 | React + Vite |
| 서버 API | Vercel Serverless Functions |

## 2. Vercel 배포 구조

TBAS는 Vercel에서 정적 프론트엔드와 서버리스 API를 함께 제공합니다.

```text
GitHub tbas repository
  -> Vercel build
  -> Vite frontend build
  -> Vercel Serverless API
  -> tbas.vercel.app
```

## 3. Vercel 라우팅

주요 설정은 `vercel.json`에 정의되어 있습니다.

```text
/api/(.*) -> /api/$1
/assets/* -> Vite build assets
/sw.js -> no-cache service worker
```

## 4. 주요 Vercel API

| API | 역할 |
|---|---|
| `/api/aircraft` | 실시간 ADS-B 항공기 목록 |
| `/api/aircraft-trace` | 개별 항공기 trace |
| `/api/aircraft-details` | 항공기 상세정보 |
| `/api/aircraft-photo` | 항공기 사진 |
| `/api/opensky-history` | OpenSky 기반 과거 경로 |
| `/api/aircraft-track` | OpenSky track fallback |
| `/api/weather` | METAR, TAF, radar metadata |
| `/api/radar-tile` | RainViewer radar tile proxy |
| `/api/notam` | NOTAM 조회 |
| `/api/flight-route` | 편명/노선/스케줄 조회 |
| `/api/flight-schedule` | Aviationstack schedule fallback |
| `/api/docs` | API 문서 UI |

## 5. 운영 데이터 흐름

```text
사용자 브라우저
  -> tbas.vercel.app
  -> React UI
  -> Vercel API
  -> 외부 API 또는 Supabase
  -> JSON/PNG 응답
  -> 지도 및 패널 표시
```

## 6. Supabase 구조

TBAS에서 Supabase는 주로 NOTAM 저장소로 사용됩니다.

| 항목 | 내용 |
|---|---|
| 주요 테이블 | `public.notams` |
| 조회 API | `/api/notam` |
| 입력 주체 | UBIKAIS/PIB 자체 크롤러 |
| fallback | Supabase Storage JSON, static JSON |

## 7. NOTAM 저장 흐름

```text
UBIKAIS/PIB crawler
  -> NOTAM 표준화
  -> Supabase REST API upsert
  -> public.notams
  -> Vercel /api/notam
  -> TBAS frontend
```

## 8. UBIKAIS crawler 서버 배포

UBIKAIS crawler는 Docker 기반으로 별도 서버에서 운영할 수 있습니다.

| 항목 | 내용 |
|---|---|
| 배포 스크립트 | `ubikais-crawler/deploy_to_proxmox.py` |
| 대상 플랫폼 | Proxmox 또는 Docker 사용 가능한 Linux 서버 |
| 기본 원격 경로 | `/opt/ubikais-crawler` |
| 상태 확인 | `http://localhost:8080/health` |
| 상태 상세 | `http://localhost:8080/status` |
| 선택 데이터 서버 | `http://localhost:8081/*.json` |

필요한 서버 접속 정보는 환경변수로 주입합니다.

```text
PROXMOX_HOST
PROXMOX_USER
PROXMOX_PASSWORD
PROXMOX_KEY_PATH
```

## 9. UBIKAIS crawler 실행 방식

```text
Docker container
  -> scheduler.py 또는 docker/unified_crawler.py
  -> UBIKAIS/AIM/Weather 수집
  -> JSON 파일 저장
  -> Supabase upsert
```

주요 실행 주기는 다음과 같습니다.

| 실행 방식 | 주기 |
|---|---|
| realtime scheduler | 기본 300초 |
| full crawl | 기본 매일 06시 |
| unified Docker crawler | 기본 3600초 |

## 10. eAIP crawler 서버 배포

eAIP crawler는 NAS 또는 Docker 서버에 배포할 수 있습니다.

| 항목 | 내용 |
|---|---|
| 배포 스크립트 | `eaip-crawler/deploy_to_nas.py` |
| 대상 플랫폼 | NAS Docker 또는 Linux Docker |
| 기본 원격 경로 | `/volume1/docker/eaip-crawler` |
| 출력 파일 | `/export/korea_airspace.json` |
| 반복 주기 | 하루 1회 |

필요한 서버 접속 정보는 환경변수로 주입합니다.

```text
NAS_HOST
NAS_USER
NAS_DOCKER_PATH
NAS_SSH_KEY_PATH
```

## 11. eAIP crawler S3 업로드

AWS credentials가 설정되어 있으면 결과 JSON을 S3에 업로드할 수 있습니다.

```text
S3_BUCKET
S3_KEY
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
```

기본 개념:

```text
eAIP crawler
  -> korea_airspace.json 생성
  -> S3 업로드
  -> 필요한 서비스에서 JSON 사용
```

## 12. 협력업체 전달 방식

GitHub repository가 private이면 링크만 전달해도 외부 업체는 접근할 수 없습니다.

권장 방식:

1. 협력업체 담당자의 GitHub 계정을 repository collaborator로 초대합니다.
2. 저장소 접근 권한은 최소 권한으로 부여합니다.
3. `.env`, `.env.local`, `_secrets.py`는 공유하지 않습니다.
4. 실제 API key와 계정 정보는 별도 보안 채널로 전달합니다.
5. 업체에게 본 문서와 `ENVIRONMENT_VARIABLES.md`를 함께 전달합니다.

## 13. 운영 점검 항목

협력업체가 운영 상태를 점검할 때 확인할 항목입니다.

| 점검 항목 | 확인 방법 |
|---|---|
| Vercel 배포 상태 | Vercel dashboard 또는 production URL |
| 실시간 항적 | `/api/aircraft?lat=36.5&lon=127.8&radius=500` |
| 기상 | `/api/weather?type=metar&station=RKPU` |
| NOTAM | `/api/notam?period=current&bounds=32,123,44,146` |
| crawler health | crawler server `/health` |
| Supabase 데이터 | `public.notams` 최근 `crawled_at` |
| eAIP 최신성 | `korea_airspace.json` metadata |

