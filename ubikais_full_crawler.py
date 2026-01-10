"""
UBIKAIS Full Crawler - 한국 항공정보 통합 크롤러
작성일: 2025-12-29
목적: UBIKAIS의 모든 데이터(NOTAM, PIB, ATFM, WEATHER, FPL, AIRPORT, AERO-DATA)를 크롤링
AWS Lambda/EC2에서 운영하여 API로 제공
"""

import time
import json
import sqlite3
from datetime import datetime, timedelta
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import logging
import sys
import os

# Windows 한국어 환경 인코딩 설정
if sys.platform == 'win32':
    try:
        import codecs
        if hasattr(sys.stdout, 'detach'):
            sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
            sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())
        os.environ['PYTHONIOENCODING'] = 'utf-8'
    except:
        pass

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


class UBIKAISFullCrawler:
    """UBIKAIS 전체 데이터 크롤러"""

    def __init__(self, db_name='ubikais_full.db', headless=True):
        self.base_url = 'https://ubikais.fois.go.kr:8030'
        self.login_url = f'{self.base_url}/common/login?systemId=sysUbikais'

        # 로그인 정보 (환경변수 또는 기본값)
        self.username = os.environ.get('UBIKAIS_USERNAME', 'allofdanie')
        self.password = os.environ.get('UBIKAIS_PASSWORD', 'pr12pr34!!')

        self.db_name = db_name
        self.headless = headless
        self.driver = None

        # 한국 공항 코드
        self.airports = {
            'RKSI': '인천국제공항',
            'RKSS': '김포국제공항',
            'RKPK': '김해국제공항',
            'RKPC': '제주국제공항',
            'RKTU': '청주국제공항',
            'RKTN': '대구국제공항',
            'RKJJ': '광주공항',
            'RKJY': '여수공항',
            'RKPU': '울산공항',
            'RKTH': '포항공항',
            'RKPS': '사천공항',
            'RKJB': '무안국제공항',
            'RKNY': '양양국제공항',
            'RKNW': '원주공항',
            'RKJK': '군산공항'
        }

        # 메뉴 URL 구조
        self.urls = {
            # NOTAM
            'notam_fir': '/sysUbikais/biz/nps/notamRecFir',
            'notam_ad': '/sysUbikais/biz/nps/notamRecAd',
            'notam_snow': '/sysUbikais/biz/nps/notamRecSnow',
            'notam_prohibited': '/sysUbikais/biz/nps/notamRecOff',
            'notam_seq': '/sysUbikais/biz/nps/notamRecSeq',

            # PIB
            'pib_airport': '/sysUbikais/biz/pib/airportType/airporttype',
            'pib_country': '/sysUbikais/biz/pib/areaType/country',
            'pib_fir': '/sysUbikais/biz/pib/areaType/fir',
            'pib_flight': '/sysUbikais/biz/pib/routeType/flightm',

            # ATFM
            'atfm_adp': '/sysUbikais/biz/atfms/Adp',
            'atfm_message': '/sysUbikais/biz/atfms/dfl',
            'atfm_notice': '/sysUbikais/biz/atfms/noti',

            # WEATHER
            'weather_admet': '/sysUbikais/biz/wis/admet',
            'weather_metar': '/sysUbikais/biz/wis/metar',
            'weather_taf': '/sysUbikais/biz/wis/taf',
            'weather_sigmet': '/sysUbikais/biz/wis/sigmet',

            # i-ARO (FPL)
            'fpl_departure': '/sysUbikais/biz/fpl/dep',
            'fpl_arrival': '/sysUbikais/biz/fpl/arr',
            'fpl_vfr': '/sysUbikais/biz/fpl/vfrFpl',
            'fpl_ulp': '/sysUbikais/biz/fpl/ulpFpl',
            'fpl_photo': '/sysUbikais/biz/pf/photoFlight',

            # AIRPORT INFO (공항별)
            'airport_info': '/sysUbikais/biz/airport/airportinfo?airport=',

            # AERO-DATA
            'aero_airport': '/sysUbikais/biz/ais/airport/airport',
            'aero_runway': '/sysUbikais/biz/ais/runway/runway',
            'aero_apron': '/sysUbikais/biz/ais/apron/apron',
            'aero_navaid': '/sysUbikais/biz/ais/navaid/navaid',
            'aero_obst': '/sysUbikais/biz/ais/obst/obst',
            'aero_ats': '/sysUbikais/biz/ais/account/account',
        }

        self.setup_database()
        logger.info("[OK] UBIKAIS Full Crawler 초기화 완료")

    def setup_database(self):
        """SQLite 데이터베이스 초기화"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        # 비행계획 테이블 (IFR/VFR)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS flight_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crawl_timestamp TEXT,
                plan_type TEXT,
                flight_number TEXT,
                aircraft_type TEXT,
                registration TEXT,
                origin TEXT,
                destination TEXT,
                std TEXT,
                etd TEXT,
                atd TEXT,
                sta TEXT,
                eta TEXT,
                ata TEXT,
                status TEXT,
                nature TEXT,
                route TEXT,
                remarks TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(flight_number, std, origin, destination, plan_type)
            )
        ''')

        # NOTAM 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crawl_timestamp TEXT,
                notam_type TEXT,
                notam_id TEXT UNIQUE,
                location TEXT,
                fir TEXT,
                qcode TEXT,
                start_time TEXT,
                end_time TEXT,
                message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 기상정보 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS weather (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crawl_timestamp TEXT,
                weather_type TEXT,
                airport TEXT,
                observation_time TEXT,
                raw_text TEXT,
                visibility TEXT,
                wind_speed TEXT,
                wind_direction TEXT,
                temperature TEXT,
                dewpoint TEXT,
                pressure TEXT,
                weather_phenomena TEXT,
                clouds TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # ATFM 메시지 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS atfm_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crawl_timestamp TEXT,
                message_type TEXT,
                airport TEXT,
                effective_time TEXT,
                end_time TEXT,
                reason TEXT,
                capacity TEXT,
                message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 공항정보 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS airport_info (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crawl_timestamp TEXT,
                icao_code TEXT,
                iata_code TEXT,
                name_ko TEXT,
                name_en TEXT,
                latitude TEXT,
                longitude TEXT,
                elevation TEXT,
                runway_info TEXT,
                operating_hours TEXT,
                contact TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(icao_code)
            )
        ''')

        # AERO-DATA 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS aero_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crawl_timestamp TEXT,
                data_type TEXT,
                airport TEXT,
                identifier TEXT,
                data_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 크롤링 로그 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS crawl_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crawl_timestamp TEXT,
                data_type TEXT,
                status TEXT,
                records_found INTEGER,
                records_saved INTEGER,
                error_message TEXT,
                execution_time REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        conn.commit()
        conn.close()

    def init_driver(self):
        """Chrome 드라이버 초기화"""
        options = webdriver.ChromeOptions()

        if self.headless:
            options.add_argument('--headless')
            logger.info("[INFO] 헤드리스 모드 활성화")

        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--ignore-certificate-errors')
        options.add_argument('--ignore-ssl-errors')
        options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

        driver = webdriver.Chrome(options=options)
        driver.implicitly_wait(10)
        return driver

    def login(self):
        """UBIKAIS 로그인"""
        logger.info("[INFO] UBIKAIS 로그인 시도...")

        try:
            self.driver.get(self.login_url)
            time.sleep(2)

            # 아이디 입력
            username_selectors = ['#userId', 'input[name="userId"]', 'input[type="text"]']
            username_field = None
            for selector in username_selectors:
                try:
                    username_field = self.driver.find_element(By.CSS_SELECTOR, selector)
                    break
                except:
                    continue

            if username_field:
                username_field.clear()
                username_field.send_keys(self.username)

            # 비밀번호 입력
            password_selectors = ['#password', 'input[name="password"]', 'input[type="password"]']
            password_field = None
            for selector in password_selectors:
                try:
                    password_field = self.driver.find_element(By.CSS_SELECTOR, selector)
                    break
                except:
                    continue

            if password_field:
                password_field.clear()
                password_field.send_keys(self.password)

            # General 로그인 선택
            try:
                general_radio = self.driver.find_element(By.ID, "login_general")
                if not general_radio.is_selected():
                    self.driver.execute_script("arguments[0].click();", general_radio)
            except:
                pass

            # 로그인 버튼 클릭
            login_selectors = [
                "button[type='submit']",
                "input[type='submit']",
                ".btn-login",
                "#loginBtn",
                "button.login",
                "a.btn-login"
            ]

            for selector in login_selectors:
                try:
                    login_btn = self.driver.find_element(By.CSS_SELECTOR, selector)
                    self.driver.execute_script("arguments[0].click();", login_btn)
                    break
                except:
                    continue

            time.sleep(3)

            # 로그인 성공 확인
            if "login" not in self.driver.current_url.lower() or "systemId" in self.driver.current_url:
                logger.info("[OK] 로그인 성공")
                return True
            else:
                logger.error("[ERROR] 로그인 실패")
                return False

        except Exception as e:
            logger.error(f"[ERROR] 로그인 오류: {e}")
            return False

    def extract_table_data(self):
        """현재 페이지의 테이블 데이터 추출"""
        try:
            time.sleep(2)

            # JavaScript로 테이블 데이터 추출
            extract_script = """
            var result = [];
            var tables = document.querySelectorAll('table');

            for (var t = 0; t < tables.length; t++) {
                var table = tables[t];
                var rows = table.querySelectorAll('tbody tr');

                if (rows.length === 0) {
                    rows = table.querySelectorAll('tr');
                }

                // 헤더 추출
                var headers = [];
                var headerRow = table.querySelector('thead tr') || table.querySelector('tr');
                if (headerRow) {
                    var headerCells = headerRow.querySelectorAll('th, td');
                    for (var h = 0; h < headerCells.length; h++) {
                        headers.push(headerCells[h].textContent.trim());
                    }
                }

                // 데이터 추출
                for (var i = 0; i < rows.length; i++) {
                    var cells = rows[i].querySelectorAll('td');
                    if (cells.length >= 3) {
                        var rowData = {};
                        for (var j = 0; j < cells.length; j++) {
                            var key = headers[j] || 'col' + j;
                            rowData[key] = cells[j].textContent.trim();
                        }
                        result.push(rowData);
                    }
                }
            }

            return result;
            """

            data = self.driver.execute_script(extract_script)
            return data if data else []

        except Exception as e:
            logger.warning(f"[WARN] 테이블 데이터 추출 오류: {e}")
            return []

    def crawl_flight_plans(self, plan_type='departure'):
        """비행계획 크롤링 (IFR 출발/도착)"""
        url_key = 'fpl_departure' if plan_type == 'departure' else 'fpl_arrival'
        url = f"{self.base_url}{self.urls[url_key]}"

        logger.info(f"[INFO] {plan_type.upper()} 비행계획 크롤링: {url}")

        try:
            self.driver.get(url)
            time.sleep(3)

            # 검색 버튼 클릭 (데이터 로드)
            try:
                search_btn = self.driver.find_element(By.CSS_SELECTOR, "button.btn-search, #searchBtn, button[type='submit']")
                self.driver.execute_script("arguments[0].click();", search_btn)
                time.sleep(2)
            except:
                pass

            # 테이블 데이터 추출
            data = self.extract_table_data()

            # 데이터 정규화
            schedules = []
            for row in data:
                schedule = {
                    'plan_type': plan_type,
                    'flight_number': row.get('FLT', row.get('편명', row.get('col0', ''))),
                    'aircraft_type': row.get('TYP', row.get('기종', row.get('col1', ''))),
                    'registration': row.get('REG', row.get('등록부호', row.get('col2', ''))),
                    'origin': row.get('ORG', row.get('출발', row.get('col3', ''))),
                    'destination': row.get('DES', row.get('도착', row.get('col7', ''))),
                    'std': row.get('STD', row.get('계획', row.get('col4', ''))),
                    'etd': row.get('ETD', row.get('예상', row.get('col5', ''))),
                    'atd': row.get('ATD', row.get('실제', row.get('col6', ''))),
                    'sta': row.get('STA', row.get('col8', '')),
                    'eta': row.get('ETA', row.get('col9', '')),
                    'status': row.get('STS', row.get('현황', row.get('col10', ''))),
                    'nature': row.get('NAT', row.get('성격', row.get('col11', '')))
                }

                if schedule['flight_number'] and len(schedule['flight_number']) > 1:
                    schedules.append(schedule)

            logger.info(f"[OK] {plan_type} 비행계획 {len(schedules)}개 추출")
            return schedules

        except Exception as e:
            logger.error(f"[ERROR] {plan_type} 비행계획 크롤링 오류: {e}")
            return []

    def crawl_vfr_plans(self):
        """VFR 비행계획 크롤링"""
        url = f"{self.base_url}{self.urls['fpl_vfr']}"
        logger.info(f"[INFO] VFR 비행계획 크롤링: {url}")

        try:
            self.driver.get(url)
            time.sleep(3)

            # 검색
            try:
                search_btn = self.driver.find_element(By.CSS_SELECTOR, "button.btn-search, #searchBtn")
                self.driver.execute_script("arguments[0].click();", search_btn)
                time.sleep(2)
            except:
                pass

            data = self.extract_table_data()

            schedules = []
            for row in data:
                schedule = {
                    'plan_type': 'VFR',
                    'flight_number': row.get('FLT', row.get('col0', '')),
                    'aircraft_type': row.get('TYP', row.get('col1', '')),
                    'registration': row.get('REG', row.get('col2', '')),
                    'origin': row.get('ORG', row.get('col3', '')),
                    'destination': row.get('DES', row.get('col4', '')),
                    'std': row.get('STD', row.get('col5', '')),
                    'status': row.get('STS', row.get('col6', ''))
                }

                if schedule['flight_number'] or schedule['registration']:
                    schedules.append(schedule)

            logger.info(f"[OK] VFR 비행계획 {len(schedules)}개 추출")
            return schedules

        except Exception as e:
            logger.error(f"[ERROR] VFR 비행계획 크롤링 오류: {e}")
            return []

    def crawl_weather(self, weather_type='metar'):
        """기상정보 크롤링"""
        url_map = {
            'metar': 'weather_metar',
            'taf': 'weather_taf',
            'sigmet': 'weather_sigmet',
            'admet': 'weather_admet'
        }

        url = f"{self.base_url}{self.urls[url_map.get(weather_type, 'weather_metar')]}"
        logger.info(f"[INFO] {weather_type.upper()} 기상정보 크롤링: {url}")

        try:
            self.driver.get(url)
            time.sleep(3)

            # 검색
            try:
                search_btn = self.driver.find_element(By.CSS_SELECTOR, "button.btn-search, #searchBtn")
                self.driver.execute_script("arguments[0].click();", search_btn)
                time.sleep(2)
            except:
                pass

            data = self.extract_table_data()

            weather_data = []
            for row in data:
                weather = {
                    'weather_type': weather_type,
                    'airport': row.get('공항', row.get('AIRPORT', row.get('col0', ''))),
                    'observation_time': row.get('관측시간', row.get('TIME', row.get('col1', ''))),
                    'raw_text': row.get('내용', row.get('MESSAGE', row.get('col2', '')))
                }

                if weather['airport'] or weather['raw_text']:
                    weather_data.append(weather)

            logger.info(f"[OK] {weather_type} 기상정보 {len(weather_data)}개 추출")
            return weather_data

        except Exception as e:
            logger.error(f"[ERROR] {weather_type} 기상정보 크롤링 오류: {e}")
            return []

    def crawl_notam(self, notam_type='fir'):
        """NOTAM 크롤링"""
        url_map = {
            'fir': 'notam_fir',
            'ad': 'notam_ad',
            'snow': 'notam_snow',
            'prohibited': 'notam_prohibited'
        }

        url = f"{self.base_url}{self.urls[url_map.get(notam_type, 'notam_fir')]}"
        logger.info(f"[INFO] {notam_type.upper()} NOTAM 크롤링: {url}")

        try:
            self.driver.get(url)
            time.sleep(3)

            # 검색
            try:
                search_btn = self.driver.find_element(By.CSS_SELECTOR, "button.btn-search, #searchBtn")
                self.driver.execute_script("arguments[0].click();", search_btn)
                time.sleep(2)
            except:
                pass

            data = self.extract_table_data()

            notams = []
            for row in data:
                notam = {
                    'notam_type': notam_type,
                    'notam_id': row.get('NOTAM NO', row.get('col0', '')),
                    'location': row.get('LOCATION', row.get('col1', '')),
                    'qcode': row.get('QCODE', row.get('col2', '')),
                    'start_time': row.get('START', row.get('col3', '')),
                    'end_time': row.get('END', row.get('col4', '')),
                    'message': row.get('E)', row.get('MESSAGE', row.get('col5', '')))
                }

                if notam['notam_id']:
                    notams.append(notam)

            logger.info(f"[OK] {notam_type} NOTAM {len(notams)}개 추출")
            return notams

        except Exception as e:
            logger.error(f"[ERROR] {notam_type} NOTAM 크롤링 오류: {e}")
            return []

    def crawl_atfm(self):
        """ATFM 메시지 크롤링"""
        url = f"{self.base_url}{self.urls['atfm_message']}"
        logger.info(f"[INFO] ATFM 메시지 크롤링: {url}")

        try:
            self.driver.get(url)
            time.sleep(3)

            data = self.extract_table_data()

            messages = []
            for row in data:
                msg = {
                    'message_type': 'ATFM',
                    'airport': row.get('AIRPORT', row.get('col0', '')),
                    'effective_time': row.get('EFFECTIVE', row.get('col1', '')),
                    'end_time': row.get('END', row.get('col2', '')),
                    'reason': row.get('REASON', row.get('col3', '')),
                    'message': row.get('MESSAGE', row.get('col4', ''))
                }

                if msg['airport'] or msg['message']:
                    messages.append(msg)

            logger.info(f"[OK] ATFM 메시지 {len(messages)}개 추출")
            return messages

        except Exception as e:
            logger.error(f"[ERROR] ATFM 크롤링 오류: {e}")
            return []

    def crawl_airport_info(self, icao_code):
        """공항 정보 크롤링"""
        url = f"{self.base_url}{self.urls['airport_info']}{icao_code}"
        logger.info(f"[INFO] 공항정보 크롤링: {icao_code}")

        try:
            self.driver.get(url)
            time.sleep(3)

            # 공항 기본정보 추출
            info = {
                'icao_code': icao_code,
                'name_ko': self.airports.get(icao_code, ''),
                'data': self.extract_table_data()
            }

            return info

        except Exception as e:
            logger.error(f"[ERROR] 공항정보 크롤링 오류 ({icao_code}): {e}")
            return None

    def crawl_aero_data(self, data_type='airport'):
        """AERO-DATA 크롤링"""
        url_map = {
            'airport': 'aero_airport',
            'runway': 'aero_runway',
            'apron': 'aero_apron',
            'navaid': 'aero_navaid',
            'obst': 'aero_obst',
            'ats': 'aero_ats'
        }

        url = f"{self.base_url}{self.urls[url_map.get(data_type, 'aero_airport')]}"
        logger.info(f"[INFO] AERO-DATA ({data_type}) 크롤링: {url}")

        try:
            self.driver.get(url)
            time.sleep(3)

            # 검색
            try:
                search_btn = self.driver.find_element(By.CSS_SELECTOR, "button.btn-search, #searchBtn")
                self.driver.execute_script("arguments[0].click();", search_btn)
                time.sleep(2)
            except:
                pass

            data = self.extract_table_data()

            logger.info(f"[OK] AERO-DATA ({data_type}) {len(data)}개 추출")
            return data

        except Exception as e:
            logger.error(f"[ERROR] AERO-DATA ({data_type}) 크롤링 오류: {e}")
            return []

    def save_to_database(self, data, data_type, crawl_timestamp):
        """데이터를 DB에 저장"""
        if not data:
            return 0

        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        saved_count = 0

        try:
            if data_type in ['departure', 'arrival', 'VFR']:
                for item in data:
                    try:
                        cursor.execute('''
                            INSERT OR REPLACE INTO flight_plans
                            (crawl_timestamp, plan_type, flight_number, aircraft_type,
                             registration, origin, destination, std, etd, atd, sta, eta, status, nature)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            crawl_timestamp, item.get('plan_type'), item.get('flight_number'),
                            item.get('aircraft_type'), item.get('registration'),
                            item.get('origin'), item.get('destination'),
                            item.get('std'), item.get('etd'), item.get('atd'),
                            item.get('sta'), item.get('eta'),
                            item.get('status'), item.get('nature')
                        ))
                        saved_count += 1
                    except Exception as e:
                        logger.debug(f"저장 오류: {e}")

            elif data_type in ['metar', 'taf', 'sigmet', 'admet']:
                for item in data:
                    try:
                        cursor.execute('''
                            INSERT INTO weather
                            (crawl_timestamp, weather_type, airport, observation_time, raw_text)
                            VALUES (?, ?, ?, ?, ?)
                        ''', (
                            crawl_timestamp, item.get('weather_type'),
                            item.get('airport'), item.get('observation_time'),
                            item.get('raw_text')
                        ))
                        saved_count += 1
                    except Exception as e:
                        logger.debug(f"저장 오류: {e}")

            elif data_type in ['fir', 'ad', 'snow', 'prohibited']:
                for item in data:
                    try:
                        cursor.execute('''
                            INSERT OR REPLACE INTO notams
                            (crawl_timestamp, notam_type, notam_id, location, qcode,
                             start_time, end_time, message)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            crawl_timestamp, item.get('notam_type'), item.get('notam_id'),
                            item.get('location'), item.get('qcode'),
                            item.get('start_time'), item.get('end_time'),
                            item.get('message')
                        ))
                        saved_count += 1
                    except Exception as e:
                        logger.debug(f"저장 오류: {e}")

            conn.commit()

        except Exception as e:
            logger.error(f"[ERROR] DB 저장 오류: {e}")
        finally:
            conn.close()

        return saved_count

    def save_to_json(self, all_data, crawl_timestamp):
        """모든 데이터를 JSON으로 저장"""
        output = {
            'crawl_timestamp': crawl_timestamp,
            'last_updated': datetime.now().isoformat(),
            'data': all_data
        }

        # 메인 JSON 파일
        with open('ubikais_data.json', 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        # 개별 데이터 파일들
        for key, value in all_data.items():
            filename = f'ubikais_{key}.json'
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump({
                    'crawl_timestamp': crawl_timestamp,
                    'count': len(value) if isinstance(value, list) else 1,
                    'data': value
                }, f, ensure_ascii=False, indent=2)

        logger.info("[OK] JSON 파일 저장 완료")

    def log_crawl(self, crawl_timestamp, data_type, status, records_found,
                  records_saved, error_message=None, execution_time=0):
        """크롤링 로그 저장"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO crawl_logs
            (crawl_timestamp, data_type, status, records_found, records_saved,
             error_message, execution_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (crawl_timestamp, data_type, status, records_found,
              records_saved, error_message, execution_time))

        conn.commit()
        conn.close()

    def crawl_all(self):
        """전체 데이터 크롤링"""
        start_time = time.time()
        crawl_timestamp = datetime.now().isoformat()
        all_data = {}

        try:
            logger.info(f"\n{'='*70}")
            logger.info(f"[START] UBIKAIS 전체 크롤링 시작: {crawl_timestamp}")
            logger.info(f"{'='*70}")

            # 드라이버 초기화
            self.driver = self.init_driver()

            # 로그인
            if not self.login():
                raise Exception("로그인 실패")

            # 1. 비행계획 (IFR 출발/도착)
            logger.info("\n[STEP 1] 비행계획 크롤링...")
            departures = self.crawl_flight_plans('departure')
            all_data['departures'] = departures
            self.save_to_database(departures, 'departure', crawl_timestamp)

            arrivals = self.crawl_flight_plans('arrival')
            all_data['arrivals'] = arrivals
            self.save_to_database(arrivals, 'arrival', crawl_timestamp)

            # 2. VFR 비행계획
            logger.info("\n[STEP 2] VFR 비행계획 크롤링...")
            vfr_plans = self.crawl_vfr_plans()
            all_data['vfr'] = vfr_plans
            self.save_to_database(vfr_plans, 'VFR', crawl_timestamp)

            # 3. 기상정보
            logger.info("\n[STEP 3] 기상정보 크롤링...")
            for weather_type in ['metar', 'taf', 'sigmet']:
                weather_data = self.crawl_weather(weather_type)
                all_data[f'weather_{weather_type}'] = weather_data
                self.save_to_database(weather_data, weather_type, crawl_timestamp)

            # 4. NOTAM
            logger.info("\n[STEP 4] NOTAM 크롤링...")
            for notam_type in ['fir', 'ad', 'snow']:
                notams = self.crawl_notam(notam_type)
                all_data[f'notam_{notam_type}'] = notams
                self.save_to_database(notams, notam_type, crawl_timestamp)

            # 5. ATFM
            logger.info("\n[STEP 5] ATFM 크롤링...")
            atfm = self.crawl_atfm()
            all_data['atfm'] = atfm

            # 6. AERO-DATA
            logger.info("\n[STEP 6] AERO-DATA 크롤링...")
            for aero_type in ['airport', 'runway', 'navaid']:
                aero_data = self.crawl_aero_data(aero_type)
                all_data[f'aero_{aero_type}'] = aero_data

            # JSON 저장
            self.save_to_json(all_data, crawl_timestamp)

            execution_time = time.time() - start_time

            # 통계 출력
            logger.info(f"\n{'='*70}")
            logger.info("[SUMMARY] 크롤링 결과")
            logger.info(f"{'='*70}")
            for key, value in all_data.items():
                count = len(value) if isinstance(value, list) else 1
                logger.info(f"  - {key}: {count}개")
            logger.info(f"  - 실행시간: {execution_time:.2f}초")

            return {
                'status': 'SUCCESS',
                'data': all_data,
                'execution_time': execution_time
            }

        except Exception as e:
            execution_time = time.time() - start_time
            error_msg = str(e)
            logger.error(f"[ERROR] 크롤링 실패: {error_msg}")

            return {
                'status': 'FAILED',
                'error': error_msg,
                'execution_time': execution_time
            }

        finally:
            if self.driver:
                self.driver.quit()


def main():
    """메인 실행"""
    import argparse

    parser = argparse.ArgumentParser(description='UBIKAIS Full Crawler')
    parser.add_argument('--headless', action='store_true', help='Run in headless mode')
    parser.add_argument('--type', choices=['all', 'fpl', 'weather', 'notam', 'atfm', 'aero'],
                        default='all', help='Data type to crawl')
    args = parser.parse_args()

    crawler = UBIKAISFullCrawler(headless=args.headless)

    if args.type == 'all':
        result = crawler.crawl_all()
    else:
        # 개별 크롤링 (추후 구현)
        result = crawler.crawl_all()

    if result['status'] == 'SUCCESS':
        print(f"\n[OK] 크롤링 성공! 실행시간: {result['execution_time']:.2f}초")
    else:
        print(f"\n[FAIL] 크롤링 실패: {result.get('error')}")


if __name__ == "__main__":
    main()
