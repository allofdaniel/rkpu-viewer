# NOTAM (Notice to Air Missions) 전문 해석 가이드

## 목차
1. [NOTAM 개요](#1-notam-개요)
2. [NOTAM 식별자와 유형](#2-notam-식별자와-유형)
3. [Q-Line (Qualifier Line) 상세](#3-q-line-qualifier-line-상세)
4. [NOTAM 항목 A~G](#4-notam-항목-ag)
5. [QCODE 상세 (2번째/3번째 글자 - 주제)](#5-qcode-상세-2번째3번째-글자---주제)
6. [QCODE 상세 (4번째/5번째 글자 - 상태)](#6-qcode-상세-4번째5번째-글자---상태)
7. [시간 형식](#7-시간-형식)
8. [좌표 및 반경 형식](#8-좌표-및-반경-형식)
9. [고도 형식](#9-고도-형식)
10. [실제 NOTAM 해석 예제](#10-실제-notam-해석-예제)
11. [참고 문서](#11-참고-문서)

---

## 1. NOTAM 개요

NOTAM(Notice to Air Missions)은 항공 종사자에게 비행 운영에 필수적인 정보를 전달하는 공지입니다. 항공기 운항에 영향을 미칠 수 있는 시설, 서비스, 절차 또는 위험요소의 설정, 상태, 변경에 관한 정보를 담고 있습니다.

### NOTAM의 주요 용도
- 활주로/유도로 폐쇄 또는 제한
- 항행안전시설(NAVAID) 운용 상태
- 항공등화 시스템 상태
- 공역 제한 (훈련, 사격, 낙하산 강하 등)
- 건설 공사 및 장애물 설치
- 조류 활동 경고
- 특별 비행 행사

### ICAO NOTAM 기본 구조
```
(NOTAM 번호) (NOTAM 유형)
Q) (Q-Line: 자격자료)
A) (위치) B) (유효시작) C) (유효종료)
D) (일정 - 선택사항)
E) (본문 내용)
F) (하한고도 - 선택사항) G) (상한고도 - 선택사항)
```

---

## 2. NOTAM 식별자와 유형

### NOTAM 번호 형식
```
시리즈문자 + 번호/연도
예: A1234/24, B0667/21, C0045/24
```

| 구성요소 | 설명 | 예시 |
|---------|------|------|
| 시리즈 문자 | NOTAM 분류 카테고리 | A, B, C, D, E... |
| 번호 | 해당 연도 내 순번 (4자리) | 0001 ~ 9999 |
| 연도 | 발행 연도 (2자리) | 24 = 2024년 |

### NOTAM 유형 (NOTAM Types)

| 유형 | 명칭 | 설명 |
|------|------|------|
| **NOTAMN** | New (신규) | 새로운 정보를 담은 NOTAM |
| **NOTAMR** | Replace (대체) | 기존 NOTAM을 대체/수정 |
| **NOTAMC** | Cancel (취소) | 기존 NOTAM을 취소 |

### NOTAMR/NOTAMC 참조 형식
```
A1081/24 NOTAMC A1045/24
          ↑       ↑
     취소 유형   취소되는 NOTAM 번호

A1082/24 NOTAMR A1050/24
          ↑       ↑
     대체 유형   대체되는 NOTAM 번호
```

**중요:** NOTAMC나 NOTAMR이 발행되면, 참조된 원본 NOTAM은 더 이상 유효하지 않습니다.

---

## 3. Q-Line (Qualifier Line) 상세

Q-Line은 NOTAM의 자동 필터링과 검색을 위한 코드화된 정보를 포함합니다.

### Q-Line 형식
```
Q) FIR/QCODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORDS
```

### Q-Line 8개 필드 상세

| 필드 | 명칭 | 설명 | 예시 |
|------|------|------|------|
| 1 | **FIR** | 비행정보구역 | RKRR (인천 FIR) |
| 2 | **QCODE** | 5글자 코드 (주제+상태) | QMRLC |
| 3 | **TRAFFIC** | 적용 항공 유형 | I, V, IV, K |
| 4 | **PURPOSE** | NOTAM 목적/용도 | NBO, BO, M, K |
| 5 | **SCOPE** | 적용 범위 | A, E, W, AE, AW |
| 6 | **LOWER** | 하한 고도 (FL) | 000 |
| 7 | **UPPER** | 상한 고도 (FL) | 999 |
| 8 | **COORDS** | 좌표 + 반경 | 3733N12653E005 |

### 필드별 상세 설명

#### 3. TRAFFIC (적용 항공 유형)
| 코드 | 의미 |
|------|------|
| I | IFR (계기비행)만 해당 |
| V | VFR (시계비행)만 해당 |
| IV | IFR 및 VFR 모두 해당 |
| K | 체크리스트용 |

#### 4. PURPOSE (목적)
| 코드 | 의미 | 설명 |
|------|------|------|
| N | Notice (공지) | 항공기 운영자에게 통보 |
| B | Briefing | 비행 전 브리핑 자료용 |
| O | Operations | 운항에 영향 |
| M | Miscellaneous | 기타 |
| K | Checklist | 체크리스트 대상 |

**조합 예시:** NBO = Notice + Briefing + Operations (운영자 통보, 브리핑 자료, 운항 영향)

#### 5. SCOPE (적용 범위)
| 코드 | 의미 | Item A) 관계 |
|------|------|-------------|
| A | Aerodrome (비행장) | 단일 공항 코드 |
| E | En-route (항로) | 1~7개 FIR |
| W | Navigation Warning | 1~7개 FIR |
| AE | 비행장 + 항로 | 단일 공항 코드 |
| AW | 비행장 + 경고 | 단일 공항 코드 |

---

## 4. NOTAM 항목 A~G

### 필수 항목

#### A) Location (위치)
- 영향받는 비행장 또는 FIR
- ICAO 4글자 코드 사용
- 예: `A) RKSI` (인천국제공항)
- 복수 FIR 가능: `A) RKRR RJJJ` (인천FIR, 후쿠오카FIR)

#### B) Start (유효 시작)
- NOTAM 효력 시작 일시
- 형식: **YYMMDDHHMM** (UTC)
- 예: `B) 2412181200` = 2024년 12월 18일 12:00 UTC

#### C) End (유효 종료)
- NOTAM 효력 종료 일시
- 형식: **YYMMDDHHMM** (UTC)
- 예: `C) 2412202359`

**특수 종료 값:**
| 표시 | 의미 |
|------|------|
| EST | 추정 종료 (Estimated) - 주의: 미국 동부표준시가 아님! |
| PERM | 영구적 (차트/공항에 반영될 때까지) |

#### E) Text (본문)
- NOTAM 내용을 서술하는 본문
- ICAO 약어 사용
- 예: `E) RWY 15/33 CLSD DUE TO MAINT`

### 선택 항목

#### D) Schedule (일정)
- 반복되는 NOTAM의 활성 시간
- B)와 C) 사이에서 특정 시간대만 적용될 때 사용
- 예: `D) 0600-1800 DLY` (매일 06:00-18:00)
- 예: `D) MON-FRI 0800-1700` (월-금 08:00-17:00)

**일정 약어:**
| 약어 | 의미 |
|------|------|
| DLY | Daily (매일) |
| MON | Monday |
| TUE | Tuesday |
| WED | Wednesday |
| THU | Thursday |
| FRI | Friday |
| SAT | Saturday |
| SUN | Sunday |
| HJ | Sunrise to Sunset |
| HN | Sunset to Sunrise |
| H24 | 24시간 |

#### F) Lower Limit (하한 고도)
- 영향받는 공역의 최저 고도
- 공역 관련 NOTAM에서만 사용
- 예: `F) GND`, `F) 1500FT AGL`, `F) FL050`

#### G) Upper Limit (상한 고도)
- 영향받는 공역의 최고 고도
- 공역 관련 NOTAM에서만 사용
- 예: `G) 5000FT AMSL`, `G) FL150`, `G) UNL` (무제한)

---

## 5. QCODE 상세 (2번째/3번째 글자 - 주제)

QCODE의 첫 글자는 항상 **Q**입니다. 2번째와 3번째 글자가 **주제(Subject)**를 나타냅니다.

### 2번째 글자: 주요 카테고리

| 글자 | 카테고리 | 설명 |
|------|----------|------|
| **A** | Airspace (공역) | 공역 구조, 항로, 보고점 |
| **C** | Communications (통신) | 통신 및 감시 시설 |
| **F** | Facilities (시설) | 비행장 시설 및 서비스 |
| **G** | GNSS | 위성항법 서비스 |
| **I** | ILS/MLS | 계기착륙시스템 |
| **L** | Lighting (등화) | 항공등화 시설 |
| **M** | Movement (이동지역) | 활주로, 유도로, 계류장 |
| **N** | Navigation (항행) | 항행안전시설 (VOR, NDB 등) |
| **O** | Other (기타) | 기타 정보 |
| **P** | Procedures (절차) | 항공교통 절차 |
| **R** | Restrictions (제한) | 공역 제한 |
| **S** | Services (서비스) | 항공교통 및 기상 서비스 |
| **W** | Warnings (경고) | 항행 경고 |

### 주요 3번째 글자 (카테고리별)

#### L - Lighting (등화) 관련
| 코드 | 의미 |
|------|------|
| LA | Approach Lighting (진입등) |
| LB | Aerodrome Beacon (비행장 비컨) |
| LC | Runway Centerline Lights (활주로 중심선등) |
| LE | Runway Edge Lights (활주로 가장자리등) |
| LF | Sequenced Flashing Lights (순차 점멸등) |
| LH | High Intensity Lights (고광도등) |
| LI | Runway End Identifier Lights (REIL) |
| LL | Low Intensity Lights (저광도등) |
| LM | Medium Intensity Lights (중광도등) |
| LP | PAPI (정밀진입경로지시등) |
| LT | Threshold Lights (활주로 시단등) |
| LV | VASIS (시각진입경사지시등) |
| LX | Taxiway Centerline Lights (유도로 중심선등) |
| LY | Taxiway Edge Lights (유도로 가장자리등) |
| LZ | Touchdown Zone Lights (접지구역등) |

#### M - Movement Area (이동지역) 관련
| 코드 | 의미 |
|------|------|
| MA | Movement Area (이동지역 전체) |
| MB | Bearing Strength (지지력) |
| MC | Clearway (개방구역) |
| MD | Declared Distances (공시거리) |
| MG | Taxiing Guidance (유도안내) |
| MH | Arresting Gear (착륙제동장치) |
| MK | Parking Area (주기장) |
| MM | Daylight Markings (주간표지) |
| MN | Apron (계류장) |
| MP | Aircraft Stands (항공기 주기위치) |
| MR | Runway (활주로) |
| MS | Stopway (정지로) |
| MT | Threshold (활주로 시단) |
| MU | Turning Bay (회전장) |
| MW | Strip/Shoulder (활주로대/갓길) |
| MX | Taxiway (유도로) |

#### N - Navigation Facilities (항행시설) 관련
| 코드 | 의미 |
|------|------|
| NA | All Radio Navigation Facilities |
| NB | NDB (Non-Directional Beacon) |
| NC | DME (Distance Measuring Equipment) |
| ND | TACAN |
| NG | Glide Path |
| NL | Localizer |
| NM | Marker Beacon |
| NN | UHF NAVAID (TACAN) |
| NO | VOR |
| NT | VORTAC |

#### R - Airspace Restrictions (공역 제한) 관련
| 코드 | 의미 |
|------|------|
| RA | Airspace Reservation |
| RC | Aerial Survey/Observation |
| RD | Danger Area |
| RO | Overflying |
| RP | Prohibited Area (비행금지구역) |
| RR | Restricted Area (비행제한구역) |
| RT | Temporary Restricted Area |

#### W - Warnings (경고) 관련
| 코드 | 의미 |
|------|------|
| WA | Air Display (에어쇼) |
| WB | Balloon/Kite |
| WC | Captive Balloon |
| WD | Demolition |
| WE | Exercise (훈련) |
| WF | Fire (화재) |
| WG | Glider Flying |
| WH | Blasting |
| WJ | Banner/Aerial Towing |
| WL | Laser |
| WM | Missile/Gun/Rocket Firing |
| WP | Parachute Jumping (낙하산 강하) |
| WR | Radioactive Materials |
| WS | Burning/Smoke |
| WT | Mass Movement (집단이동) |
| WU | Unmanned Aircraft (드론) |
| WV | Formation Flight |
| WZ | Model Flying |

---

## 6. QCODE 상세 (4번째/5번째 글자 - 상태)

4번째와 5번째 글자는 주제의 **상태(Condition/Status)**를 나타냅니다.

### 가용성 관련 (Availability)
| 코드 | 의미 | 설명 |
|------|------|------|
| AC | Withdrawn for Maintenance | 정비를 위해 철수 |
| AD | Available for Daylight Ops | 주간 운용만 가능 |
| AF | Flight Checked | 비행점검 완료 |
| AH | Hours of Service Changed | 운용 시간 변경 |
| AK | Normal Operations Resumed | 정상 운용 재개 |
| AL | Operative (Subject to) | 조건부 운용 |
| AM | Military Ops Only | 군용만 가능 |
| AN | Available for Night Ops | 야간 운용만 가능 |
| AO | Operational | 운용 중 |
| AP | Prior Permission Required | 사전 허가 필요 |
| AR | Available on Request | 요청 시 사용 가능 |
| **AS** | **Unserviceable** | **사용 불가 (고장)** |
| AU | Not Available | 사용 불가 |
| AW | Completely Withdrawn | 완전 철수 |

### 변경 관련 (Changes)
| 코드 | 의미 | 설명 |
|------|------|------|
| CA | Activated | 활성화됨 |
| CC | Completed | 완료됨 |
| CD | Deactivated | 비활성화됨 |
| CE | Erected | 설치됨 |
| CF | Frequency Changed | 주파수 변경 |
| CG | Downgraded | 등급 하향 |
| **CH** | **Changed** | **변경됨** |
| CI | Identification Changed | 식별부호 변경 |
| CL | Realigned | 재정렬됨 |
| CM | Displaced | 이동됨 |
| **CN** | **Canceled** | **취소됨** |
| CO | Operating | 운용 중 |
| CP | Reduced Power | 출력 감소 |
| CR | Temporarily Replaced | 임시 대체 |
| CS | Installed | 설치됨 |
| CT | On Test | 시험 중 |

### 위험 상황 관련 (Hazard Conditions)
| 코드 | 의미 | 설명 |
|------|------|------|
| HA | Braking Action | 제동 상태 |
| HB | Friction Coefficient | 마찰계수 |
| HC | Compacted Snow | 압축 적설 |
| HD | Dry Snow | 건조 적설 |
| HE | Water Depth | 수심 |
| HF | Completely Free of Snow/Ice | 눈/얼음 없음 |
| HG | Grass Cutting | 잔디 예초 |
| HH | Hazard Due To | ~로 인한 위험 |
| HI | Covered with Ice | 결빙 |
| HK | Bird Migration | 철새 이동 |
| HM | Marked By | ~로 표시됨 |
| HN | Wet Snow/Slush | 습설/진눈깨비 |
| HO | Obscured by Snow | 눈으로 가려짐 |
| HP | Snow Clearance in Progress | 제설 진행 중 |
| HR | Standing Water | 고인 물 |
| HS | Sanding in Progress | 모래 살포 중 |
| HV | Work Completed | 작업 완료 |
| **HW** | **Work in Progress** | **작업 진행 중** |
| HX | Bird Concentration | 조류 밀집 |
| HY | Snow Banks | 눈 더미 |
| HZ | Frozen Ruts/Ridges | 동결된 바퀴자국 |

### 제한 관련 (Limitations)
| 코드 | 의미 | 설명 |
|------|------|------|
| LA | Operating Without Auxiliary Power | 보조전원 없이 운용 |
| LB | Reserved for Based Aircraft | 기지 항공기 전용 |
| **LC** | **Closed** | **폐쇄** |
| LD | Unsafe | 불안전 |
| LF | Interference From | ~로부터 간섭 |
| LH | Weight Restricted | 중량 제한 |
| LI | Closed to IFR | IFR 폐쇄 |
| LK | Operates as Fixed Light | 고정등으로 운용 |
| LL | Usable Length/Width | 사용가능 길이/폭 |
| LN | Closed at Night | 야간 폐쇄 |
| LP | Prohibited To | ~에게 금지 |
| LR | Restricted | 제한됨 |
| LT | Limited To | ~로 제한 |
| LV | Closed to VFR | VFR 폐쇄 |
| LW | Will Take Place | 실시 예정 |
| LX | Caution Advised | 주의 요망 |

### 기타
| 코드 | 의미 |
|------|------|
| XX | 해당 코드 없음 (본문 참조) |

---

## 7. 시간 형식

### 기본 형식: YYMMDDHHMM (UTC)
```
YY  = 연도 (2자리)
MM  = 월 (01-12)
DD  = 일 (01-31)
HH  = 시 (00-23)
MM  = 분 (00-59)
```

### 예시
| 표시 | 해석 |
|------|------|
| 2412181430 | 2024년 12월 18일 14:30 UTC |
| 2501010000 | 2025년 1월 1일 00:00 UTC |
| 2406152359 | 2024년 6월 15일 23:59 UTC |

### 특수 표시
| 표시 | 의미 | 주의사항 |
|------|------|----------|
| **EST** | Estimated (추정) | 동부표준시(EST)가 아님! |
| **PERM** | Permanent (영구) | 자동 만료되지 않음 |

**EST 사용 시 주의:**
- 종료 시간이 불확실할 때 사용
- EST가 포함된 NOTAM은 만료 전에 취소(NOTAMC) 또는 대체(NOTAMR)되어야 함
- 취소/대체되지 않으면 C)항의 시간에 자동 만료

---

## 8. 좌표 및 반경 형식

### 좌표 형식: DDMMNDDDDME + 반경
```
DDMM  = 위도 (도+분, 4자리)
N/S   = 북위/남위
DDDMM = 경도 (도+분, 5자리)
E/W   = 동경/서경
NNN   = 영향 반경 (해리, 3자리)
```

### 예시 분석
```
3733N12653E025
│││││││││││└─ 025 = 반경 25 NM
│││││││└─┴─── E = 동경
│││││└─────── 12653 = 126도 53분
││││└──────── N = 북위
└┴┴┴───────── 3733 = 37도 33분

해석: 북위 37°33', 동경 126°53' 중심, 반경 25해리
```

### 반경 계산
- 영향 범위를 포함하는 원의 반경
- 소수점 있을 경우 올림하여 정수화
- 예: 4.5 NM → 005

### 좌표 예시
| Q-Line 좌표 | 해석 |
|-------------|------|
| 3733N12653E005 | 37°33'N 126°53'E, 반경 5NM |
| 4159N08754W010 | 41°59'N 087°54'W, 반경 10NM |
| 5129N00028W025 | 51°29'N 000°28'W, 반경 25NM |

---

## 9. 고도 형식

### Q-Line 내 고도 (6, 7번째 필드)
- Flight Level (비행고도) 단위, 3자리
- FL000 ~ FL999 범위

| 표시 | 의미 |
|------|------|
| 000 | 지표면 (GND) 또는 해당없음 |
| 025 | FL025 (2,500ft) |
| 100 | FL100 (10,000ft) |
| 450 | FL450 (45,000ft) |
| 999 | 무제한 또는 해당없음 |

### 기본값
- 지상 시설 관련: `000/999`
- 활주로 폐쇄: `000/999`
- 공역 제한: 실제 고도 범위

### F), G) 항목 내 고도
| 표시 형식 | 예시 | 의미 |
|-----------|------|------|
| GND | F) GND | 지표면 |
| FT AGL | F) 500FT AGL | 지표면 위 500피트 |
| FT AMSL | G) 5000FT AMSL | 해발 5,000피트 |
| FL | G) FL150 | 비행고도 150 (15,000ft) |
| UNL | G) UNL | 무제한 (Unlimited) |

---

## 10. 실제 NOTAM 해석 예제

### 예제 1: 활주로 폐쇄
```
A1234/24 NOTAMN
Q) RKRR/QMRLC/IV/NBO/A/000/999/3733N12653E005
A) RKSI
B) 2412181200
C) 2412181800
E) RWY 15L/33R CLSD DUE TO MAINT
```

**해석:**
| 항목 | 내용 | 설명 |
|------|------|------|
| A1234/24 | NOTAM 번호 | 2024년 A시리즈 1234번 |
| NOTAMN | 유형 | 신규 NOTAM |
| RKRR | FIR | 인천 비행정보구역 |
| QMRLC | QCODE | MR(활주로) + LC(폐쇄) |
| IV | Traffic | IFR/VFR 모두 해당 |
| NBO | Purpose | 운영자 통보, 브리핑, 운항영향 |
| A | Scope | 비행장 |
| 000/999 | 고도 | 지상 시설 (해당없음) |
| A) RKSI | 위치 | 인천국제공항 |
| B) 2412181200 | 시작 | 2024.12.18 12:00 UTC |
| C) 2412181800 | 종료 | 2024.12.18 18:00 UTC |
| E) | 내용 | 활주로 15L/33R 정비로 폐쇄 |

---

### 예제 2: 항행시설 고장
```
B0567/24 NOTAMN
Q) RKRR/QNOAS/IV/BO/E/000/999/3545N12845E050
A) RKRR
B) 2412150000
C) 2412202359 EST
E) ULSAN VOR/DME (USN) U/S
```

**해석:**
| 항목 | 내용 | 설명 |
|------|------|------|
| QNOAS | QCODE | NO(VOR) + AS(사용불가) |
| E | Scope | 항로 (En-route) |
| EST | 종료 | 추정 (정확한 복구 시간 미정) |
| E) | 내용 | 울산 VOR/DME 사용 불가 |

---

### 예제 3: 공역 제한
```
C0123/24 NOTAMN
Q) RKRR/QRRCA/IV/BO/W/000/150/3600N12730E030
A) RKRR
B) 2412200800
C) 2412201200
D) 0800-1200
F) GND
G) FL150
E) RESTRICTED AREA R-50 ACT DUE TO MIL EXER
```

**해석:**
| 항목 | 내용 | 설명 |
|------|------|------|
| QRRCA | QCODE | RR(제한구역) + CA(활성화) |
| W | Scope | 항행경고 |
| 000/150 | 고도 | FL000~FL150 |
| D) 0800-1200 | 일정 | 08:00-12:00 활성 |
| F) GND | 하한 | 지표면 |
| G) FL150 | 상한 | FL150 |
| E) | 내용 | R-50 제한구역 군사훈련으로 활성화 |

---

### 예제 4: NOTAM 취소
```
A1300/24 NOTAMC A1234/24
Q) RKRR/QMRXX/IV/NBO/A/000/999/3733N12653E005
A) RKSI
B) 2412181600
C) 2412181600
E) RWY 15L/33R MAINT COMPLETED, NOTAM A1234/24 CANCELLED
```

**해석:**
- A1300/24가 A1234/24를 취소
- 활주로 정비 완료로 인한 취소
- A1234/24는 더 이상 유효하지 않음

---

### 예제 5: 항공등화
```
D0089/24 NOTAMN
Q) RKRR/QLPAS/IV/BO/A/000/999/3527N12922E005
A) RKPU
B) 2412171800
C) 2412180600
E) PAPI RWY 36 U/S
```

**해석:**
| 항목 | 내용 | 설명 |
|------|------|------|
| QLPAS | QCODE | LP(PAPI) + AS(사용불가) |
| A) RKPU | 위치 | 울산공항 |
| E) | 내용 | 활주로 36 PAPI 사용 불가 |

---

## 11. 참고 문서

### 국제 표준
- **ICAO Annex 15** - Aeronautical Information Services
- **ICAO Doc 8126** - Aeronautical Information Services Manual
- **ICAO Doc 8400** - ICAO Abbreviations and Codes (PANS-ABC)

### 온라인 리소스
- [FAA International NOTAM (Q) Codes](https://www.faa.gov/air_traffic/publications/atpubs/notam_html/appendix_b.html)
- [FAA Q-Code Lookup Tool](https://www.notams.faa.gov/common/qcode/qcode23.html)
- [FAA ICAO NOTAM Format Example](https://www.faa.gov/air_traffic/flight_info/aeronav/notams/media/ICAO_NOTAM_Format_Example.pdf)
- [EUROCONTROL Digital NOTAM](https://ext.eurocontrol.int/aixm_confluence/display/DNOTAM)
- [Pilot Institute NOTAM Guide](https://pilotinstitute.com/what-are-notams-notices-to-air-missions-explained/)

### 대한민국 관련
- 국토교통부 항공정보포털시스템 (AIP Korea)
- 인천비행정보구역(RKRR) NOTAM 서비스

---

## 부록: 자주 사용되는 ICAO 약어

| 약어 | 의미 |
|------|------|
| ABV | Above (이상) |
| ACFT | Aircraft (항공기) |
| ACT | Active (활성) |
| AD | Aerodrome (비행장) |
| AGL | Above Ground Level (지표면 위) |
| AMSL | Above Mean Sea Level (해발) |
| AP | Airport (공항) |
| APCH | Approach (접근) |
| ARR | Arrival (도착) |
| ATC | Air Traffic Control |
| BTN | Between (사이) |
| CLSD | Closed (폐쇄) |
| CTN | Caution (주의) |
| DEP | Departure (출발) |
| DUE | Due to (때문에) |
| E | East (동) |
| EXER | Exercise (훈련) |
| FL | Flight Level (비행고도) |
| FLT | Flight (비행) |
| FT | Feet (피트) |
| GND | Ground (지표면) |
| HR | Hour (시간) |
| IAP | Instrument Approach Procedure |
| MAINT | Maintenance (정비) |
| MIL | Military (군) |
| MIN | Minutes (분) |
| N | North (북) |
| NM | Nautical Miles (해리) |
| OBS | Obstacle (장애물) |
| OPN | Open (개방) |
| OPS | Operations (운항) |
| PSN | Position (위치) |
| RWY | Runway (활주로) |
| S | South (남) |
| SFC | Surface (표면) |
| TFC | Traffic (교통) |
| THR | Threshold (시단) |
| TIL | Until (~까지) |
| TWY | Taxiway (유도로) |
| U/S | Unserviceable (사용불가) |
| UNL | Unlimited (무제한) |
| W | West (서) |
| WEF | With Effect From (~부터) |
| WI | Within (~이내) |
| WIP | Work In Progress (작업중) |

---

*이 문서는 ICAO 및 FAA 자료를 기반으로 작성되었습니다.*
*마지막 업데이트: 2024년 12월*
