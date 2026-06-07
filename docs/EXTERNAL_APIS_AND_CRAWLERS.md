# TBAS 외부 API 및 자체 크롤러 정리

본 문서는 TBAS에서 사용하는 외부 API, 자체 크롤러, 데이터 흐름, 호출 주기, 전송 형식을 협력업체가 이해할 수 있도록 정리한 기술 문서입니다.

## 1. 전체 구조

TBAS는 Vercel에 배포된 React/Vite 기반 항공 상황표출 시스템입니다.

```text
사용자 브라우저
  -> tbas.vercel.app
  -> Vercel 정적 프론트엔드
  -> Vercel Serverless API
  -> 외부 항공/기상 API 및 자체 수집 데이터
```

주요 데이터 계통은 다음과 같습니다.

| 구분 | 데이터 | 주요 소스 |
|---|---|---|
| 실시간 항적 | ADS-B aircraft list | adsb.lol, airplanes.live, adsb.fi, OpenSky |
| 항공기 상세 | 기종, 등록번호 등 | HexDB |
| 항공기 사진 | 항공기 사진 URL | Planespotters, Airport-Data |
| 항공기 과거 경로 | 선택 항공기 track | OpenSky |
| 기상 | METAR, TAF | AviationWeather.gov |
| 레이더/위성 | 레이더 메타데이터 및 타일 | RainViewer |
| NOTAM | 한국 NOTAM | Supabase DB, Supabase Storage, static fallback |
| 운항/노선 | 편명, 출도착, 스케줄 | local flight_schedule, FlightRadar24 계열, Aviationstack |
| 공역/eAIP | 항로, waypoint, 공역 | 자체 eAIP crawler |

## 2. 실시간 항적 API

### 2.1 TBAS API

```text
GET /api/aircraft?lat=36.5&lon=127.8&radius=500
```

### 2.2 역할

지도 위 항공기 위치, 고도, 속도, 방위, 호출부호를 표시하기 위한 핵심 API입니다.

### 2.3 프론트 호출 주기

| 항목 | 값 |
|---|---|
| 호출 주기 | 약 5초 |
| 중심 위도 | 36.5 |
| 중심 경도 | 127.8 |
| 반경 | 500 NM |

### 2.4 외부 데이터 소스

TBAS 서버리스 API가 아래 소스를 순차적으로 호출합니다.

| 우선순위 | 소스 | URL 형식 |
|---|---|---|
| 1 | adsb.lol | `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}` |
| 2 | airplanes.live | `https://api.airplanes.live/v2/point/{lat}/{lon}/{radius}` |
| 3 | adsb.fi | `https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{radius}` |
| 보조 | OpenSky | `https://opensky-network.org/api/states/all?...` |

OpenSky는 보조 데이터로 병합됩니다.

### 2.5 OpenSky 인증

OpenSky는 OAuth 인증 정보를 사용할 수 있습니다.

```text
OPENSKY_CLIENT_ID
OPENSKY_CLIENT_SECRET
OPENSKY_USERNAME
OPENSKY_PASSWORD
```

### 2.6 응답 형식

```json
{
  "ac": [
    {
      "hex": "71c123",
      "flight": "KAL123",
      "lat": 36.123,
      "lon": 127.456,
      "alt_baro": 32000,
      "gs": 430,
      "track": 180
    }
  ],
  "msg": "No error",
  "now": 1780754448511,
  "total": 69,
  "sources": {
    "primary_adsb": 69,
    "primary_source": "adsb.lol",
    "opensky": 0,
    "merged": 69
  }
}
```

프론트엔드는 이를 내부 항공기 모델로 변환합니다.

```text
hex
callsign
lat
lon
altitude_ft
ground_speed
track
vertical_rate
squawk
category
```

## 3. 개별 항공기 Trace API

### 3.1 TBAS API

```text
GET /api/aircraft-trace?hex={icao_hex}
```

### 3.2 역할

특정 항공기의 최근 trace 데이터를 가져와 항적 trail 표시의 보조 데이터로 사용합니다.

### 3.3 외부 데이터 소스

| 우선순위 | 소스 | URL 형식 |
|---|---|---|
| 1 | adsb.lol | `https://api.adsb.lol/v2/hex/{hex}` |
| 2 | airplanes.live | `https://api.airplanes.live/v2/hex/{hex}` |
| 3 | adsb.fi | `https://opendata.adsb.fi/api/v2/hex/{hex}` |

### 3.4 특징

| 항목 | 내용 |
|---|---|
| 입력 | ICAO hex 6자리 |
| 캐시 | no-store |
| rate limit 대응 | 429 발생 시 다음 소스로 fallback |
| 프론트 제한 | 모든 항공기가 아니라 일부 항공기에 대해서만 요청 |

## 4. 항공기 상세정보 API

### 4.1 TBAS API

```text
GET /api/aircraft-details?hex={icao_hex}
```

### 4.2 외부 API

```text
https://hexdb.io/api/v1/aircraft/{HEX}
```

### 4.3 역할

선택 항공기의 기종, 제작사, 등록번호 등 메타데이터를 조회합니다.

### 4.4 응답 예시

```json
{
  "ModeS": "71C123",
  "Registration": "HL0000",
  "Manufacturer": "Boeing",
  "Type": "B738"
}
```

## 5. 항공기 사진 API

### 5.1 TBAS API

```text
GET /api/aircraft-photo?reg={registration}&hex={icao_hex}
```

### 5.2 외부 데이터 소스

| 우선순위 | 소스 | URL 형식 |
|---|---|---|
| 1 | Planespotters by reg | `https://api.planespotters.net/pub/photos/reg/{reg}` |
| 2 | Planespotters by hex | `https://api.planespotters.net/pub/photos/hex/{hex}` |
| 3 | Airport-Data by reg | `https://www.airport-data.com/api/ac_thumb.json?r={reg}&n=1` |
| 4 | Airport-Data by hex | `https://www.airport-data.com/api/ac_thumb.json?m={hex}&n=1` |

### 5.3 응답 형식

```json
{
  "source": "planespotters",
  "image": "https://example.com/photo.jpg",
  "photographer": "Photographer Name",
  "link": "https://example.com/detail"
}
```

사진이 없을 경우:

```json
{
  "source": null,
  "image": null
}
```

## 6. 선택 항공기 과거 경로 API

### 6.1 TBAS API

```text
GET /api/opensky-history?icao24={icao_hex}&hours=24
GET /api/aircraft-track?hex={icao_hex}&time=0
```

### 6.2 외부 API

```text
https://opensky-network.org/api/tracks/all?icao24={icao24}&time=0
```

### 6.3 응답 형식

```json
{
  "icao24": "71c123",
  "callsign": "KAL123",
  "totalPoints": 1000,
  "sampledPoints": 500,
  "path": [
    {
      "time": 1780750000,
      "lat": 36.1,
      "lon": 127.5,
      "altitude_ft": 32000,
      "track": 180,
      "on_ground": false
    }
  ],
  "source": "opensky-rest",
  "authenticated": true
}
```

## 7. 기상 API

### 7.1 TBAS API

```text
GET /api/weather?type=metar&station=RKPU
GET /api/weather?type=taf&station=RKPU
GET /api/weather?type=radar
GET /api/weather?type=satellite
GET /api/radar-tile?path={rainviewer_tile_path}
```

### 7.2 외부 데이터 소스

| 데이터 | 외부 API | 용도 |
|---|---|---|
| METAR | `https://aviationweather.gov/api/data/metar?ids={station}&format=json` | 현재 관측 기상 |
| TAF | `https://aviationweather.gov/api/data/taf?ids={station}&format=json` | 예보 |
| Radar metadata | `https://api.rainviewer.com/public/weather-maps.json` | 레이더 타임스탬프 |
| Radar tiles | `https://tilecache.rainviewer.com/...` | 레이더 PNG 타일 |

### 7.3 호출 주기

| 데이터 | 주기 |
|---|---|
| METAR | 약 5분 |
| TAF | 약 5분 |
| radar metadata | 표시 중 약 1분 또는 5분 |
| radar tile | 지도 타일 필요 시 |
| lightning | 표시 중 약 30초, 현재 placeholder |
| SIGMET | 패널 또는 레이어 표시 시, 현재 placeholder |
| LLWS | 패널 또는 레이어 표시 시, 현재 placeholder |

### 7.4 Radar tile proxy 구조

RainViewer 타일은 브라우저에서 직접 호출하지 않고 Vercel API를 통해 프록시됩니다.

```text
브라우저
  -> /api/radar-tile?path=/...
  -> Vercel API
  -> https://tilecache.rainviewer.com/...
  -> PNG 반환
```

## 8. NOTAM API

### 8.1 TBAS API

```text
GET /api/notam?period=current&bounds=32,123,44,146
```

### 8.2 데이터 소스 우선순위

| 우선순위 | 소스 | 설명 |
|---|---|---|
| 1 | Supabase DB | `public.notams` 테이블 |
| 2 | Supabase Storage | `notam_latest.json` fallback |
| 3 | static JSON | `/data/notams.json` fallback |

### 8.3 Supabase 테이블 주요 컬럼

```text
notam_number
location
full_text
e_text
qcode
qcode_mean
effective_start
effective_end
series
fir
q_lat
q_lon
q_radius_nm
q_lower_alt
q_upper_alt
notam_type
ref_notam
traffic
purpose
scope
data_source
crawled_at
```

### 8.4 응답 형식

```json
{
  "data": [
    {
      "notam_number": "A1234/26",
      "location": "RKPU",
      "full_text": "...",
      "qcode": "QMRLC",
      "effective_start": "2026-06-01T00:00:00Z",
      "effective_end": "2026-06-10T00:00:00Z",
      "q_lat": 35.593,
      "q_lon": 129.352,
      "q_radius_nm": 5,
      "data_source": "UBIKAIS+PIB"
    }
  ],
  "count": 407,
  "source": "database",
  "period": "current"
}
```

## 9. 운항/노선/스케줄 API

### 9.1 TBAS API

```text
GET /api/flight-route?callsign={callsign}&reg={registration}&hex={icao_hex}
GET /api/flight-schedule?flight={flight_number}
```

### 9.2 데이터 소스

| 우선순위 | 소스 | 설명 |
|---|---|---|
| 1 | local `flight_schedule.json` | 자체 수집 또는 정적 배치된 운항 스케줄 |
| 2 | FlightRadar24 계열 endpoint | 편명/hex 기반 보조 조회 |
| 3 | ADS-B Exchange trace | hex 기반 보조 route 조회 |
| 4 | Aviationstack | API key가 있을 때 fallback |

### 9.3 Aviationstack 환경변수

```text
VITE_AVIATIONSTACK_API_KEY
```

### 9.4 응답 예시

```json
{
  "source": "ubikais",
  "flightId": "KAL123",
  "callsign": "KAL123",
  "origin": {
    "iata": "ICN",
    "icao": "RKSI",
    "name": null
  },
  "destination": {
    "iata": "PUS",
    "icao": "RKPK",
    "name": null
  },
  "aircraft": {
    "registration": "HL0000",
    "type": "B738",
    "hex": "71c123"
  },
  "schedule": {
    "std": "...",
    "etd": "...",
    "atd": "...",
    "sta": "...",
    "eta": "...",
    "status": "..."
  }
}
```

## 10. 자체 크롤러: UBIKAIS / PIB 통합 NOTAM 크롤러

### 10.1 위치

```text
ubikais-crawler/
```

### 10.2 역할

UBIKAIS, AIM Korea PIB, AviationWeather.gov, 공항 관련 데이터를 주기적으로 수집하고 JSON 저장 또는 Supabase DB upsert를 수행합니다.

### 10.3 주요 파일

| 파일 | 역할 |
|---|---|
| `scheduler.py` | 주기 실행 스케줄러 |
| `collect_realtime_unified.py` | UBIKAIS + PIB 통합 NOTAM 수집 및 Supabase upsert |
| `ubikais_crawler.py` | UBIKAIS 기반 수집 로직 |
| `upload_to_supabase.py` | 기존 JSON 데이터를 Supabase로 업로드 |
| `supabase_schema.sql` | Supabase NOTAM 테이블 스키마 |
| `docker-compose.yml` | Docker 실행 설정 |
| `deploy_to_proxmox.py` | Proxmox 서버 배포 스크립트 |

### 10.4 수집 대상

| 소스 | URL | 데이터 |
|---|---|---|
| UBIKAIS | `https://ubikais.fois.go.kr:8030` | FIR NOTAM, AD NOTAM, SNOWTAM, prohibited/off zone |
| AIM Korea | `https://aim.koca.go.kr` | PIB/NOTAM |
| AviationWeather.gov | `https://aviationweather.gov` | METAR, TAF |
| data.go.kr | `apis.data.go.kr/B551177/...` | 인천공항 출도착 상태 |
| airport.kr | `https://www.airport.kr` | 인천공항 웹 fallback |

### 10.5 필요 환경변수

```text
UBIKAIS_USERNAME
UBIKAIS_PASSWORD
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DATA_GO_KR_API_KEY
CRAWL_MODE
CRAWL_INTERVAL
FULL_CRAWL_HOUR
TZ
```

### 10.6 실행 주기

| 모드 | 주기 |
|---|---|
| scheduler realtime | 기본 300초 |
| scheduler full crawl | 기본 매일 06시 |
| docker unified crawler | 기본 3600초 |
| healthcheck | 5분 |

실제 운영 주기는 어떤 Docker compose 또는 scheduler 설정으로 실행하느냐에 따라 달라집니다.

### 10.7 Supabase 전송 방식

```text
POST {SUPABASE_URL}/rest/v1/notams
Header: Prefer: resolution=merge-duplicates,return=minimal
Body: JSON array
```

배치 크기는 일반적으로 500건입니다.

### 10.8 저장 파일 예시

```text
data/flight_schedule.json
data/weather_current.json
data/notam_current.json
data/realtime_current.json
data/ubikais_full_YYYYMMDD_HHMMSS.json
data/scheduler.log
```

## 11. 자체 크롤러: eAIP Korea 크롤러

### 11.1 위치

```text
eaip-crawler/
```

### 11.2 역할

한국 eAIP에서 waypoint, navaid, route, airspace, airport 정보를 수집하고 JSON으로 내보냅니다.

### 11.3 주요 파일

| 파일 | 역할 |
|---|---|
| `eaip_crawler.py` | eAIP 크롤링 로직 |
| `entrypoint.sh` | Docker 실행 루프 |
| `docker-compose.yml` | Docker 설정 |
| `deploy_to_nas.py` | NAS 배포 스크립트 |

### 11.4 출력 파일

```text
/export/korea_airspace.json
```

### 11.5 출력 형식

```json
{
  "metadata": {
    "source": "eAIP Korea",
    "airac_date": "...",
    "url": "..."
  },
  "waypoints": [],
  "navaids": [],
  "routes": [],
  "airspaces": [],
  "airports": []
}
```

### 11.6 실행 주기

| 항목 | 값 |
|---|---|
| 최초 실행 | 컨테이너 시작 즉시 |
| 반복 실행 | 86400초, 하루 1회 |
| S3 업로드 | AWS credentials가 있으면 자동 업로드 |

### 11.7 S3 관련 환경변수

```text
S3_BUCKET
S3_KEY
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
```

## 12. 보안상 공유 금지 항목

아래 파일과 값은 협력업체에 GitHub로 공유할 때 포함하지 않는 것이 원칙입니다.

```text
.env
.env.local
_secrets.py
Supabase service role key
UBIKAIS 계정 비밀번호
OpenSky client secret
AWS secret key
Vercel token
GitHub token
```

필요한 경우 실제 값은 별도 보안 채널로 전달하고, GitHub에는 `.env.example` 형식만 유지합니다.

