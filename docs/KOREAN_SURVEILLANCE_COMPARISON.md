# TBAS / Korean Surveillance 비교 검토 메모

본 문서는 TBAS 개선 과정에서 `korean-surveillance` 프로젝트를 참고하여 비교한 결과를 정리한 내부 검토 메모입니다.

목적은 단순 복사가 아니라, TBAS 운영 안정성 및 협력업체 인수인계 관점에서 실질적으로 도움이 되는 항목만 선별하는 것입니다.

## 1. 비교 대상

| 항목 | TBAS | Korean Surveillance |
|---|---|---|
| 프론트엔드 | React + Vite | React + Vite 계열 |
| 배포 | Vercel | Vercel 계열 구조 포함 |
| 항적 API | ADS-B aggregator + OpenSky 보조 | ADS-B aggregator 중심 |
| 항공기 사진 | Planespotters + Airport-Data | Planespotters + Airport-Data |
| 기상 API | AviationWeather.gov + RainViewer | AviationWeather.gov + RainViewer |
| NOTAM | Supabase DB + fallback | S3/JSON 중심 문서 흔적 |
| 자체 crawler | UBIKAIS/PIB, eAIP | UBIKAIS 관련 구조 포함 |

## 2. 바로 반영한 개선

| 항목 | 내용 |
|---|---|
| 협력업체 전달 문서 | 외부 API, crawler, 배포, 환경변수 문서 추가 |
| 결정 필요 문서 | 위성, crawler 주기, Supabase 원천, 차트 보정 기준 등 별도 정리 |
| Weather API 호환성 | `station`, `icao`, `ids` 파라미터 호환 정리 |
| Weather API alias | `amos` 요청을 METAR alias로 처리 |
| Weather fallback | 오래된 고정 날짜 대신 현재 시각 기반 fallback 응답으로 개선 |
| Git ignore 보강 | secret, crawler 산출물, coverage, test-results, `nul`, Office lock 파일 차단 |

## 3. 대한감시에서 참고했지만 그대로 가져오지 않은 항목

### 3.1 KMA 위성/기상 문서

Korean Surveillance 문서에는 KMA API Hub 기반 위성/기상 연동 설명이 있으나, 실제 weather API 구현은 TBAS와 유사하게 AviationWeather.gov와 RainViewer 중심입니다.

판단:

문서 문구만 보고 KMA 연동이 완성된 것처럼 TBAS에 반영하지 않았습니다. 대신 `TBAS_DECISIONS_REQUIRED.md`에 KMA 위성 연동을 결정 필요 항목으로 분리했습니다.

### 3.2 항공기 사진 API

Korean Surveillance의 항공기 사진 API는 Planespotters와 Airport-Data fallback 구조입니다.

판단:

TBAS도 이미 같은 방향의 구현을 갖고 있으므로 대규모 변경은 하지 않았습니다. 현재 TBAS는 선택 항공기 변경 시 stale photo 요청을 피하는 구조가 들어가 있어, 단순 복사보다 기존 구조 유지가 더 안전합니다.

### 3.3 API 문서

Korean Surveillance의 일부 문서는 인코딩이 깨진 한글 주석과 오래된 설명이 섞여 있습니다.

판단:

협력업체 전달용 문서는 TBAS 기준으로 새로 작성했습니다. 대한감시 문서를 그대로 가져오지 않았습니다.

## 4. TBAS가 더 나은 부분

| 항목 | 설명 |
|---|---|
| NOTAM 원천 구조 | Supabase DB, Storage, static fallback 계층이 명확함 |
| 외부 API fallback | ADS-B 소스 fallback과 OpenSky 보조 병합 구조가 정리되어 있음 |
| 협력업체 문서화 | API, crawler, 배포, 환경변수, 결정사항 문서가 분리됨 |
| 항공기 사진 처리 | 선택 항공기 변경에 따른 stale request 방지 구조가 있음 |

## 5. 대한감시 쪽이 참고할 만했던 부분

| 항목 | TBAS 반영 여부 |
|---|---|
| 더 방어적인 `.gitignore` | 반영 |
| backend API spec 형식 | TBAS 문서 작성 시 참고 |
| KMA 위성 연동 방향성 | 결정 필요 항목으로 반영 |
| UBIKAIS crawler 운영 구조 | TBAS crawler 문서에 반영 |

## 6. 남은 개선 후보

아래 항목은 코드만으로 바로 확정하기 어렵고, 데이터 기준 또는 운영 정책 결정이 필요합니다.

| 항목 | 필요한 결정 |
|---|---|
| 실제 위성 영상 | RainViewer 유지, KMA API Hub, 별도 계약 API 중 선택 |
| RKPU 차트 오버레이 | QGIS 보정 산출물을 공식 기준으로 확정 |
| 타 공항 차트 오버레이 | 활주로 중심점, bounds, rotation 재보정 필요 |
| crawler 운영 서버 | Proxmox, NAS, 별도 VM 중 최종 운영지 확정 |
| NOTAM 공식 원천 | Supabase DB를 공식 원천으로 명시할지 확정 |
| 외부 데이터 라이선스 | 협력업체 재전달 전 이용조건 확인 필요 |

## 7. 결론

Korean Surveillance는 TBAS의 초기 구현 방향을 검토하는 참고자료로 유용했지만, 현재 TBAS가 더 협력업체 인수인계에 적합한 구조로 정리되어 있습니다.

이번 개선에서는 대한감시의 방어적인 저장소 관리 방식과 API 문서화 관점을 TBAS에 반영했고, 실제 구현이 불확실한 KMA 위성 연동은 결정 필요 항목으로 분리했습니다.

