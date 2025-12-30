export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NOTAM API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { font-size: 2rem; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      const spec = {
        "openapi": "3.0.3",
        "info": {
          "title": "NOTAM API",
          "description": "항공고시보(NOTAM) 데이터 API - AWS S3에서 실시간 및 전체 NOTAM 데이터를 제공합니다.\\n\\n## 데이터 소스\\n- **S3 Bucket**: notam-korea-data (ap-southeast-2)\\n- **실시간 데이터**: notam_realtime/{날짜}/\\n- **전체 데이터**: notam_complete/20251201_100751/notam_final_complete.json (155,000+ NOTAMs)",
          "version": "1.0.0",
          "contact": {
            "name": "RKPU Viewer",
            "url": "https://rkpu-viewer.vercel.app"
          }
        },
        "servers": [
          {
            "url": "https://rkpu-viewer.vercel.app",
            "description": "Production Server"
          },
          {
            "url": "http://localhost:5173",
            "description": "Development Server"
          }
        ],
        "paths": {
          "/api/notam": {
            "get": {
              "summary": "NOTAM 데이터 조회",
              "description": "실시간 또는 전체 NOTAM 데이터를 조회합니다. S3에서 데이터를 가져오며, 실패 시 백업 API로 폴백합니다.",
              "operationId": "getNotams",
              "tags": ["NOTAM"],
              "parameters": [
                {
                  "name": "source",
                  "in": "query",
                  "description": "데이터 소스 선택",
                  "required": false,
                  "schema": {
                    "type": "string",
                    "enum": ["realtime", "complete"],
                    "default": "realtime"
                  },
                  "examples": {
                    "realtime": {
                      "value": "realtime",
                      "summary": "실시간 NOTAM (오늘/어제 데이터)"
                    },
                    "complete": {
                      "value": "complete",
                      "summary": "전체 NOTAM 데이터베이스 (155,000+)"
                    }
                  }
                },
                {
                  "name": "period",
                  "in": "query",
                  "description": "유효 기간 필터 (complete 소스에서만 작동)",
                  "required": false,
                  "schema": {
                    "type": "string",
                    "enum": ["all", "current", "1month", "1year"],
                    "default": "all"
                  },
                  "examples": {
                    "all": {
                      "value": "all",
                      "summary": "모든 NOTAM"
                    },
                    "current": {
                      "value": "current",
                      "summary": "현재 유효한 NOTAM만"
                    },
                    "1month": {
                      "value": "1month",
                      "summary": "전후 1개월 이내"
                    },
                    "1year": {
                      "value": "1year",
                      "summary": "전후 1년 이내"
                    }
                  }
                },
                {
                  "name": "bounds",
                  "in": "query",
                  "description": "지리적 범위 필터 (south,west,north,east 형식)",
                  "required": false,
                  "schema": {
                    "type": "string",
                    "example": "33.0,124.0,38.0,132.0"
                  }
                },
                {
                  "name": "limit",
                  "in": "query",
                  "description": "반환할 최대 NOTAM 수 (0 = 제한 없음)",
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
                      "schema": {
                        "$ref": "#/components/schemas/NotamResponse"
                      },
                      "examples": {
                        "realtime": {
                          "summary": "실시간 NOTAM 응답",
                          "value": {
                            "data": [
                              {
                                "id": 12345,
                                "notam_number": "A0001/25",
                                "location": "RKSI",
                                "fir": "RKRR",
                                "qcode": "QMRLC",
                                "qcode_mean": "Runway closed",
                                "full_text": "A0001/25 NOTAMN\\nQ) RKRR/QMRLC/IV/NBO/A/000/999/3723N12647E005\\nA) RKSI B) 2501010000 C) 2501312359\\nE) RWY 15L/33R CLSD",
                                "e_text": "RWY 15L/33R CLSD",
                                "effective_start": "2501010000",
                                "effective_end": "2501312359",
                                "series": "A"
                              }
                            ],
                            "count": 156,
                            "returned": 156,
                            "source": "s3-realtime",
                            "file": "notam_realtime/2025-12-21/notams_2025-12-21T08-00-00.json",
                            "lastModified": "2025-12-21T08:00:15.000Z"
                          }
                        },
                        "complete": {
                          "summary": "전체 NOTAM 응답 (필터링됨)",
                          "value": {
                            "data": [],
                            "count": 155234,
                            "afterPeriodFilter": 12500,
                            "filtered": 850,
                            "returned": 100,
                            "source": "s3-complete",
                            "period": "current",
                            "bounds": {"south": 33, "west": 124, "north": 38, "east": 132},
                            "file": "notam_complete/20251201_100751/notam_final_complete.json"
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
                      "schema": {
                        "$ref": "#/components/schemas/ErrorResponse"
                      }
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
                "id": {
                  "type": "integer",
                  "description": "고유 ID"
                },
                "notam_number": {
                  "type": "string",
                  "description": "NOTAM 번호 (예: A0001/25)",
                  "example": "A0001/25"
                },
                "location": {
                  "type": "string",
                  "description": "ICAO 공항/위치 코드",
                  "example": "RKSI"
                },
                "fir": {
                  "type": "string",
                  "description": "FIR 코드",
                  "example": "RKRR"
                },
                "qcode": {
                  "type": "string",
                  "description": "Q-코드 (NOTAM 유형)",
                  "example": "QMRLC"
                },
                "qcode_mean": {
                  "type": "string",
                  "description": "Q-코드 의미",
                  "example": "Runway closed"
                },
                "full_text": {
                  "type": "string",
                  "description": "NOTAM 전체 텍스트"
                },
                "e_text": {
                  "type": "string",
                  "description": "E항목 (NOTAM 내용 요약)"
                },
                "effective_start": {
                  "type": "string",
                  "description": "유효 시작일 (YYMMDDHHMM)",
                  "example": "2501010000"
                },
                "effective_end": {
                  "type": "string",
                  "description": "유효 종료일 (YYMMDDHHMM 또는 PERM)",
                  "example": "2501312359"
                },
                "series": {
                  "type": "string",
                  "description": "시리즈 (A, B, C 등)",
                  "example": "A"
                }
              }
            },
            "NotamResponse": {
              "type": "object",
              "properties": {
                "data": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Notam"
                  },
                  "description": "NOTAM 배열"
                },
                "count": {
                  "type": "integer",
                  "description": "전체 NOTAM 수"
                },
                "afterPeriodFilter": {
                  "type": "integer",
                  "description": "기간 필터 후 NOTAM 수 (complete 소스만)"
                },
                "filtered": {
                  "type": "integer",
                  "description": "모든 필터 적용 후 NOTAM 수"
                },
                "returned": {
                  "type": "integer",
                  "description": "실제 반환된 NOTAM 수"
                },
                "source": {
                  "type": "string",
                  "enum": ["s3-realtime", "s3-complete", "api-fallback"],
                  "description": "데이터 소스"
                },
                "file": {
                  "type": "string",
                  "description": "S3 파일 경로"
                },
                "lastModified": {
                  "type": "string",
                  "format": "date-time",
                  "description": "파일 최종 수정일 (realtime만)"
                },
                "period": {
                  "type": "string",
                  "description": "적용된 기간 필터"
                },
                "bounds": {
                  "type": "object",
                  "description": "적용된 지리적 범위",
                  "properties": {
                    "south": {"type": "number"},
                    "west": {"type": "number"},
                    "north": {"type": "number"},
                    "east": {"type": "number"}
                  }
                }
              }
            },
            "ErrorResponse": {
              "type": "object",
              "properties": {
                "error": {
                  "type": "string",
                  "description": "에러 메시지"
                },
                "fallbackError": {
                  "type": "string",
                  "description": "폴백 API 에러 메시지"
                }
              }
            }
          }
        },
        "tags": [
          {
            "name": "NOTAM",
            "description": "항공고시보 데이터 API"
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
        defaultModelExpandDepth: 1
      });
    };
  </script>
</body>
</html>`;

  res.status(200).send(html);
}
