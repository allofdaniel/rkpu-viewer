"""
UBIKAIS Auto Crawler & Vercel Deploy
자동 크롤링 후 Vercel에 배포하는 스크립트
Windows 작업 스케줄러로 5~15분 주기 실행 가능
"""

import os
import sys
import json
import time
import subprocess
from datetime import datetime
from pathlib import Path

# 프로젝트 디렉토리
PROJECT_DIR = Path(__file__).parent
PUBLIC_DIR = PROJECT_DIR / 'public'
FLIGHT_SCHEDULE_FILE = PUBLIC_DIR / 'flight_schedule.json'

def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {msg}")

def run_crawler():
    """UBIKAIS 크롤러 실행"""
    log("UBIKAIS 크롤러 시작...")

    try:
        from ubikais_crawler import UBIKAISCrawler

        crawler = UBIKAISCrawler(headless=True)
        result = crawler.crawl_fpl_data()

        if result and result.get('departures'):
            # JSON 파일로 저장
            output = {
                'crawl_timestamp': datetime.now().isoformat(),
                'last_updated': datetime.now().isoformat(),
                'total_count': len(result['departures']),
                'departures': result['departures']
            }

            with open(FLIGHT_SCHEDULE_FILE, 'w', encoding='utf-8') as f:
                json.dump(output, f, ensure_ascii=False, indent=2)

            log(f"크롤링 완료: {len(result['departures'])}개 비행편 저장")
            return True
        else:
            log("크롤링 결과 없음")
            return False

    except ImportError:
        log("ubikais_crawler 모듈을 찾을 수 없습니다. 기존 JSON 파일 사용")
        return False
    except Exception as e:
        log(f"크롤링 오류: {e}")
        return False

def deploy_to_vercel():
    """Vercel에 배포"""
    log("Vercel 배포 시작...")

    try:
        # Git 상태 확인 및 커밋
        os.chdir(PROJECT_DIR)

        # flight_schedule.json만 커밋
        subprocess.run(['git', 'add', 'public/flight_schedule.json'],
                      capture_output=True, text=True)

        result = subprocess.run(
            ['git', 'commit', '-m', f'Auto-update flight schedule {datetime.now().strftime("%Y-%m-%d %H:%M")}'],
            capture_output=True, text=True
        )

        if 'nothing to commit' in result.stdout or 'nothing to commit' in result.stderr:
            log("변경사항 없음, 배포 스킵")
            return True

        # Vercel 배포
        result = subprocess.run(
            ['vercel', '--prod', '--yes'],
            capture_output=True, text=True,
            timeout=300
        )

        if result.returncode == 0:
            log("Vercel 배포 성공!")
            return True
        else:
            log(f"Vercel 배포 실패: {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        log("Vercel 배포 타임아웃")
        return False
    except Exception as e:
        log(f"배포 오류: {e}")
        return False

def check_file_age():
    """flight_schedule.json 파일 나이 확인 (분 단위)"""
    if not FLIGHT_SCHEDULE_FILE.exists():
        return float('inf')

    try:
        with open(FLIGHT_SCHEDULE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        last_updated = data.get('last_updated') or data.get('crawl_timestamp')
        if last_updated:
            last_time = datetime.fromisoformat(last_updated.replace('Z', '+00:00').split('+')[0])
            age_minutes = (datetime.now() - last_time).total_seconds() / 60
            return age_minutes
    except:
        pass

    return float('inf')

def main():
    """메인 실행"""
    log("=" * 60)
    log("UBIKAIS Auto Crawler & Deploy")
    log("=" * 60)

    # 파일 나이 확인
    file_age = check_file_age()
    log(f"현재 데이터 나이: {file_age:.1f}분")

    # 10분 이상 지났으면 크롤링
    if file_age > 10:
        crawl_success = run_crawler()

        if crawl_success:
            deploy_to_vercel()
        else:
            log("크롤링 실패, 배포 스킵")
    else:
        log(f"데이터가 아직 신선합니다 ({file_age:.1f}분). 크롤링 스킵")

    log("완료!")

if __name__ == "__main__":
    main()
