"""
UBIKAIS API Server - 크롤링된 항공 데이터를 REST API로 제공
Flask 기반 API 서버 (AWS EC2/Lambda에서 운영)
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import json
import os
from datetime import datetime
from functools import wraps

app = Flask(__name__)
CORS(app)  # CORS 허용

# 설정
DB_PATH = os.environ.get('UBIKAIS_DB_PATH', 'ubikais_full.db')
JSON_PATH = os.environ.get('UBIKAIS_JSON_PATH', '.')


def get_db_connection():
    """DB 연결"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def dict_from_row(row):
    """SQLite Row를 딕셔너리로 변환"""
    return dict(zip(row.keys(), row))


def api_response(data, status='success', message=None):
    """표준 API 응답 형식"""
    response = {
        'status': status,
        'timestamp': datetime.now().isoformat(),
        'data': data
    }
    if message:
        response['message'] = message
    return jsonify(response)


# ============ 비행계획 API ============

@app.route('/api/flights', methods=['GET'])
def get_all_flights():
    """전체 비행계획 조회"""
    try:
        plan_type = request.args.get('type', None)  # departure, arrival, VFR
        origin = request.args.get('origin', None)
        destination = request.args.get('destination', None)
        limit = request.args.get('limit', 100, type=int)

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM flight_plans WHERE 1=1"
        params = []

        if plan_type:
            query += " AND plan_type = ?"
            params.append(plan_type)
        if origin:
            query += " AND origin LIKE ?"
            params.append(f"%{origin}%")
        if destination:
            query += " AND destination LIKE ?"
            params.append(f"%{destination}%")

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        flights = [dict_from_row(row) for row in rows]
        return api_response({
            'count': len(flights),
            'flights': flights
        })

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


@app.route('/api/flights/departures', methods=['GET'])
def get_departures():
    """출발 비행계획"""
    try:
        airport = request.args.get('airport', None)
        limit = request.args.get('limit', 100, type=int)

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM flight_plans WHERE plan_type = 'departure'"
        params = []

        if airport:
            query += " AND origin LIKE ?"
            params.append(f"%{airport}%")

        query += " ORDER BY std DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        flights = [dict_from_row(row) for row in rows]
        return api_response({
            'count': len(flights),
            'departures': flights
        })

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


@app.route('/api/flights/arrivals', methods=['GET'])
def get_arrivals():
    """도착 비행계획"""
    try:
        airport = request.args.get('airport', None)
        limit = request.args.get('limit', 100, type=int)

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM flight_plans WHERE plan_type = 'arrival'"
        params = []

        if airport:
            query += " AND destination LIKE ?"
            params.append(f"%{airport}%")

        query += " ORDER BY sta DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        flights = [dict_from_row(row) for row in rows]
        return api_response({
            'count': len(flights),
            'arrivals': flights
        })

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


@app.route('/api/flights/search', methods=['GET'])
def search_flight():
    """편명으로 비행 검색"""
    try:
        flight_number = request.args.get('flight', request.args.get('callsign', None))

        if not flight_number:
            return api_response(None, 'error', 'flight parameter required'), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # 편명으로 검색 (대소문자 무시)
        cursor.execute('''
            SELECT * FROM flight_plans
            WHERE UPPER(flight_number) LIKE ?
            ORDER BY created_at DESC
            LIMIT 10
        ''', (f"%{flight_number.upper()}%",))

        rows = cursor.fetchall()
        conn.close()

        if not rows:
            return api_response({
                'found': False,
                'flight': None
            })

        flights = [dict_from_row(row) for row in rows]
        return api_response({
            'found': True,
            'count': len(flights),
            'flights': flights
        })

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


@app.route('/api/flights/route', methods=['GET'])
def get_flight_route():
    """편명의 출발/도착 정보 (RKPU Viewer용)"""
    try:
        callsign = request.args.get('callsign', None)
        hex_code = request.args.get('hex', None)
        reg = request.args.get('reg', None)

        if not callsign and not hex_code and not reg:
            return api_response(None, 'error', 'callsign, hex, or reg required'), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        flight = None

        # 1. callsign으로 검색
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

        # 2. registration으로 검색
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
            return api_response({
                'source': 'ubikais',
                'callsign': flight.get('flight_number'),
                'origin': {'icao': flight.get('origin')},
                'destination': {'icao': flight.get('destination')},
                'aircraft': {
                    'type': flight.get('aircraft_type'),
                    'registration': flight.get('registration')
                },
                'schedule': {
                    'std': flight.get('std'),
                    'etd': flight.get('etd'),
                    'atd': flight.get('atd'),
                    'sta': flight.get('sta'),
                    'eta': flight.get('eta')
                },
                'status': flight.get('status')
            })
        else:
            return api_response({
                'source': None,
                'origin': None,
                'destination': None
            })

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


# ============ 기상 API ============

@app.route('/api/weather', methods=['GET'])
def get_weather():
    """기상정보 조회"""
    try:
        weather_type = request.args.get('type', 'metar')
        airport = request.args.get('airport', None)
        limit = request.args.get('limit', 50, type=int)

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM weather WHERE weather_type = ?"
        params = [weather_type]

        if airport:
            query += " AND airport LIKE ?"
            params.append(f"%{airport}%")

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        weather_data = [dict_from_row(row) for row in rows]
        return api_response({
            'type': weather_type,
            'count': len(weather_data),
            'weather': weather_data
        })

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


@app.route('/api/weather/metar/<airport>', methods=['GET'])
def get_metar(airport):
    """특정 공항 METAR"""
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
            return api_response(dict_from_row(row))
        else:
            return api_response(None, 'error', f'METAR not found for {airport}'), 404

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


@app.route('/api/weather/taf/<airport>', methods=['GET'])
def get_taf(airport):
    """특정 공항 TAF"""
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
            return api_response(dict_from_row(row))
        else:
            return api_response(None, 'error', f'TAF not found for {airport}'), 404

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


# ============ NOTAM API ============

@app.route('/api/notam', methods=['GET'])
def get_notam():
    """NOTAM 조회"""
    try:
        notam_type = request.args.get('type', None)
        location = request.args.get('location', None)
        limit = request.args.get('limit', 100, type=int)

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM notams WHERE 1=1"
        params = []

        if notam_type:
            query += " AND notam_type = ?"
            params.append(notam_type)
        if location:
            query += " AND location LIKE ?"
            params.append(f"%{location}%")

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        notams = [dict_from_row(row) for row in rows]
        return api_response({
            'count': len(notams),
            'notams': notams
        })

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


@app.route('/api/notam/<location>', methods=['GET'])
def get_notam_by_location(location):
    """특정 위치 NOTAM"""
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
        return api_response({
            'location': location,
            'count': len(notams),
            'notams': notams
        })

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


# ============ ATFM API ============

@app.route('/api/atfm', methods=['GET'])
def get_atfm():
    """ATFM 메시지"""
    try:
        airport = request.args.get('airport', None)
        limit = request.args.get('limit', 50, type=int)

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM atfm_messages WHERE 1=1"
        params = []

        if airport:
            query += " AND airport LIKE ?"
            params.append(f"%{airport}%")

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        messages = [dict_from_row(row) for row in rows]
        return api_response({
            'count': len(messages),
            'messages': messages
        })

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


# ============ 공항 정보 API ============

@app.route('/api/airports', methods=['GET'])
def get_airports():
    """공항 목록"""
    airports = {
        'RKSI': {'icao': 'RKSI', 'iata': 'ICN', 'name': 'Incheon International', 'name_ko': '인천국제공항'},
        'RKSS': {'icao': 'RKSS', 'iata': 'GMP', 'name': 'Gimpo International', 'name_ko': '김포국제공항'},
        'RKPK': {'icao': 'RKPK', 'iata': 'PUS', 'name': 'Gimhae International', 'name_ko': '김해국제공항'},
        'RKPC': {'icao': 'RKPC', 'iata': 'CJU', 'name': 'Jeju International', 'name_ko': '제주국제공항'},
        'RKTU': {'icao': 'RKTU', 'iata': 'CJJ', 'name': 'Cheongju International', 'name_ko': '청주국제공항'},
        'RKTN': {'icao': 'RKTN', 'iata': 'TAE', 'name': 'Daegu International', 'name_ko': '대구국제공항'},
        'RKJJ': {'icao': 'RKJJ', 'iata': 'KWJ', 'name': 'Gwangju', 'name_ko': '광주공항'},
        'RKJY': {'icao': 'RKJY', 'iata': 'RSU', 'name': 'Yeosu', 'name_ko': '여수공항'},
        'RKPU': {'icao': 'RKPU', 'iata': 'USN', 'name': 'Ulsan', 'name_ko': '울산공항'},
        'RKTH': {'icao': 'RKTH', 'iata': 'KPO', 'name': 'Pohang', 'name_ko': '포항공항'},
        'RKPS': {'icao': 'RKPS', 'iata': 'HIN', 'name': 'Sacheon', 'name_ko': '사천공항'},
        'RKJB': {'icao': 'RKJB', 'iata': 'MWX', 'name': 'Muan International', 'name_ko': '무안국제공항'},
        'RKNY': {'icao': 'RKNY', 'iata': 'YNY', 'name': 'Yangyang International', 'name_ko': '양양국제공항'},
        'RKNW': {'icao': 'RKNW', 'iata': 'WJU', 'name': 'Wonju', 'name_ko': '원주공항'},
        'RKJK': {'icao': 'RKJK', 'iata': 'KUV', 'name': 'Gunsan', 'name_ko': '군산공항'}
    }

    return api_response({
        'count': len(airports),
        'airports': list(airports.values())
    })


@app.route('/api/airports/<icao>', methods=['GET'])
def get_airport_info(icao):
    """특정 공항 정보"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM airport_info
            WHERE icao_code = ?
        ''', (icao.upper(),))

        row = cursor.fetchone()
        conn.close()

        if row:
            return api_response(dict_from_row(row))
        else:
            # 기본 정보 반환
            airports = {
                'RKPU': {'icao': 'RKPU', 'iata': 'USN', 'name': 'Ulsan Airport', 'name_ko': '울산공항'}
            }
            if icao.upper() in airports:
                return api_response(airports[icao.upper()])
            return api_response(None, 'error', f'Airport {icao} not found'), 404

    except Exception as e:
        return api_response(None, 'error', str(e)), 500


# ============ 상태 API ============

@app.route('/api/status', methods=['GET'])
def get_status():
    """API 상태"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 최신 크롤링 시간
        cursor.execute('SELECT MAX(crawl_timestamp) as last_crawl FROM crawl_logs')
        last_crawl = cursor.fetchone()

        # 각 테이블 레코드 수
        tables = ['flight_plans', 'weather', 'notams', 'atfm_messages']
        counts = {}
        for table in tables:
            try:
                cursor.execute(f'SELECT COUNT(*) as count FROM {table}')
                counts[table] = cursor.fetchone()['count']
            except:
                counts[table] = 0

        conn.close()

        return api_response({
            'status': 'online',
            'last_crawl': last_crawl['last_crawl'] if last_crawl else None,
            'records': counts
        })

    except Exception as e:
        return api_response({
            'status': 'error',
            'message': str(e)
        })


@app.route('/', methods=['GET'])
def index():
    """API 문서"""
    return jsonify({
        'name': 'UBIKAIS API',
        'version': '1.0.0',
        'description': 'Korean Aviation Data API (UBIKAIS Crawler)',
        'endpoints': {
            'flights': {
                'GET /api/flights': 'Get all flight plans',
                'GET /api/flights/departures': 'Get departures',
                'GET /api/flights/arrivals': 'Get arrivals',
                'GET /api/flights/search?flight=KAL123': 'Search flight by callsign',
                'GET /api/flights/route?callsign=KAL123': 'Get origin/destination for RKPU Viewer'
            },
            'weather': {
                'GET /api/weather?type=metar': 'Get weather data',
                'GET /api/weather/metar/RKPU': 'Get METAR for airport',
                'GET /api/weather/taf/RKPU': 'Get TAF for airport'
            },
            'notam': {
                'GET /api/notam': 'Get all NOTAMs',
                'GET /api/notam/RKPU': 'Get NOTAMs for location'
            },
            'atfm': {
                'GET /api/atfm': 'Get ATFM messages'
            },
            'airports': {
                'GET /api/airports': 'List all Korean airports',
                'GET /api/airports/RKPU': 'Get airport info'
            },
            'status': {
                'GET /api/status': 'API status and last crawl time'
            }
        }
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'

    print(f"""
    ╔═══════════════════════════════════════════════╗
    ║         UBIKAIS API Server v1.0.0             ║
    ║   Korean Aviation Data API (UBIKAIS)          ║
    ╚═══════════════════════════════════════════════╝

    Server running on http://0.0.0.0:{port}

    Available endpoints:
    - GET /api/flights          - Flight plans
    - GET /api/flights/route    - Flight route (for RKPU Viewer)
    - GET /api/weather          - Weather data
    - GET /api/notam            - NOTAMs
    - GET /api/airports         - Airport info
    - GET /api/status           - API status
    """)

    app.run(host='0.0.0.0', port=port, debug=debug)
