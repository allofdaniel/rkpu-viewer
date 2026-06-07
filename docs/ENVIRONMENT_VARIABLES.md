# TBAS 환경변수 정리

본 문서는 TBAS 운영에 필요한 환경변수의 용도와 적용 위치를 정리한 문서입니다.

실제 값은 GitHub에 저장하지 않습니다. 협력업체 전달 시에는 변수 이름과 용도만 공유하고, 실제 secret 값은 별도 보안 채널로 전달해야 합니다.

## 1. Vercel Serverless API 환경변수

### 1.1 OpenSky

| 변수 | 필수 여부 | 용도 |
|---|---|---|
| `OPENSKY_CLIENT_ID` | 선택 | OpenSky OAuth client id |
| `OPENSKY_CLIENT_SECRET` | 선택 | OpenSky OAuth client secret |
| `OPENSKY_USERNAME` | 선택 | OpenSky basic fallback username |
| `OPENSKY_PASSWORD` | 선택 | OpenSky basic fallback password |

OpenSky 인증 정보가 없어도 일부 기능은 anonymous 또는 fallback으로 동작할 수 있지만, rate limit이나 데이터 접근 안정성은 낮아질 수 있습니다.

### 1.2 Supabase

| 변수 | 필수 여부 | 용도 |
|---|---|---|
| `SUPABASE_URL` | NOTAM DB 사용 시 필수 | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | NOTAM DB 사용 시 필수 | Serverless API에서 `public.notams` 조회 |

`SUPABASE_SERVICE_ROLE_KEY`는 강한 권한을 가진 key이므로 프론트엔드에 노출하면 안 됩니다.

### 1.3 Aviationstack

| 변수 | 필수 여부 | 용도 |
|---|---|---|
| `VITE_AVIATIONSTACK_API_KEY` | 선택 | `/api/flight-schedule` fallback 조회 |

현재 이름은 `VITE_` prefix를 사용하지만, 서버리스 API에서도 참조합니다.

### 1.4 Rate limit / Redis / KV

| 변수 | 필수 여부 | 용도 |
|---|---|---|
| `RATE_LIMIT_MAX` | 선택 | 분당 요청 제한 수 |
| `UPSTASH_REDIS_REST_URL` | 선택 | Upstash Redis rate limit 저장소 |
| `UPSTASH_REDIS_REST_TOKEN` | 선택 | Upstash Redis token |
| `KV_REST_API_URL` | 선택 | Vercel KV REST URL |
| `KV_REST_API_TOKEN` | 선택 | Vercel KV REST token |

Redis/KV가 없으면 서버리스 함수 인스턴스 메모리 기반 fallback을 사용합니다.

## 2. UBIKAIS crawler 환경변수

### 2.1 로그인

| 변수 | 필수 여부 | 용도 |
|---|---|---|
| `UBIKAIS_USERNAME` | UBIKAIS 수집 시 필수 | UBIKAIS 로그인 계정 |
| `UBIKAIS_PASSWORD` | UBIKAIS 수집 시 필수 | UBIKAIS 로그인 비밀번호 |

UBIKAIS 계정 정보는 GitHub에 저장하지 않습니다.

### 2.2 실행 설정

| 변수 | 기본값 | 용도 |
|---|---|---|
| `CRAWL_MODE` | `realtime` 또는 구성별 기본값 | realtime/full 실행 모드 |
| `CRAWL_INTERVAL` | `300` 또는 `3600` | 반복 수집 주기, 초 단위 |
| `FULL_CRAWL_HOUR` | `6` | full crawl 실행 시각 |
| `TZ` | `Asia/Seoul` | 컨테이너 타임존 |

소스 안에는 5분 주기 scheduler 방식과 1시간 주기 unified Docker 방식이 모두 포함되어 있습니다. 실제 운영 주기는 실행 중인 compose 또는 scheduler 설정을 기준으로 판단해야 합니다.

### 2.3 Supabase 업로드

| 변수 | 필수 여부 | 용도 |
|---|---|---|
| `SUPABASE_URL` | Supabase 업로드 시 필수 | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 업로드 시 필수 | NOTAM upsert 권한 |

### 2.4 공공데이터

| 변수 | 필수 여부 | 용도 |
|---|---|---|
| `DATA_GO_KR_API_KEY` | 선택 | 인천공항 출도착 공공데이터 조회 |

## 3. UBIKAIS crawler Proxmox 배포 환경변수

| 변수 | 필수 여부 | 용도 |
|---|---|---|
| `PROXMOX_HOST` | 배포 시 필수 | Proxmox 또는 Docker 서버 주소 |
| `PROXMOX_USER` | 배포 시 필수 | SSH 사용자 |
| `PROXMOX_PASSWORD` | 선택 | SSH password 인증 |
| `PROXMOX_KEY_PATH` | 선택 | SSH key 인증 |

password와 key 중 운영 정책에 맞는 하나를 사용합니다.

## 4. eAIP crawler 환경변수

### 4.1 경로 설정

| 변수 | 기본값 | 용도 |
|---|---|---|
| `DB_PATH` | `/data/eaip_korea.db` | eAIP crawler SQLite DB 경로 |
| `EXPORT_PATH` | `/export/korea_airspace.json` | export JSON 경로 |
| `DAEMON_MODE` | `true` | 반복 실행 여부 |

### 4.2 S3 업로드

| 변수 | 기본값 | 용도 |
|---|---|---|
| `S3_BUCKET` | `notam-korea-data` | S3 bucket |
| `S3_KEY` | `eaip/korea_airspace.json` | 업로드 key |
| `AWS_ACCESS_KEY_ID` | 없음 | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | 없음 | AWS secret key |
| `AWS_REGION` | `ap-northeast-2` | AWS region |

AWS credentials가 없으면 로컬 JSON 생성까지만 수행하고 S3 업로드는 생략됩니다.

## 5. eAIP crawler NAS 배포 환경변수

| 변수 | 기본값 | 용도 |
|---|---|---|
| `NAS_HOST` | 없음 | NAS 주소 |
| `NAS_USER` | 없음 | SSH 사용자 |
| `NAS_DOCKER_PATH` | `/volume1/docker/eaip-crawler` | NAS 내 배포 경로 |
| `NAS_SSH_KEY_PATH` | 없음 | SSH key 경로 |

## 6. 환경변수 적용 위치

| 위치 | 적용 대상 |
|---|---|
| Vercel Project Settings | `/api/*.js` 서버리스 함수 |
| crawler server `.env` | UBIKAIS crawler |
| Docker compose env | UBIKAIS/eAIP crawler container |
| Supabase dashboard | DB, Storage, service role key 관리 |
| NAS/Proxmox host env | 배포 스크립트 및 컨테이너 실행 |

## 7. GitHub에 올리면 안 되는 값

아래 항목은 GitHub repository에 커밋하지 않습니다.

```text
.env
.env.local
_secrets.py
SUPABASE_SERVICE_ROLE_KEY
UBIKAIS_PASSWORD
OPENSKY_CLIENT_SECRET
AWS_SECRET_ACCESS_KEY
VERCEL_TOKEN
GITHUB_TOKEN
```

## 8. 협력업체 전달 권장 방식

협력업체에는 다음 순서로 전달하는 것을 권장합니다.

1. GitHub repository 접근 권한을 collaborator로 부여합니다.
2. 이 문서와 `EXTERNAL_APIS_AND_CRAWLERS.md`, `DEPLOYMENT.md`를 같이 안내합니다.
3. 실제 secret 값은 이메일 본문이나 GitHub issue가 아니라 별도 보안 채널로 전달합니다.
4. 업체가 자체 Vercel/Supabase에 올릴 경우, 위 환경변수를 업체 환경에 새로 등록하게 합니다.
5. 운영 인수인계 시 Supabase `public.notams` 최근 `crawled_at`과 Vercel `/api/notam` 응답을 함께 확인합니다.

