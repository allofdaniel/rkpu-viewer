FROM python:3.11-slim

WORKDIR /app

# 필요한 패키지 설치
RUN pip install --no-cache-dir requests beautifulsoup4 boto3

# 크롤러 복사
COPY eaip_crawler.py .
COPY entrypoint.sh .

RUN chmod +x entrypoint.sh

# 데이터 디렉토리
RUN mkdir -p /data /export

# 환경변수
ENV DB_PATH=/data/eaip_korea.db
ENV EXPORT_PATH=/export/korea_airspace.json
ENV S3_BUCKET=notam-korea-data
ENV S3_KEY=eaip/korea_airspace.json
ENV CRON_SCHEDULE="0 3 * * *"
ENV TZ=Asia/Seoul

VOLUME ["/data", "/export"]

ENTRYPOINT ["/app/entrypoint.sh"]
