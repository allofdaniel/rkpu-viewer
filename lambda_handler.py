"""
AWS Lambda Handler for UBIKAIS API
Lambda + API Gateway로 서버리스 배포
"""

import json
import sqlite3
import os
from datetime import datetime

# S3에서 DB 다운로드 (Lambda 실행 시)
DB_PATH = '/tmp/ubikais_full.db'
S3_BUCKET = os.environ.get('S3_BUCKET', 'ubikais-data')
S3_KEY = os.environ.get('S3_DB_KEY', 'ubikais_full.db')


def get_db_connection():
    """DB 연결"""
    # Lambda에서는 S3에서 DB를 /tmp로 다운로드해야 함
    if not os.path.exists(DB_PATH):
        try:
            import boto3
            s3 = boto3.client('s3')
            s3.download_file(S3_BUCKET, S3_KEY, DB_PATH)
        except Exception as e:
            print(f"S3 download error: {e}")
            # 로컬 테스트용
            return sqlite3.connect('ubikais_full.db')

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def dict_from_row(row):
    """Row를 dict로 변환"""
    return dict(zip(row.keys(), row))


def create_response(status_code, body):
    """Lambda 응답 생성"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        'body': json.dumps(body, ensure_ascii=False, default=str)
    }


def handler(event, context):
    """Lambda 메인 핸들러"""
    try:
        # HTTP 메서드 및 경로 추출
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '/')
        query_params = event.get('queryStringParameters') or {}

        # OPTIONS (CORS preflight)
        if http_method == 'OPTIONS':
            return create_response(200, {'status': 'ok'})

        # 라우팅
        if path == '/' or path == '/api':
            return handle_index()
        elif path == '/api/status':
            return handle_status()
        elif path == '/api/flights':
            return handle_flights(query_params)
        elif path == '/api/flights/departures':
            return handle_departures(query_params)
        elif path == '/api/flights/arrivals':
            return handle_arrivals(query_params)
        elif path == '/api/flights/search':
            return handle_flight_search(query_params)
        elif path == '/api/flights/route':
            return handle_flight_route(query_params)
        elif path == '/api/weather':
            return handle_weather(query_params)
        elif path.startswith('/api/weather/metar/'):
            airport = path.split('/')[-1]
            return handle_metar(airport)
        elif path.startswith('/api/weather/taf/'):
            airport = path.split('/')[-1]
            return handle_taf(airport)
        elif path == '/api/notam':
            return handle_notam(query_params)
        elif path.startswith('/api/notam/'):
            location = path.split('/')[-1]
            return handle_notam_by_location(location)
        elif path == '/api/airports':
            return handle_airports()
        elif path.startswith('/api/airports/'):
            icao = path.split('/')[-1]
            return handle_airport_info(icao)
        else:
            return create_response(404, {'status': 'error', 'message': 'Not found'})

    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_index():
    """API 문서"""
    return create_response(200, {
        'name': 'UBIKAIS API',
        'version': '1.0.0',
        'description': 'Korean Aviation Data API',
        'endpoints': [
            'GET /api/flights',
            'GET /api/flights/departures',
            'GET /api/flights/arrivals',
            'GET /api/flights/search?flight=KAL123',
            'GET /api/flights/route?callsign=KAL123',
            'GET /api/weather?type=metar',
            'GET /api/weather/metar/{airport}',
            'GET /api/notam',
            'GET /api/notam/{location}',
            'GET /api/airports',
            'GET /api/status'
        ]
    })


def handle_status():
    """API 상태"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT MAX(crawl_timestamp) as last_crawl FROM crawl_logs')
        last_crawl = cursor.fetchone()

        tables = ['flight_plans', 'weather', 'notams']
        counts = {}
        for table in tables:
            try:
                cursor.execute(f'SELECT COUNT(*) as count FROM {table}')
                counts[table] = cursor.fetchone()['count']
            except:
                counts[table] = 0

        conn.close()

        return create_response(200, {
            'status': 'success',
            'data': {
                'status': 'online',
                'last_crawl': last_crawl['last_crawl'] if last_crawl else None,
                'records': counts
            }
        })
    except Exception as e:
        return create_response(200, {
            'status': 'success',
            'data': {'status': 'online', 'message': str(e)}
        })


def handle_flights(params):
    """전체 비행계획"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        plan_type = params.get('type')
        limit = int(params.get('limit', 100))

        query = "SELECT * FROM flight_plans WHERE 1=1"
        query_params = []

        if plan_type:
            query += " AND plan_type = ?"
            query_params.append(plan_type)

        query += " ORDER BY created_at DESC LIMIT ?"
        query_params.append(limit)

        cursor.execute(query, query_params)
        rows = cursor.fetchall()
        conn.close()

        flights = [dict_from_row(row) for row in rows]
        return create_response(200, {
            'status': 'success',
            'data': {'count': len(flights), 'flights': flights}
        })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_departures(params):
    """출발 비행계획"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        airport = params.get('airport')
        limit = int(params.get('limit', 100))

        query = "SELECT * FROM flight_plans WHERE plan_type = 'departure'"
        query_params = []

        if airport:
            query += " AND origin LIKE ?"
            query_params.append(f"%{airport}%")

        query += " ORDER BY std DESC LIMIT ?"
        query_params.append(limit)

        cursor.execute(query, query_params)
        rows = cursor.fetchall()
        conn.close()

        flights = [dict_from_row(row) for row in rows]
        return create_response(200, {
            'status': 'success',
            'data': {'count': len(flights), 'departures': flights}
        })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_arrivals(params):
    """도착 비행계획"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        airport = params.get('airport')
        limit = int(params.get('limit', 100))

        query = "SELECT * FROM flight_plans WHERE plan_type = 'arrival'"
        query_params = []

        if airport:
            query += " AND destination LIKE ?"
            query_params.append(f"%{airport}%")

        query += " ORDER BY sta DESC LIMIT ?"
        query_params.append(limit)

        cursor.execute(query, query_params)
        rows = cursor.fetchall()
        conn.close()

        flights = [dict_from_row(row) for row in rows]
        return create_response(200, {
            'status': 'success',
            'data': {'count': len(flights), 'arrivals': flights}
        })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_flight_search(params):
    """편명 검색"""
    flight_number = params.get('flight', params.get('callsign'))

    if not flight_number:
        return create_response(400, {'status': 'error', 'message': 'flight parameter required'})

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM flight_plans
            WHERE UPPER(flight_number) LIKE ?
            ORDER BY created_at DESC
            LIMIT 10
        ''', (f"%{flight_number.upper()}%",))

        rows = cursor.fetchall()
        conn.close()

        flights = [dict_from_row(row) for row in rows]
        return create_response(200, {
            'status': 'success',
            'data': {
                'found': len(flights) > 0,
                'count': len(flights),
                'flights': flights
            }
        })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_flight_route(params):
    """비행 경로 (RKPU Viewer용)"""
    callsign = params.get('callsign')
    reg = params.get('reg')

    if not callsign and not reg:
        return create_response(400, {'status': 'error', 'message': 'callsign or reg required'})

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        flight = None

        if callsign:
            cursor.execute('''
                SELECT * FROM flight_plans
                WHERE UPPER(flight_number) LIKE ?
                ORDER BY created_at DESC
                LIMIT 1
            ''', (f"%{callsign.upper()}%",))
            row = cursor.fetchone()
            if row:
                flight = dict_from_row(row)

        if not flight and reg:
            cursor.execute('''
                SELECT * FROM flight_plans
                WHERE UPPER(registration) = ?
                ORDER BY created_at DESC
                LIMIT 1
            ''', (reg.upper(),))
            row = cursor.fetchone()
            if row:
                flight = dict_from_row(row)

        conn.close()

        if flight:
            return create_response(200, {
                'source': 'ubikais',
                'callsign': flight.get('flight_number'),
                'origin': {'icao': flight.get('origin')},
                'destination': {'icao': flight.get('destination')},
                'aircraft': {
                    'type': flight.get('aircraft_type'),
                    'registration': flight.get('registration')
                },
                'status': flight.get('status')
            })
        else:
            return create_response(200, {
                'source': None,
                'origin': None,
                'destination': None
            })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_weather(params):
    """기상정보"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        weather_type = params.get('type', 'metar')
        airport = params.get('airport')
        limit = int(params.get('limit', 50))

        query = "SELECT * FROM weather WHERE weather_type = ?"
        query_params = [weather_type]

        if airport:
            query += " AND airport LIKE ?"
            query_params.append(f"%{airport}%")

        query += " ORDER BY created_at DESC LIMIT ?"
        query_params.append(limit)

        cursor.execute(query, query_params)
        rows = cursor.fetchall()
        conn.close()

        weather_data = [dict_from_row(row) for row in rows]
        return create_response(200, {
            'status': 'success',
            'data': {
                'type': weather_type,
                'count': len(weather_data),
                'weather': weather_data
            }
        })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_metar(airport):
    """METAR"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM weather
            WHERE weather_type = 'metar' AND airport LIKE ?
            ORDER BY created_at DESC
            LIMIT 1
        ''', (f"%{airport.upper()}%",))

        row = cursor.fetchone()
        conn.close()

        if row:
            return create_response(200, {
                'status': 'success',
                'data': dict_from_row(row)
            })
        else:
            return create_response(404, {
                'status': 'error',
                'message': f'METAR not found for {airport}'
            })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_taf(airport):
    """TAF"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM weather
            WHERE weather_type = 'taf' AND airport LIKE ?
            ORDER BY created_at DESC
            LIMIT 1
        ''', (f"%{airport.upper()}%",))

        row = cursor.fetchone()
        conn.close()

        if row:
            return create_response(200, {
                'status': 'success',
                'data': dict_from_row(row)
            })
        else:
            return create_response(404, {
                'status': 'error',
                'message': f'TAF not found for {airport}'
            })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_notam(params):
    """NOTAM"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        notam_type = params.get('type')
        location = params.get('location')
        limit = int(params.get('limit', 100))

        query = "SELECT * FROM notams WHERE 1=1"
        query_params = []

        if notam_type:
            query += " AND notam_type = ?"
            query_params.append(notam_type)
        if location:
            query += " AND location LIKE ?"
            query_params.append(f"%{location}%")

        query += " ORDER BY created_at DESC LIMIT ?"
        query_params.append(limit)

        cursor.execute(query, query_params)
        rows = cursor.fetchall()
        conn.close()

        notams = [dict_from_row(row) for row in rows]
        return create_response(200, {
            'status': 'success',
            'data': {'count': len(notams), 'notams': notams}
        })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_notam_by_location(location):
    """위치별 NOTAM"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM notams
            WHERE location LIKE ?
            ORDER BY created_at DESC
            LIMIT 50
        ''', (f"%{location.upper()}%",))

        rows = cursor.fetchall()
        conn.close()

        notams = [dict_from_row(row) for row in rows]
        return create_response(200, {
            'status': 'success',
            'data': {
                'location': location,
                'count': len(notams),
                'notams': notams
            }
        })
    except Exception as e:
        return create_response(500, {'status': 'error', 'message': str(e)})


def handle_airports():
    """공항 목록"""
    airports = [
        {'icao': 'RKSI', 'iata': 'ICN', 'name': 'Incheon International', 'name_ko': '인천국제공항'},
        {'icao': 'RKSS', 'iata': 'GMP', 'name': 'Gimpo International', 'name_ko': '김포국제공항'},
        {'icao': 'RKPK', 'iata': 'PUS', 'name': 'Gimhae International', 'name_ko': '김해국제공항'},
        {'icao': 'RKPC', 'iata': 'CJU', 'name': 'Jeju International', 'name_ko': '제주국제공항'},
        {'icao': 'RKTU', 'iata': 'CJJ', 'name': 'Cheongju International', 'name_ko': '청주국제공항'},
        {'icao': 'RKTN', 'iata': 'TAE', 'name': 'Daegu International', 'name_ko': '대구국제공항'},
        {'icao': 'RKJJ', 'iata': 'KWJ', 'name': 'Gwangju', 'name_ko': '광주공항'},
        {'icao': 'RKJY', 'iata': 'RSU', 'name': 'Yeosu', 'name_ko': '여수공항'},
        {'icao': 'RKPU', 'iata': 'USN', 'name': 'Ulsan', 'name_ko': '울산공항'},
        {'icao': 'RKTH', 'iata': 'KPO', 'name': 'Pohang', 'name_ko': '포항공항'},
        {'icao': 'RKPS', 'iata': 'HIN', 'name': 'Sacheon', 'name_ko': '사천공항'},
        {'icao': 'RKJB', 'iata': 'MWX', 'name': 'Muan International', 'name_ko': '무안국제공항'},
        {'icao': 'RKNY', 'iata': 'YNY', 'name': 'Yangyang International', 'name_ko': '양양국제공항'},
        {'icao': 'RKNW', 'iata': 'WJU', 'name': 'Wonju', 'name_ko': '원주공항'},
        {'icao': 'RKJK', 'iata': 'KUV', 'name': 'Gunsan', 'name_ko': '군산공항'}
    ]

    return create_response(200, {
        'status': 'success',
        'data': {'count': len(airports), 'airports': airports}
    })


def handle_airport_info(icao):
    """공항 정보"""
    airports = {
        'RKPU': {'icao': 'RKPU', 'iata': 'USN', 'name': 'Ulsan Airport', 'name_ko': '울산공항',
                 'lat': 35.5936, 'lon': 129.3519, 'elevation': 45}
    }

    icao = icao.upper()
    if icao in airports:
        return create_response(200, {
            'status': 'success',
            'data': airports[icao]
        })
    else:
        return create_response(404, {
            'status': 'error',
            'message': f'Airport {icao} not found'
        })


# 로컬 테스트용
if __name__ == '__main__':
    # 테스트 이벤트
    test_events = [
        {'httpMethod': 'GET', 'path': '/'},
        {'httpMethod': 'GET', 'path': '/api/status'},
        {'httpMethod': 'GET', 'path': '/api/airports'},
        {'httpMethod': 'GET', 'path': '/api/flights/route', 'queryStringParameters': {'callsign': 'KAL123'}}
    ]

    for event in test_events:
        print(f"\nTesting: {event['path']}")
        response = handler(event, None)
        print(f"Status: {response['statusCode']}")
        print(f"Body: {response['body'][:200]}...")
