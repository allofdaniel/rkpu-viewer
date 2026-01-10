"""
eAIP Korea 종합 크롤러
모든 항공 데이터를 수집하여 SQLite DB에 저장

수집 대상:
- GEN: 일반 정보, 규정, 약어
- ENR: 항로, 웨이포인트, NAVAID, 공역, 장애물
- AD: 공항 정보 (25개 공항 전체)

AIRAC 주기: 28일
"""

import requests
from bs4 import BeautifulSoup
import re
import json
import sqlite3
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import logging
import time

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 기본 설정
BASE_URL = "https://aim.koca.go.kr/eaipPub/Package"
HISTORY_URL = f"{BASE_URL}/history-en-GB.html?language=en_US"
REQUEST_DELAY = 0.5  # 요청 간 딜레이 (초)

# 한국 공항 목록 (ICAO 코드)
KOREAN_AIRPORTS = [
    'RKSI', 'RKSS', 'RKPC', 'RKPK', 'RKTU', 'RKNY', 'RKTN', 'RKJB',
    'RKJJ', 'RKJK', 'RKJY', 'RKNW', 'RKPS', 'RKPU', 'RKSM', 'RKTH',
    'RKTL', 'RKPD', 'RKTI', 'RKTE', 'RKSG', 'RKSO', 'RKJM', 'RKJU', 'RKSW'
]

class EAIPDatabase:
    """SQLite 데이터베이스 관리"""

    def __init__(self, db_path: str = "eaip_korea.db"):
        self.db_path = db_path
        self.conn = None
        self.init_database()

    def init_database(self):
        """데이터베이스 초기화 및 테이블 생성"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row

        cursor = self.conn.cursor()

        # AIRAC 정보 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS airac_cycles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                effective_date TEXT UNIQUE NOT NULL,
                publication_date TEXT,
                crawled_at TEXT,
                is_current INTEGER DEFAULT 0
            )
        ''')

        # 공항 정보 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS airports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                airac_date TEXT NOT NULL,
                icao_code TEXT NOT NULL,
                name_en TEXT,
                name_ko TEXT,
                lat REAL,
                lon REAL,
                elevation_ft REAL,
                magnetic_variation TEXT,
                city TEXT,
                operator TEXT,
                hours_of_operation TEXT,
                fuel_types TEXT,
                timezone TEXT,
                raw_data TEXT,
                updated_at TEXT,
                UNIQUE(airac_date, icao_code)
            )
        ''')

        # 활주로 정보 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS runways (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                airac_date TEXT NOT NULL,
                airport_icao TEXT NOT NULL,
                runway_id TEXT NOT NULL,
                heading REAL,
                length_m REAL,
                width_m REAL,
                surface TEXT,
                threshold_lat REAL,
                threshold_lon REAL,
                threshold_elev_ft REAL,
                tora_m REAL,
                toda_m REAL,
                asda_m REAL,
                lda_m REAL,
                ils_freq TEXT,
                ils_cat TEXT,
                raw_data TEXT,
                UNIQUE(airac_date, airport_icao, runway_id)
            )
        ''')

        # 항로 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS routes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                airac_date TEXT NOT NULL,
                name TEXT NOT NULL,
                route_type TEXT,  -- ATS, RNAV, OTHER
                upper_limit TEXT,
                lower_limit TEXT,
                direction TEXT,  -- BOTH, ONE-WAY
                raw_data TEXT,
                UNIQUE(airac_date, name)
            )
        ''')

        # 항로 웨이포인트 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS route_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                airac_date TEXT NOT NULL,
                route_name TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                point_name TEXT NOT NULL,
                point_type TEXT,  -- waypoint, navaid
                lat REAL,
                lon REAL,
                mea_ft INTEGER,
                upper_limit TEXT,
                lower_limit TEXT,
                UNIQUE(airac_date, route_name, sequence)
            )
        ''')

        # 웨이포인트 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS waypoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                airac_date TEXT NOT NULL,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                region TEXT,
                usage TEXT,  -- en-route, terminal, both
                raw_data TEXT,
                UNIQUE(airac_date, name)
            )
        ''')

        # NAVAID 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS navaids (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                airac_date TEXT NOT NULL,
                ident TEXT NOT NULL,
                name TEXT,
                navaid_type TEXT,  -- VOR, DME, VORTAC, TACAN, NDB
                lat REAL,
                lon REAL,
                freq_mhz TEXT,
                channel TEXT,
                elevation_ft REAL,
                range_nm REAL,
                magnetic_variation TEXT,
                raw_data TEXT,
                UNIQUE(airac_date, ident)
            )
        ''')

        # 공역 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS airspaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                airac_date TEXT NOT NULL,
                name TEXT NOT NULL,
                airspace_type TEXT,  -- P, R, D, MOA, HTA, CATA, UA, ALERT, ADIZ
                category TEXT,
                upper_limit_ft INTEGER,
                lower_limit_ft INTEGER,
                active_time TEXT,
                controlling_authority TEXT,
                remarks TEXT,
                raw_data TEXT,
                UNIQUE(airac_date, name)
            )
        ''')

        # 공역 경계 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS airspace_boundaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                airac_date TEXT NOT NULL,
                airspace_name TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                UNIQUE(airac_date, airspace_name, sequence)
            )
        ''')

        # 장애물 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS obstacles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                airac_date TEXT NOT NULL,
                obstacle_type TEXT,  -- tower, antenna, building, terrain, etc.
                lat REAL,
                lon REAL,
                elevation_amsl_ft REAL,
                height_agl_ft REAL,
                lighting TEXT,
                marking TEXT,
                remarks TEXT,
                raw_data TEXT
            )
        ''')

        # 인덱스 생성
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_airports_icao ON airports(icao_code)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_routes_name ON routes(name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_waypoints_name ON waypoints(name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_navaids_ident ON navaids(ident)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_airspaces_type ON airspaces(airspace_type)')

        self.conn.commit()
        logger.info(f"Database initialized: {self.db_path}")

    def close(self):
        if self.conn:
            self.conn.close()


class EAIPCrawler:
    """eAIP 크롤러"""

    def __init__(self, db: EAIPDatabase):
        self.db = db
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self.current_airac = None

    def get_latest_airac(self) -> Optional[str]:
        """최신 AIRAC 날짜 가져오기"""
        try:
            response = self.session.get(HISTORY_URL, timeout=30)
            response.encoding = 'utf-8'
            soup = BeautifulSoup(response.text, 'html.parser')

            # 링크에서 AIRAC 날짜 추출
            airac_dates = []
            for link in soup.find_all('a', href=True):
                match = re.search(r'(\d{4}-\d{2}-\d{2})-AIRAC', link['href'])
                if match:
                    airac_dates.append(match.group(1))

            if airac_dates:
                # 가장 최신 날짜 반환
                airac_dates.sort(reverse=True)
                latest = airac_dates[0]
                logger.info(f"Latest AIRAC found: {latest}")
                return latest

            return None
        except Exception as e:
            logger.error(f"Error getting latest AIRAC: {e}")
            return None

    def get_all_airac_dates(self) -> List[str]:
        """모든 AIRAC 날짜 목록 가져오기"""
        try:
            response = self.session.get(HISTORY_URL, timeout=30)
            response.encoding = 'utf-8'
            soup = BeautifulSoup(response.text, 'html.parser')

            airac_dates = set()
            for link in soup.find_all('a', href=True):
                match = re.search(r'(\d{4}-\d{2}-\d{2})-AIRAC', link['href'])
                if match:
                    airac_dates.add(match.group(1))

            return sorted(list(airac_dates), reverse=True)
        except Exception as e:
            logger.error(f"Error getting AIRAC dates: {e}")
            return []

    def fetch_page(self, airac_date: str, page_name: str) -> Optional[BeautifulSoup]:
        """eAIP 페이지 가져오기"""
        url = f"{BASE_URL}/{airac_date}-AIRAC/html/eAIP/{page_name}"

        try:
            time.sleep(REQUEST_DELAY)
            response = self.session.get(url, timeout=60)
            response.encoding = 'utf-8'

            if response.status_code == 200:
                return BeautifulSoup(response.text, 'html.parser')
            else:
                logger.warning(f"Failed to fetch {url}: {response.status_code}")
                return None
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None

    def parse_dms_to_decimal(self, coord_str: str) -> Optional[float]:
        """DMS 좌표를 십진수로 변환"""
        if not coord_str:
            return None

        coord_str = coord_str.strip().upper()

        # 위도 (DDMMSS[.s]N/S)
        lat_match = re.match(r'^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)\s*([NS])$', coord_str)
        if lat_match:
            deg = int(lat_match.group(1))
            min_val = int(lat_match.group(2))
            sec = float(lat_match.group(3))
            direction = lat_match.group(4)
            decimal = deg + min_val/60 + sec/3600
            return round(-decimal if direction == 'S' else decimal, 6)

        # 경도 (DDDMMSS[.s]E/W)
        lon_match = re.match(r'^(\d{3})(\d{2})(\d{2}(?:\.\d+)?)\s*([EW])$', coord_str)
        if lon_match:
            deg = int(lon_match.group(1))
            min_val = int(lon_match.group(2))
            sec = float(lon_match.group(3))
            direction = lon_match.group(4)
            decimal = deg + min_val/60 + sec/3600
            return round(-decimal if direction == 'W' else decimal, 6)

        return None

    def parse_altitude(self, alt_str: str) -> Optional[int]:
        """고도 문자열 파싱"""
        if not alt_str:
            return None

        alt_str = alt_str.strip().upper()

        if alt_str in ('UNL', 'UNLIMITED'):
            return 99999  # 무제한

        if alt_str in ('GND', 'SFC', 'SURFACE'):
            return 0

        # FL (Flight Level)
        fl_match = re.search(r'FL\s*(\d+)', alt_str)
        if fl_match:
            return int(fl_match.group(1)) * 100

        # ft AMSL/AGL
        ft_match = re.search(r'([\d\s,]+)\s*ft', alt_str, re.IGNORECASE)
        if ft_match:
            return int(ft_match.group(1).replace(' ', '').replace(',', ''))

        return None

    def crawl_waypoints(self, airac_date: str):
        """ENR 4.4 - 웨이포인트 크롤링"""
        logger.info(f"Crawling waypoints for {airac_date}...")
        soup = self.fetch_page(airac_date, "KR-ENR-4.4-en-GB.html")

        if not soup:
            return

        cursor = self.db.conn.cursor()
        count = 0

        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) < 2:
                    continue

                first_cell = cells[0].get_text(strip=True)
                wp_match = re.match(r'^([A-Z]{5})$', first_cell)

                if wp_match:
                    wp_name = wp_match.group(1)
                    coord_cell = cells[1].get_text(strip=True) if len(cells) > 1 else ""
                    coord_match = re.search(r'(\d{6}[NS])\s*(\d{7}[EW])', coord_cell.replace(' ', ''))

                    if coord_match:
                        lat = self.parse_dms_to_decimal(coord_match.group(1))
                        lon = self.parse_dms_to_decimal(coord_match.group(2))

                        if lat and lon:
                            try:
                                cursor.execute('''
                                    INSERT OR REPLACE INTO waypoints
                                    (airac_date, name, lat, lon, usage)
                                    VALUES (?, ?, ?, ?, 'en-route')
                                ''', (airac_date, wp_name, lat, lon))
                                count += 1
                            except Exception as e:
                                logger.error(f"Error inserting waypoint {wp_name}: {e}")

        self.db.conn.commit()
        logger.info(f"Inserted {count} waypoints")

    def crawl_navaids(self, airac_date: str):
        """ENR 4.1 - NAVAID 크롤링"""
        logger.info(f"Crawling NAVAIDs for {airac_date}...")
        soup = self.fetch_page(airac_date, "KR-ENR-4.1-en-GB.html")

        if not soup:
            return

        cursor = self.db.conn.cursor()
        count = 0

        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                text = row.get_text(separator=' ', strip=True)

                # VORTAC, VOR/DME, TACAN, NDB 패턴
                navaid_match = re.search(
                    r'([A-Z][A-Z\s]+)\s+(VORTAC|VOR/DME|VOR|TACAN|NDB|DME)\s*\(([A-Z]{2,3})\)',
                    text
                )

                if navaid_match:
                    name = navaid_match.group(1).strip()
                    nav_type = navaid_match.group(2)
                    ident = navaid_match.group(3)

                    coord_match = re.search(r'(\d{6}[NS])\s*(\d{7}[EW])', text.replace(' ', ''))
                    freq_match = re.search(r'(\d{2,3}\.\d{1,2})\s*MHz', text)

                    if coord_match:
                        lat = self.parse_dms_to_decimal(coord_match.group(1))
                        lon = self.parse_dms_to_decimal(coord_match.group(2))

                        if lat and lon:
                            try:
                                cursor.execute('''
                                    INSERT OR REPLACE INTO navaids
                                    (airac_date, ident, name, navaid_type, lat, lon, freq_mhz)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                ''', (
                                    airac_date, ident, name, nav_type, lat, lon,
                                    freq_match.group(1) if freq_match else None
                                ))
                                count += 1
                            except Exception as e:
                                logger.error(f"Error inserting NAVAID {ident}: {e}")

        self.db.conn.commit()
        logger.info(f"Inserted {count} NAVAIDs")

    def crawl_routes(self, airac_date: str, route_type: str = "ATS"):
        """ENR 3.1/3.3 - 항로 크롤링"""
        page_name = "KR-ENR-3.1-en-GB.html" if route_type == "ATS" else "KR-ENR-3.3-en-GB.html"
        logger.info(f"Crawling {route_type} routes for {airac_date}...")

        soup = self.fetch_page(airac_date, page_name)
        if not soup:
            return

        cursor = self.db.conn.cursor()
        route_count = 0
        point_count = 0

        tables = soup.find_all('table')
        current_route = None
        current_points = []

        for table in tables:
            rows = table.find_all('tr')

            for row in rows:
                cells = row.find_all(['td', 'th'])
                if not cells:
                    continue

                row_text = row.get_text(separator=' ', strip=True)

                # 항로 이름 행
                route_match = re.match(r'^([ABGHJKLMNPRSTVWYZ]\d{1,4})\*?\s', row_text)
                if route_match:
                    # 이전 항로 저장
                    if current_route and current_points:
                        try:
                            cursor.execute('''
                                INSERT OR REPLACE INTO routes
                                (airac_date, name, route_type)
                                VALUES (?, ?, ?)
                            ''', (airac_date, current_route, route_type))
                            route_count += 1

                            for seq, point in enumerate(current_points):
                                cursor.execute('''
                                    INSERT OR REPLACE INTO route_points
                                    (airac_date, route_name, sequence, point_name, lat, lon, mea_ft)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                ''', (
                                    airac_date, current_route, seq,
                                    point['name'], point['lat'], point['lon'],
                                    point.get('mea_ft')
                                ))
                                point_count += 1
                        except Exception as e:
                            logger.error(f"Error inserting route {current_route}: {e}")

                    current_route = route_match.group(1)
                    current_points = []
                    continue

                # 웨이포인트 행 (삼각형 기호로 시작)
                if len(cells) >= 3 and current_route:
                    first_cell = cells[0].get_text(strip=True)

                    if first_cell in ['∆', '▲', '△', 'Δ']:
                        wp_name_cell = cells[1].get_text(strip=True) if len(cells) > 1 else ""
                        coord_cell = cells[2].get_text(strip=True) if len(cells) > 2 else ""

                        coord_match = re.search(r'(\d{6}[NS])\s*(\d{7}[EW])', coord_cell.replace(' ', ''))

                        if coord_match:
                            lat = self.parse_dms_to_decimal(coord_match.group(1))
                            lon = self.parse_dms_to_decimal(coord_match.group(2))

                            if lat and lon:
                                wp_name = wp_name_cell.split('(')[0].strip()
                                ident_match = re.search(r'\(([A-Z]{2,3})\)', wp_name_cell)
                                wp_ident = ident_match.group(1) if ident_match else wp_name.split()[0] if wp_name else ""

                                current_points.append({
                                    'name': wp_ident,
                                    'lat': lat,
                                    'lon': lon
                                })

        # 마지막 항로 저장
        if current_route and current_points:
            try:
                cursor.execute('''
                    INSERT OR REPLACE INTO routes
                    (airac_date, name, route_type)
                    VALUES (?, ?, ?)
                ''', (airac_date, current_route, route_type))
                route_count += 1

                for seq, point in enumerate(current_points):
                    cursor.execute('''
                        INSERT OR REPLACE INTO route_points
                        (airac_date, route_name, sequence, point_name, lat, lon, mea_ft)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        airac_date, current_route, seq,
                        point['name'], point['lat'], point['lon'],
                        point.get('mea_ft')
                    ))
                    point_count += 1
            except Exception as e:
                logger.error(f"Error inserting route {current_route}: {e}")

        self.db.conn.commit()
        logger.info(f"Inserted {route_count} routes with {point_count} points")

    def crawl_airspaces(self, airac_date: str, section: str):
        """ENR 5.x - 공역 크롤링"""
        section_map = {
            '5.1': ('KR-ENR-5.1-en-GB.html', 'PRD'),
            '5.2': ('KR-ENR-5.2-en-GB.html', 'MIL'),
            '5.3': ('KR-ENR-5.3-en-GB.html', 'CATA'),
            '5.5': ('KR-ENR-5.5-en-GB.html', 'UA'),
        }

        if section not in section_map:
            return

        page_name, category = section_map[section]
        logger.info(f"Crawling airspaces ({category}) for {airac_date}...")

        soup = self.fetch_page(airac_date, page_name)
        if not soup:
            return

        cursor = self.db.conn.cursor()
        count = 0

        # 공역 패턴
        airspace_patterns = [
            (r'RK\s*([PDR])\s*(\d+[A-Z]?)', 'PRD'),
            (r'\b(MOA)\s*(\d+[A-Z]?)\b', 'MOA'),
            (r'\b(HTA)\s*(\d+[A-Z]?)\b', 'HTA'),
            (r'\b(CATA)\s*(\d+[A-Z]?)\b', 'CATA'),
            (r'\b(UA)\s*(\d+[A-Z]?)\b', 'UA'),
            (r'\b(ALERT)\s*(\d+[A-Z]?)\b', 'ALERT'),
        ]

        tables = soup.find_all('table')

        for table in tables:
            rows = table.find_all('tr')

            for row in rows:
                text = row.get_text(separator=' ', strip=True)

                # 공역 이름 찾기
                airspace_name = None
                airspace_type = None

                for pattern, a_type in airspace_patterns:
                    match = re.search(pattern, text, re.IGNORECASE)
                    if match:
                        if a_type == 'PRD':
                            airspace_type = match.group(1).upper()
                            airspace_name = f"RK {airspace_type}{match.group(2)}"
                        else:
                            airspace_type = a_type
                            airspace_name = f"{match.group(1).upper()} {match.group(2)}"
                        break

                if not airspace_name:
                    continue

                # 좌표 추출
                coords = []
                coord_matches = re.findall(
                    r'(\d{6}(?:\.\d+)?)\s*([NS])\s*(\d{7}(?:\.\d+)?)\s*([EW])',
                    text
                )

                for lat_val, lat_dir, lon_val, lon_dir in coord_matches:
                    lat = self.parse_dms_to_decimal(lat_val + lat_dir)
                    lon = self.parse_dms_to_decimal(lon_val + lon_dir)
                    if lat and lon:
                        coords.append((lat, lon))

                # 고도 추출
                alt_match = re.search(
                    r'(UNL|FL\s*\d+|\d[\d\s,]*ft(?:\s*(?:AMSL|AGL))?)\s*/\s*(GND|SFC|FL\s*\d+|\d[\d\s,]*ft(?:\s*(?:AMSL|AGL))?)',
                    text, re.IGNORECASE
                )

                upper_limit = None
                lower_limit = None
                if alt_match:
                    upper_limit = self.parse_altitude(alt_match.group(1))
                    lower_limit = self.parse_altitude(alt_match.group(2))

                # 시간 정보
                time_match = re.search(r'(\d{4})-(\d{4})\s*UTC', text)
                active_time = f"{time_match.group(1)}-{time_match.group(2)} UTC" if time_match else None
                if re.search(r'\bH24\b', text):
                    active_time = 'H24'

                if coords:
                    try:
                        # 공역 정보 저장
                        cursor.execute('''
                            INSERT OR REPLACE INTO airspaces
                            (airac_date, name, airspace_type, category, upper_limit_ft, lower_limit_ft, active_time)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            airac_date, airspace_name, airspace_type, category,
                            upper_limit, lower_limit, active_time
                        ))

                        # 경계 좌표 저장
                        cursor.execute(
                            'DELETE FROM airspace_boundaries WHERE airac_date=? AND airspace_name=?',
                            (airac_date, airspace_name)
                        )
                        for seq, (lat, lon) in enumerate(coords):
                            cursor.execute('''
                                INSERT INTO airspace_boundaries
                                (airac_date, airspace_name, sequence, lat, lon)
                                VALUES (?, ?, ?, ?, ?)
                            ''', (airac_date, airspace_name, seq, lat, lon))

                        count += 1
                    except Exception as e:
                        logger.error(f"Error inserting airspace {airspace_name}: {e}")

        self.db.conn.commit()
        logger.info(f"Inserted {count} airspaces ({category})")

    def crawl_airport(self, airac_date: str, icao_code: str):
        """AD 2 - 공항 정보 크롤링"""
        logger.info(f"Crawling airport {icao_code} for {airac_date}...")

        # 공항 기본 정보 페이지
        page_name = f"KR-AD-2.{icao_code}-en-GB.html"
        soup = self.fetch_page(airac_date, page_name)

        if not soup:
            logger.warning(f"Airport {icao_code} page not found")
            return

        cursor = self.db.conn.cursor()

        try:
            text = soup.get_text(separator=' ', strip=True)

            # 공항 이름 추출
            name_match = re.search(rf'{icao_code}\s+([A-Z][A-Za-z\s]+?)(?:\s+\d|$)', text)
            name_en = name_match.group(1).strip() if name_match else icao_code

            # 좌표 추출
            coord_match = re.search(r'ARP.*?(\d{6}[NS])\s*(\d{7}[EW])', text.replace(' ', ''))
            lat = lon = None
            if coord_match:
                lat = self.parse_dms_to_decimal(coord_match.group(1))
                lon = self.parse_dms_to_decimal(coord_match.group(2))

            # 고도 추출
            elev_match = re.search(r'(\d+)\s*ft\s*(?:AMSL|MSL)', text)
            elevation = int(elev_match.group(1)) if elev_match else None

            # 자기 편차
            mag_var_match = re.search(r'MAG\s+VAR\s+(\d+(?:\.\d+)?)\s*°\s*([EW])', text)
            mag_var = f"{mag_var_match.group(1)}° {mag_var_match.group(2)}" if mag_var_match else None

            cursor.execute('''
                INSERT OR REPLACE INTO airports
                (airac_date, icao_code, name_en, lat, lon, elevation_ft, magnetic_variation, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                airac_date, icao_code, name_en, lat, lon,
                elevation, mag_var, datetime.now().isoformat()
            ))

            self.db.conn.commit()
            logger.info(f"Inserted airport {icao_code}")

        except Exception as e:
            logger.error(f"Error inserting airport {icao_code}: {e}")

    def crawl_all(self, airac_date: str = None):
        """전체 크롤링 실행"""
        if not airac_date:
            airac_date = self.get_latest_airac()

        if not airac_date:
            logger.error("No AIRAC date available")
            return

        self.current_airac = airac_date
        logger.info(f"Starting full crawl for AIRAC {airac_date}")

        # AIRAC 정보 저장
        cursor = self.db.conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO airac_cycles
            (effective_date, crawled_at, is_current)
            VALUES (?, ?, 1)
        ''', (airac_date, datetime.now().isoformat()))
        cursor.execute(
            'UPDATE airac_cycles SET is_current = 0 WHERE effective_date != ?',
            (airac_date,)
        )
        self.db.conn.commit()

        # 각 섹션 크롤링
        self.crawl_waypoints(airac_date)
        self.crawl_navaids(airac_date)
        self.crawl_routes(airac_date, "ATS")
        self.crawl_routes(airac_date, "RNAV")

        # 공역 크롤링
        for section in ['5.1', '5.2', '5.3', '5.5']:
            self.crawl_airspaces(airac_date, section)

        # 공항 크롤링
        for icao in KOREAN_AIRPORTS:
            self.crawl_airport(airac_date, icao)

        logger.info(f"Crawl completed for AIRAC {airac_date}")

    def export_to_json(self, output_path: str):
        """JSON으로 내보내기 (앱에서 사용)"""
        cursor = self.db.conn.cursor()

        # 현재 AIRAC 정보
        cursor.execute('SELECT effective_date FROM airac_cycles WHERE is_current = 1')
        row = cursor.fetchone()
        airac_date = row['effective_date'] if row else None

        if not airac_date:
            logger.error("No current AIRAC found")
            return

        data = {
            'metadata': {
                'source': 'eAIP Korea',
                'airac': airac_date,
                'extracted': datetime.now().isoformat(),
                'url': f"{BASE_URL}/{airac_date}-AIRAC/html/eAIP"
            },
            'waypoints': [],
            'navaids': [],
            'routes': [],
            'airspaces': [],
            'airports': []
        }

        # 웨이포인트
        cursor.execute('SELECT * FROM waypoints WHERE airac_date = ?', (airac_date,))
        for row in cursor.fetchall():
            data['waypoints'].append({
                'name': row['name'],
                'lat': row['lat'],
                'lon': row['lon'],
                'type': 'waypoint'
            })

        # NAVAID
        cursor.execute('SELECT * FROM navaids WHERE airac_date = ?', (airac_date,))
        for row in cursor.fetchall():
            data['navaids'].append({
                'ident': row['ident'],
                'name': row['name'],
                'type': row['navaid_type'],
                'lat': row['lat'],
                'lon': row['lon'],
                'freq': row['freq_mhz']
            })

        # 항로
        cursor.execute('SELECT * FROM routes WHERE airac_date = ?', (airac_date,))
        for route_row in cursor.fetchall():
            route_name = route_row['name']

            cursor.execute('''
                SELECT * FROM route_points
                WHERE airac_date = ? AND route_name = ?
                ORDER BY sequence
            ''', (airac_date, route_name))

            points = []
            for point_row in cursor.fetchall():
                points.append({
                    'name': point_row['point_name'],
                    'lat': point_row['lat'],
                    'lon': point_row['lon'],
                    'mea_ft': point_row['mea_ft']
                })

            data['routes'].append({
                'name': route_name,
                'type': route_row['route_type'],
                'points': points
            })

        # 공역
        cursor.execute('SELECT * FROM airspaces WHERE airac_date = ?', (airac_date,))
        for asp_row in cursor.fetchall():
            asp_name = asp_row['name']

            cursor.execute('''
                SELECT lat, lon FROM airspace_boundaries
                WHERE airac_date = ? AND airspace_name = ?
                ORDER BY sequence
            ''', (airac_date, asp_name))

            boundary = [[row['lon'], row['lat']] for row in cursor.fetchall()]

            data['airspaces'].append({
                'name': asp_name,
                'type': asp_row['airspace_type'],
                'category': asp_row['category'],
                'upper_limit_ft': asp_row['upper_limit_ft'],
                'lower_limit_ft': asp_row['lower_limit_ft'],
                'active_time': asp_row['active_time'],
                'boundary': boundary
            })

        # 공항
        cursor.execute('SELECT * FROM airports WHERE airac_date = ?', (airac_date,))
        for row in cursor.fetchall():
            data['airports'].append({
                'icao': row['icao_code'],
                'name': row['name_en'],
                'lat': row['lat'],
                'lon': row['lon'],
                'elevation_ft': row['elevation_ft'],
                'magnetic_variation': row['magnetic_variation']
            })

        # JSON 저장
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"Exported to {output_path}")
        logger.info(f"  Waypoints: {len(data['waypoints'])}")
        logger.info(f"  NAVAIDs: {len(data['navaids'])}")
        logger.info(f"  Routes: {len(data['routes'])}")
        logger.info(f"  Airspaces: {len(data['airspaces'])}")
        logger.info(f"  Airports: {len(data['airports'])}")


def main():
    """메인 실행 함수"""
    import argparse

    parser = argparse.ArgumentParser(description='eAIP Korea Crawler')
    parser.add_argument('--db', default='eaip_korea.db', help='Database file path')
    parser.add_argument('--airac', help='AIRAC date (YYYY-MM-DD), default: latest')
    parser.add_argument('--export', help='Export to JSON file')
    parser.add_argument('--check-update', action='store_true', help='Check for new AIRAC')

    args = parser.parse_args()

    # 데이터베이스 초기화
    db = EAIPDatabase(args.db)
    crawler = EAIPCrawler(db)

    if args.check_update:
        # 최신 AIRAC 확인
        latest = crawler.get_latest_airac()
        cursor = db.conn.cursor()
        cursor.execute('SELECT effective_date FROM airac_cycles WHERE is_current = 1')
        row = cursor.fetchone()
        current = row['effective_date'] if row else None

        if latest and latest != current:
            print(f"New AIRAC available: {latest} (current: {current})")
            print("Run without --check-update to crawl the new data")
        else:
            print(f"Already up to date: {current}")
    else:
        # 크롤링 실행
        crawler.crawl_all(args.airac)

        # JSON 내보내기
        if args.export:
            crawler.export_to_json(args.export)

    db.close()


if __name__ == "__main__":
    main()
