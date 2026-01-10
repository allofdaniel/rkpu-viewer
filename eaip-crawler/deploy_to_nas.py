"""
eAIP Crawler를 NAS에 배포하는 스크립트
"""

import subprocess
import os

# NAS 설정
NAS_HOST = "192.168.50.179"
NAS_USER = "allofdaniel"
NAS_DOCKER_PATH = "/volume1/docker/eaip-crawler"

# 현재 디렉토리
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def run_ssh(command: str):
    """SSH 명령 실행"""
    full_cmd = f'ssh {NAS_USER}@{NAS_HOST} "{command}"'
    print(f"Running: {command}")
    result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)
    return result.returncode == 0

def run_scp(local_path: str, remote_path: str):
    """SCP로 파일 전송"""
    full_cmd = f'scp "{local_path}" {NAS_USER}@{NAS_HOST}:"{remote_path}"'
    print(f"Copying: {local_path} -> {remote_path}")
    result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
    if result.stderr:
        print(result.stderr)
    return result.returncode == 0

def main():
    print("=== Deploying eAIP Crawler to NAS ===")
    print(f"NAS: {NAS_USER}@{NAS_HOST}")
    print(f"Path: {NAS_DOCKER_PATH}")
    print()

    # 1. 디렉토리 생성
    print("[1/5] Creating directories...")
    run_ssh(f"mkdir -p {NAS_DOCKER_PATH}")

    # 2. 파일 전송
    print("[2/5] Copying files...")
    files = ['eaip_crawler.py', 'Dockerfile', 'entrypoint.sh', 'docker-compose.yml']
    for f in files:
        local_path = os.path.join(SCRIPT_DIR, f)
        if os.path.exists(local_path):
            run_scp(local_path, f"{NAS_DOCKER_PATH}/{f}")

    # 3. 권한 설정
    print("[3/5] Setting permissions...")
    run_ssh(f"chmod +x {NAS_DOCKER_PATH}/entrypoint.sh")

    # 4. 기존 컨테이너 정지
    print("[4/5] Stopping existing container...")
    run_ssh(f"/usr/local/bin/docker stop eaip-crawler || true")
    run_ssh(f"/usr/local/bin/docker rm eaip-crawler || true")

    # 5. 빌드 및 실행
    print("[5/5] Building and starting container...")
    run_ssh(f"cd {NAS_DOCKER_PATH} && /usr/local/bin/docker-compose up -d --build")

    print()
    print("=== Deployment complete ===")
    print(f"Check logs: ssh {NAS_USER}@{NAS_HOST} '/usr/local/bin/docker logs -f eaip-crawler'")

if __name__ == "__main__":
    main()
