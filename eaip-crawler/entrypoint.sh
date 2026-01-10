#!/bin/bash
set -e

echo "=== eAIP Korea Crawler ==="
echo "DB_PATH: $DB_PATH"
echo "EXPORT_PATH: $EXPORT_PATH"
echo "S3_BUCKET: $S3_BUCKET"

# AWS 자격증명 확인
if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "AWS credentials configured"
    HAS_S3=true
else
    echo "No AWS credentials - S3 upload disabled"
    HAS_S3=false
fi

run_crawler() {
    echo ""
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting crawler..."

    # 새 AIRAC 확인
    python /app/eaip_crawler.py --db "$DB_PATH" --check-update

    # 크롤링 실행 및 JSON 내보내기
    python /app/eaip_crawler.py --db "$DB_PATH" --export "$EXPORT_PATH"

    # S3 업로드
    if [ "$HAS_S3" = true ]; then
        echo "Uploading to S3..."
        python -c "
import boto3
import os

s3 = boto3.client('s3',
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
    region_name=os.environ.get('AWS_REGION', 'ap-northeast-2')
)

export_path = os.environ.get('EXPORT_PATH')
bucket = os.environ.get('S3_BUCKET')
key = os.environ.get('S3_KEY')

s3.upload_file(export_path, bucket, key)
print(f'Uploaded to s3://{bucket}/{key}')

# 타임스탬프 버전도 저장
from datetime import datetime
timestamp_key = key.replace('.json', f'_{datetime.now().strftime(\"%Y%m%d_%H%M%S\")}.json')
s3.upload_file(export_path, bucket, timestamp_key)
print(f'Uploaded to s3://{bucket}/{timestamp_key}')
"
    fi

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Crawler completed"
}

# 첫 실행
run_crawler

# 데몬 모드: 매일 실행
if [ "${DAEMON_MODE:-true}" = "true" ]; then
    echo ""
    echo "Running in daemon mode..."
    echo "Next run scheduled by cron: $CRON_SCHEDULE"

    while true; do
        # 다음 실행까지 대기 (24시간)
        sleep 86400
        run_crawler
    done
fi
