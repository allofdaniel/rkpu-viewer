export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TBAS NOTAM API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; background: #fafafa; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { font-size: 2rem; }
    .swagger-ui .info .description p { line-height: 1.6; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      const spec = {
        "openapi": "3.0.3",
        "info": {
          "title": "TBAS NOTAM API",
          "description": "**TBAS (Tower-Based ATC Surveillance) NOTAM API**\\n\\nAIM Korea (aim.koca.go.kr) XNOTAM 데이터를 5분 간격으로 자동 수집하여 제공합니다.\\n\\n## 데이터 소스\\n- **AIM Korea**: aim.koca.go.kr/xNotam (국내/국제/SNOWTAM)\\n- **자동 수집**: Supabase Edge Function + pg_cron (5분 주기)\\n- **저장소**: Supabase PostgreSQL (PostgREST)\\n\\n## 수집 범위\\n- **국내 NOTAM**: A/C/D/E/G/Z 시리즈\\n- **국제 NOTAM**: 18개 공항 (RKSI, RKSS, RKPK, RKPC 등)\\n- **SNOWTAM**: 적설/활주로 상태 정보",
          "version": "2.0.0",
          "contact": {
            "name": "TBAS",
            "url": "https://tbas.vercel.app"
          }
        },
        "servers": [
          {
            "url": "https://tbas.vercel.app",
            "description": "Production"
          },
          {
            "url": "http://localhost:5173",
            "description": "Development"
          }
        ],
        "paths": {
          "/api/notam": {
            "get": {
              "summary": "NOTAM 데이터 조회",
              "description": "Supabase DB에서 NOTAM 데이터를 조회합니다.\\nDB 조회 실패 시 Supabase Storage JSON 파일로 자동 폴백됩니다.",
              "operationId": "getNotams",
              "tags": ["NOTAM"],
              "parameters": [
                {
                  "name": "period",
                  "in": "query",
                  "description": "유효 기간 필터",
                  "required": false,
                  "schema": {
                    "type": "string",
                    "enum": ["all", "current", "1month", "1year"],
                    "default": "all"
                  },
                  "examples": {
                    "all": { "value": "all", "summary": "모든 NOTAM" },
                    "current": { "value": "current", "summary": "현재 유효한 NOTAM만" },
                    "1month": { "value": "1month", "summary": "전후 1개월 이내" },
                    "1year": { "value": "1year", "summary": "전후 1년 이내" }
                  }
                },
                {
                  "name": "bounds",
                  "in": "query",
                  "description": "지리적 범위 필터 (south,west,north,east). Q-line 좌표가 없는 NOTAM도 함께 반환됩니다.",
                  "required": false,
                  "schema": {
                    "type": "string",
                    "example": "33.0,124.0,38.0,132.0"
                  }
                },
                {
                  "name": "limit",
                  "in": "query",
                  "description": "반환할 최대 NOTAM 수 (0 = 제한 없음, 기본 2000)",
                  "required": false,
                  "schema": {
                    "type": "integer",
                    "default": 0,
                    "minimum": 0
                  }
                }
              ],
              "responses": {
                "200": {
                  "description": "성공",
                  "content": {
                    "application/json": {
                      "schema": { "$ref": "#/components/schemas/NotamResponse" },
                      "examples": {
                        "database": {
                          "summary": "DB 조회 응답",
                          "value": {
                            "data": [
                              {
                                "notam_number": "A0123/26",
                                "location": "RKSI",
                                "full_text": "GG RKZZNAXX\\r\\n010800 RKRRYNYX\\r\\n(A0123/26 NOTAMN\\r\\nQ)RKRR/QMRLC/IV/NBO/A/000/999/3723N12647E005\\r\\nA)RKSI B)2602010800 C)2602051200\\r\\nE)RWY 15L/33R CLSD DUE TO MAINT",
                                "e_text": "RWY 15L/33R CLSD DUE TO MAINT",
                                "qcode": "QMRLC",
                                "qcode_mean": "",
                                "effective_start": "2602010800",
                                "effective_end": "2602051200",
                                "series": "A",
                                "fir": "RKRR",
                                "q_lat": 37.383333,
                                "q_lon": 126.783333,
                                "q_radius": 5
                              }
                            ],
                            "count": 232,
                            "afterPeriodFilter": 232,
                            "source": "database",
                            "filtered": 232,
                            "returned": 1,
                            "period": "all",
                            "bounds": null
                          }
                        },
                        "withBounds": {
                          "summary": "영역 필터 적용",
                          "value": {
                            "data": [],
                            "count": 232,
                            "afterPeriodFilter": 180,
                            "source": "database",
                            "filtered": 120,
                            "returned": 100,
                            "period": "current",
                            "bounds": { "south": 33, "west": 124, "north": 38, "east": 132 }
                          }
                        }
                      }
                    }
                  }
                },
                "500": {
                  "description": "서버 오류",
                  "content": {
                    "application/json": {
                      "schema": { "$ref": "#/components/schemas/ErrorResponse" }
                    }
                  }
                }
              }
            }
          },
          "/api/notam?period=current": {
            "get": {
              "summary": "현재 유효 NOTAM 조회",
              "description": "현재 시점에 유효한 NOTAM만 반환합니다. B)(시작) <= 현재 <= C)(종료) 조건을 만족하는 NOTAM.",
              "operationId": "getCurrentNotams",
              "tags": ["NOTAM 예시"],
              "parameters": [],
              "responses": {
                "200": {
                  "description": "성공",
                  "content": {
                    "application/json": {
                      "schema": { "$ref": "#/components/schemas/NotamResponse" }
                    }
                  }
                }
              }
            }
          },
          "/api/notam?period=current&bounds=33,124,38,132&limit=50": {
            "get": {
              "summary": "한반도 영역 + 현재 유효 + 50건 제한",
              "description": "한반도 영역(33N~38N, 124E~132E) 내 현재 유효한 NOTAM을 최대 50건 반환합니다.",
              "operationId": "getKoreaCurrentNotams",
              "tags": ["NOTAM 예시"],
              "parameters": [],
              "responses": {
                "200": {
                  "description": "성공",
                  "content": {
                    "application/json": {
                      "schema": { "$ref": "#/components/schemas/NotamResponse" }
                    }
                  }
                }
              }
            }
          }
        },
        "components": {
          "schemas": {
            "Notam": {
              "type": "object",
              "description": "NOTAM 데이터 객체",
              "properties": {
                "notam_number": {
                  "type": "string",
                  "description": "NOTAM 번호",
                  "example": "A0123/26"
                },
                "location": {
                  "type": "string",
                  "description": "ICAO 공항/위치 코드",
                  "example": "RKSI"
                },
                "full_text": {
                  "type": "string",
                  "description": "NOTAM 전체 텍스트 (Q/A/B/C/E 라인 포함)"
                },
                "e_text": {
                  "type": "string",
                  "description": "E항목 (NOTAM 내용 요약)",
                  "example": "RWY 15L/33R CLSD DUE TO MAINT"
                },
                "qcode": {
                  "type": "string",
                  "description": "Q-코드 (NOTAM 유형 분류)",
                  "example": "QMRLC"
                },
                "qcode_mean": {
                  "type": "string",
                  "description": "Q-코드 의미 (번역)"
                },
                "effective_start": {
                  "type": "string",
                  "description": "유효 시작일 (YYMMDDHHMM)",
                  "example": "2602010800"
                },
                "effective_end": {
                  "type": "string",
                  "description": "유효 종료일 (YYMMDDHHMM 또는 PERM)",
                  "example": "2602051200"
                },
                "series": {
                  "type": "string",
                  "description": "시리즈 (A/C/D/E/G/Z/S)",
                  "example": "A"
                },
                "fir": {
                  "type": "string",
                  "description": "FIR 코드",
                  "example": "RKRR"
                },
                "q_lat": {
                  "type": "number",
                  "nullable": true,
                  "description": "Q-line 위도 (decimal degrees)",
                  "example": 37.383333
                },
                "q_lon": {
                  "type": "number",
                  "nullable": true,
                  "description": "Q-line 경도 (decimal degrees)",
                  "example": 126.783333
                },
                "q_radius": {
                  "type": "integer",
                  "nullable": true,
                  "description": "Q-line 영향 반경 (NM)",
                  "example": 5
                }
              }
            },
            "NotamResponse": {
              "type": "object",
              "properties": {
                "data": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/Notam" },
                  "description": "NOTAM 배열"
                },
                "count": {
                  "type": "integer",
                  "description": "DB 전체 NOTAM 수",
                  "example": 232
                },
                "afterPeriodFilter": {
                  "type": "integer",
                  "description": "기간 필터 적용 후 수",
                  "example": 180
                },
                "filtered": {
                  "type": "integer",
                  "description": "모든 필터 적용 후 수",
                  "example": 120
                },
                "returned": {
                  "type": "integer",
                  "description": "실제 반환 수 (limit 적용)",
                  "example": 50
                },
                "source": {
                  "type": "string",
                  "enum": ["database", "storage"],
                  "description": "데이터 소스 (DB 우선, Storage 폴백)"
                },
                "period": {
                  "type": "string",
                  "enum": ["all", "current", "1month", "1year"],
                  "description": "적용된 기간 필터"
                },
                "bounds": {
                  "type": "object",
                  "nullable": true,
                  "description": "적용된 지리적 범위",
                  "properties": {
                    "south": { "type": "number", "example": 33 },
                    "west": { "type": "number", "example": 124 },
                    "north": { "type": "number", "example": 38 },
                    "east": { "type": "number", "example": 132 }
                  }
                }
              }
            },
            "ErrorResponse": {
              "type": "object",
              "properties": {
                "error": {
                  "type": "string",
                  "description": "에러 메시지",
                  "example": "NOTAM service temporarily unavailable"
                },
                "code": {
                  "type": "string",
                  "description": "에러 코드",
                  "example": "NOTAM_ERROR"
                }
              }
            }
          }
        },
        "tags": [
          {
            "name": "NOTAM",
            "description": "NOTAM 데이터 조회 API (파라미터 설명)"
          },
          {
            "name": "NOTAM 예시",
            "description": "자주 사용되는 조합 예시 (클릭하여 바로 실행)"
          }
        ]
      };

      SwaggerUIBundle({
        spec: spec,
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis
        ],
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        tryItOutEnabled: true
      });
    };
  </script>
</body>
</html>`;

  res.status(200).send(html);
}
