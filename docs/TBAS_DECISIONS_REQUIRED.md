# TBAS 추가 결정 필요 항목

본 문서는 TBAS를 협력업체와 공유하거나 운영 고도화하기 전에 사용자가 직접 결정해야 하는 항목을 정리한 문서입니다.

코드에서 바로 고칠 수 있는 부분은 반영하고, 운영 정책이나 외부 계정, 데이터 권리, 항공자료 기준처럼 사용자의 결정이 필요한 부분만 별도로 분리했습니다.

## 1. 위성 영상 소스 결정

현재 TBAS의 weather API는 radar와 satellite 요청 모두 RainViewer metadata를 기준으로 처리합니다.

| 선택지 | 장점 | 주의점 |
|---|---|---|
| RainViewer 유지 | 무료, 구현 단순, radar와 구조 통일 | 실제 위성 영상 품질/범위가 제한될 수 있음 |
| KMA API Hub 연동 | 국내 기상 위성/레이더와 업무 적합성 높음 | API key, 사용량 제한, 데이터 포맷 변환 필요 |
| 별도 기상 사업자 API | 안정성과 SLA 확보 가능 | 비용 및 계약 필요 |

권장안:

협력업체 전달 전에는 "현재 위성은 RainViewer 기반 metadata이며, 정식 국내 위성 연동은 KMA API Hub 또는 계약 API 확정 후 추가"라고 명시하는 것이 안전합니다.

## 2. UBIKAIS crawler 실제 운영 주기 확정

소스에는 5분 주기 scheduler 방식과 1시간 주기 Docker unified crawler 방식이 모두 포함되어 있습니다.

| 항목 | 후보 |
|---|---|
| 실시간 NOTAM 수집 주기 | 5분 |
| 전체 재수집 주기 | 1일 1회 |
| Docker unified crawl 주기 | 1시간 |
| 운영 서버 | Proxmox, NAS, 별도 Linux VM 중 택일 |

권장안:

운영 설명서에는 "실시간 NOTAM은 5분 주기, 전체 동기화는 1일 1회"로 정리하고, 실제 서버의 compose 설정을 이에 맞춰 고정하는 것이 좋습니다.

## 3. Supabase를 공식 NOTAM 원천으로 볼지 결정

현재 TBAS는 NOTAM 조회 시 Supabase DB를 1순위로 사용하고, Storage JSON과 static JSON을 fallback으로 둡니다.

| 선택지 | 의미 |
|---|---|
| Supabase DB를 공식 원천으로 지정 | 협력업체가 DB schema와 crawler upsert를 기준으로 인수 |
| S3/Storage JSON을 공식 원천으로 지정 | DB보다 파일 배포 중심으로 운영 |
| 양쪽 병행 | fallback 안정성은 좋지만 운영 설명이 복잡해짐 |

권장안:

Supabase DB를 공식 원천으로 지정하고, Storage/static JSON은 장애 fallback으로 설명하는 방식이 가장 명확합니다.

## 4. 차트 오버레이 기준 데이터 확정

울산공항 RKPU는 사용자가 QGIS로 보정한 PNG와 좌표 데이터를 넣어둔 상태입니다.

| 항목 | 필요한 결정 |
|---|---|
| RKPU | QGIS 보정 PNG/좌표를 공식 기준으로 사용할지 확정 |
| 다른 공항 | 활주로 중심점, chart bounds, 회전각을 어떤 기준자료로 재산정할지 확정 |
| 좌표 기준 | WGS84 경위도 기준 유지 |
| 보정 산출물 | PNG, bounds JSON, 원본 QGIS project를 함께 관리할지 결정 |

권장안:

협력업체에는 "RKPU는 QGIS 보정 산출물을 기준으로 하고, 타 공항은 동일한 절차로 재보정 필요"라고 전달하는 것이 좋습니다.

## 5. GitHub private repository 공유 방식

현재 repository가 private이면 URL만 전달해도 협력업체는 접근할 수 없습니다.

| 방식 | 설명 |
|---|---|
| GitHub collaborator 초대 | 가장 일반적인 방식 |
| organization/team 권한 부여 | 업체 인원이 여러 명일 때 적합 |
| zip 전달 | 빠르지만 이후 변경 추적이 어려움 |

권장안:

협력업체 담당자의 GitHub 계정을 collaborator로 초대하고, secret 파일은 제외한 상태로 공유합니다.

## 6. 외부 API key와 계정 전달 방식

아래 값은 GitHub에 올리면 안 됩니다.

```text
SUPABASE_SERVICE_ROLE_KEY
UBIKAIS_PASSWORD
OPENSKY_CLIENT_SECRET
AWS_SECRET_ACCESS_KEY
VERCEL_TOKEN
GITHUB_TOKEN
```

| 항목 | 권장 방식 |
|---|---|
| 개발용 secret | 임시 key 발급 |
| 운영용 secret | 업체 운영 환경에 직접 등록 |
| 계정 비밀번호 | 별도 보안 채널 전달 |
| service role key | 전달 후 rotate 계획 수립 |

## 7. 데이터 라이선스 및 출처 표기

TBAS는 여러 무료/공개 API를 사용합니다.

| 소스 | 확인 필요 |
|---|---|
| ADS-B aggregator | 상업/협력업체 전달 시 이용조건 확인 |
| OpenSky | rate limit 및 attribution 확인 |
| Planespotters | 사진 표시 조건 확인 |
| Airport-Data | 이미지 사용 조건 확인 |
| AviationWeather.gov | 출처 표기 확인 |
| RainViewer | attribution 확인 |
| UBIKAIS/AIM | 재배포 가능 범위 확인 |

권장안:

협력업체 문서에는 "운영 전 각 외부 데이터 제공자의 이용조건과 출처 표기 정책 확인 필요" 문구를 남기는 것이 안전합니다.

## 8. 운영 모니터링 방식 결정

현재 TBAS는 기능 API가 많기 때문에 운영 전 최소 상태 점검 항목을 정해야 합니다.

| 항목 | 확인 대상 |
|---|---|
| ADS-B | `/api/aircraft` 응답 aircraft count |
| Weather | `/api/weather?type=metar&station=RKPU` |
| NOTAM | `/api/notam?period=current&bounds=32,123,44,146` |
| Crawler | `/health`, `/status` |
| Supabase | 최근 `crawled_at` |
| Vercel | production deployment status |

결정 필요:

Vercel monitoring, Supabase dashboard, 별도 uptime monitor 중 어떤 방식으로 운영 감시할지 정해야 합니다.

## 9. 협력업체 전달 전 최종 추천 정리

협력업체에 넘기기 전 기준안을 다음처럼 잡는 것을 권장합니다.

| 항목 | 추천 기준 |
|---|---|
| 공식 repo | GitHub private collaborator 방식 |
| 운영 URL | `https://tbas.vercel.app` |
| NOTAM 원천 | Supabase DB |
| NOTAM fallback | Supabase Storage, static JSON |
| 항적 | ADS-B aggregator + OpenSky 보조 |
| 기상 | AviationWeather.gov + RainViewer |
| 위성 | 추후 KMA 또는 계약 API 검토 |
| crawler 운영 | 실시간 5분, 전체 1일 |
| secret 전달 | GitHub 외부 보안 채널 |

