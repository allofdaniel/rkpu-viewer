"""
UBIKAIS FPL Schedule Crawler - 한국 항공 비행계획 데이터 수집
작성일: 2025-12-29
목적: UBIKAIS에서 출발/도착 스케줄 정보를 크롤링하여 JSON/SQLite로 저장
"""

import time
import json
import sqlite3
from datetime import datetime, timedelta
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
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
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class UBIKAISCrawler:
    def __init__(self, db_name='ubikais_schedule.db', headless=True):
        self.login_url = 'https://ubikais.fois.go.kr:8030/common/login?systemId=sysUbikais'
        self.dep_url = 'https://ubikais.fois.go.kr:8030/sysUbikais/biz/fpl/dep'
        self.arr_url = 'https://ubikais.fois.go.kr:8030/sysUbikais/biz/fpl/arr'

        self.username = os.environ.get('UBIKAIS_USERNAME', 'allofdanie')
        self.password = os.environ.get('UBIKAIS_PASSWORD', 'pr12pr34!!')

        self.db_name = db_name
        self.headless = headless
        self.json_output = 'flight_schedule.json'

        self.setup_database()
        logger.info("[OK] UBIKAIS 크롤러 초기화 완료")

    def setup_database(self):
        """SQLite 데이터베이스 초기화"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        # 비행 스케줄 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS flight_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crawl_timestamp TEXT,
                schedule_type TEXT,
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
                status TEXT,
                nature TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(flight_number, std, origin, destination)
            )
        ''')

        # 크롤링 로그 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS crawl_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crawl_timestamp TEXT,
                schedule_type TEXT,
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

    def login(self, driver):
        """UBIKAIS 로그인"""
        logger.info("[INFO] UBIKAIS 로그인 시도...")

        try:
            driver.get(self.login_url)
            time.sleep(2)

            # 아이디 입력
            username_field = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "userId"))
            )
            username_field.clear()
            username_field.send_keys(self.username)

            # 비밀번호 입력
            password_field = driver.find_element(By.ID, "password")
            password_field.clear()
            password_field.send_keys(self.password)

            # General 로그인 선택
            try:
                general_radio = driver.find_element(By.ID, "login_general")
                if not general_radio.is_selected():
                    driver.execute_script("arguments[0].click();", general_radio)
            except:
                pass

            # 로그인 버튼 클릭
            login_btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit'], input[type='submit'], .btn-login, #loginBtn")
            driver.execute_script("arguments[0].click();", login_btn)

            time.sleep(3)

            # 로그인 성공 확인
            if "login" not in driver.current_url.lower():
                logger.info("[OK] 로그인 성공")
                return True
            else:
                logger.error("[ERROR] 로그인 실패 - 여전히 로그인 페이지")
                return False

        except Exception as e:
            logger.error(f"[ERROR] 로그인 오류: {e}")
            return False

    def extract_table_data(self, driver, schedule_type='departure'):
        """테이블에서 스케줄 데이터 추출"""
        schedules = []

        try:
            # 테이블 로딩 대기
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.TAG_NAME, "table"))
            )
            time.sleep(2)

            # JavaScript로 테이블 데이터 추출
            extract_script = """
            var result = [];

            // 테이블 찾기 (여러 방법 시도)
            var tables = document.querySelectorAll('table');
            var dataTable = null;

            for (var i = 0; i < tables.length; i++) {
                var rows = tables[i].querySelectorAll('tbody tr');
                if (rows.length > 0) {
                    dataTable = tables[i];
                    break;
                }
            }

            if (!dataTable) {
                return {error: 'No data table found'};
            }

            var rows = dataTable.querySelectorAll('tbody tr');

            for (var i = 0; i < rows.length; i++) {
                var cells = rows[i].querySelectorAll('td');
                if (cells.length >= 10) {
                    var row = {
                        flight_number: cells[0] ? cells[0].textContent.trim() : '',
                        aircraft_type: cells[1] ? cells[1].textContent.trim() : '',
                        registration: cells[2] ? cells[2].textContent.trim() : '',
                        origin: cells[3] ? cells[3].textContent.trim() : '',
                        std: cells[4] ? cells[4].textContent.trim() : '',
                        etd: cells[5] ? cells[5].textContent.trim() : '',
                        atd: cells[6] ? cells[6].textContent.trim() : '',
                        destination: cells[7] ? cells[7].textContent.trim() : '',
                        sta: cells[8] ? cells[8].textContent.trim() : '',
                        eta: cells[9] ? cells[9].textContent.trim() : '',
                        status: cells[10] ? cells[10].textContent.trim() : '',
                        nature: cells[11] ? cells[11].textContent.trim() : ''
                    };

                    // flight_number가 있는 행만 추가
                    if (row.flight_number && row.flight_number.length > 0) {
                        result.push(row);
                    }
                }
            }

            return {data: result, count: rows.length};
            """

            extraction_result = driver.execute_script(extract_script)

            if 'error' in extraction_result:
                logger.warning(f"테이블 추출 오류: {extraction_result['error']}")
                return schedules

            if 'data' in extraction_result:
                schedules = extraction_result['data']
                logger.info(f"[OK] {len(schedules)}개 스케줄 추출 (총 {extraction_result.get('count', 0)}개 행)")

                # 샘플 출력
                for idx, schedule in enumerate(schedules[:3], 1):
                    logger.debug(f"  {idx}. {schedule.get('flight_number')} - {schedule.get('origin')} -> {schedule.get('destination')}")

        except Exception as e:
            logger.error(f"[ERROR] 테이블 데이터 추출 오류: {e}")

        return schedules

    def crawl_departures(self, driver):
        """출발 스케줄 크롤링"""
        logger.info("[INFO] 출발 스케줄 크롤링 시작...")

        try:
            driver.get(self.dep_url)
            time.sleep(3)

            # 검색 버튼 클릭 (필요시)
            try:
                search_btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit'], .btn-search, #searchBtn")
                driver.execute_script("arguments[0].click();", search_btn)
                time.sleep(2)
            except:
                pass

            schedules = self.extract_table_data(driver, 'departure')

            for schedule in schedules:
                schedule['schedule_type'] = 'departure'

            return schedules

        except Exception as e:
            logger.error(f"[ERROR] 출발 스케줄 크롤링 오류: {e}")
            return []

    def crawl_arrivals(self, driver):
        """도착 스케줄 크롤링"""
        logger.info("[INFO] 도착 스케줄 크롤링 시작...")

        try:
            driver.get(self.arr_url)
            time.sleep(3)

            # 검색 버튼 클릭 (필요시)
            try:
                search_btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit'], .btn-search, #searchBtn")
                driver.execute_script("arguments[0].click();", search_btn)
                time.sleep(2)
            except:
                pass

            schedules = self.extract_table_data(driver, 'arrival')

            for schedule in schedules:
                schedule['schedule_type'] = 'arrival'

            return schedules

        except Exception as e:
            logger.error(f"[ERROR] 도착 스케줄 크롤링 오류: {e}")
            return []

    def save_to_database(self, schedules, crawl_timestamp):
        """스케줄 데이터를 DB에 저장"""
        if not schedules:
            return 0

        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        saved_count = 0

        for schedule in schedules:
            try:
                cursor.execute('''
                    INSERT OR REPLACE INTO flight_schedules
                    (crawl_timestamp, schedule_type, flight_number, aircraft_type,
                     registration, origin, destination, std, etd, atd, sta, eta, status, nature)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    crawl_timestamp,
                    schedule.get('schedule_type', ''),
                    schedule.get('flight_number', ''),
                    schedule.get('aircraft_type', ''),
                    schedule.get('registration', ''),
                    schedule.get('origin', ''),
                    schedule.get('destination', ''),
                    schedule.get('std', ''),
                    schedule.get('etd', ''),
                    schedule.get('atd', ''),
                    schedule.get('sta', ''),
                    schedule.get('eta', ''),
                    schedule.get('status', ''),
                    schedule.get('nature', '')
                ))
                if cursor.rowcount > 0:
                    saved_count += 1
            except Exception as e:
                logger.warning(f"DB 저장 오류: {e}")

        conn.commit()
        conn.close()
        return saved_count

    def save_to_json(self, schedules, crawl_timestamp):
        """스케줄 데이터를 JSON으로 저장"""
        data = {
            'crawl_timestamp': crawl_timestamp,
            'last_updated': datetime.now().isoformat(),
            'total_count': len(schedules),
            'schedules': schedules
        }

        with open(self.json_output, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"[OK] JSON 저장 완료: {self.json_output}")

    def log_crawl(self, crawl_timestamp, schedule_type, status, records_found,
                  records_saved, error_message=None, execution_time=0):
        """크롤링 로그 저장"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO crawl_logs
            (crawl_timestamp, schedule_type, status, records_found, records_saved,
             error_message, execution_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (crawl_timestamp, schedule_type, status, records_found,
              records_saved, error_message, execution_time))

        conn.commit()
        conn.close()

    def crawl(self):
        """전체 크롤링 실행"""
        driver = None
        start_time = time.time()
        crawl_timestamp = datetime.now().isoformat()
        all_schedules = []

        try:
            logger.info(f"\n{'='*70}")
            logger.info(f"[START] [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] UBIKAIS 크롤링 시작")
            logger.info(f"{'='*70}")

            driver = self.init_driver()

            # 로그인
            if not self.login(driver):
                raise Exception("로그인 실패")

            # 출발 스케줄 크롤링
            departures = self.crawl_departures(driver)
            all_schedules.extend(departures)
            logger.info(f"[INFO] 출발 스케줄: {len(departures)}개")

            # 도착 스케줄 크롤링
            arrivals = self.crawl_arrivals(driver)
            all_schedules.extend(arrivals)
            logger.info(f"[INFO] 도착 스케줄: {len(arrivals)}개")

            # DB 저장
            saved_count = self.save_to_database(all_schedules, crawl_timestamp)
            logger.info(f"[INFO] DB 저장 완료: {saved_count}개")

            # JSON 저장
            self.save_to_json(all_schedules, crawl_timestamp)

            execution_time = time.time() - start_time

            # 로그 저장
            self.log_crawl(crawl_timestamp, 'all', 'SUCCESS',
                          len(all_schedules), saved_count, None, execution_time)

            logger.info(f"\n[OK] 크롤링 완료 - 총 {len(all_schedules)}개, 실행시간: {execution_time:.2f}초")

            return {
                'status': 'SUCCESS',
                'departures': len(departures),
                'arrivals': len(arrivals),
                'total': len(all_schedules),
                'saved': saved_count,
                'execution_time': execution_time
            }

        except Exception as e:
            execution_time = time.time() - start_time
            error_msg = str(e)
            logger.error(f"[ERROR] 크롤링 실패: {error_msg}")

            self.log_crawl(crawl_timestamp, 'all', 'FAILED',
                          0, 0, error_msg, execution_time)

            return {
                'status': 'FAILED',
                'error': error_msg,
                'execution_time': execution_time
            }

        finally:
            if driver:
                driver.quit()


def main():
    """메인 실행 함수"""
    crawler = UBIKAISCrawler(headless=False)  # 테스트용으로 headless=False
    result = crawler.crawl()

    print("\n" + "="*70)
    print("[SUMMARY] 크롤링 결과")
    print("="*70)

    if result['status'] == 'SUCCESS':
        print(f"  [OK] 성공")
        print(f"  - 출발 스케줄: {result['departures']}개")
        print(f"  - 도착 스케줄: {result['arrivals']}개")
        print(f"  - 총: {result['total']}개 (저장: {result['saved']}개)")
        print(f"  - 실행시간: {result['execution_time']:.2f}초")
    else:
        print(f"  [FAIL] 실패: {result['error']}")


if __name__ == "__main__":
    main()
