"""
UBIKAIS API AWS 배포 스크립트
- Lambda 함수 생성/업데이트
- API Gateway 설정
- S3 버킷 생성 (DB 저장용)
- CloudWatch Events로 크롤링 스케줄 설정
"""

import boto3
import json
import zipfile
import os
import io
from datetime import datetime

# AWS 설정
AWS_REGION = os.environ.get('AWS_REGION', 'ap-northeast-2')
LAMBDA_FUNCTION_NAME = 'ubikais-api'
S3_BUCKET_NAME = 'ubikais-data'
API_NAME = 'ubikais-api'

# boto3 클라이언트
lambda_client = boto3.client('lambda', region_name=AWS_REGION)
s3_client = boto3.client('s3', region_name=AWS_REGION)
apigateway_client = boto3.client('apigateway', region_name=AWS_REGION)
events_client = boto3.client('events', region_name=AWS_REGION)
iam_client = boto3.client('iam')


def create_s3_bucket():
    """S3 버킷 생성"""
    print(f"[INFO] S3 버킷 생성: {S3_BUCKET_NAME}")

    try:
        if AWS_REGION == 'us-east-1':
            s3_client.create_bucket(Bucket=S3_BUCKET_NAME)
        else:
            s3_client.create_bucket(
                Bucket=S3_BUCKET_NAME,
                CreateBucketConfiguration={'LocationConstraint': AWS_REGION}
            )
        print(f"[OK] S3 버킷 생성 완료: {S3_BUCKET_NAME}")
    except s3_client.exceptions.BucketAlreadyExists:
        print(f"[INFO] S3 버킷 이미 존재: {S3_BUCKET_NAME}")
    except s3_client.exceptions.BucketAlreadyOwnedByYou:
        print(f"[INFO] S3 버킷 이미 소유: {S3_BUCKET_NAME}")
    except Exception as e:
        print(f"[WARN] S3 버킷 생성 오류: {e}")


def upload_db_to_s3(db_path='ubikais_full.db'):
    """DB 파일을 S3에 업로드"""
    print(f"[INFO] DB 파일 업로드: {db_path} -> s3://{S3_BUCKET_NAME}/")

    try:
        s3_client.upload_file(db_path, S3_BUCKET_NAME, 'ubikais_full.db')
        print(f"[OK] DB 업로드 완료")
    except Exception as e:
        print(f"[ERROR] DB 업로드 오류: {e}")


def create_lambda_zip():
    """Lambda 배포 패키지 생성"""
    print("[INFO] Lambda 배포 패키지 생성...")

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # lambda_handler.py
        with open('lambda_handler.py', 'r', encoding='utf-8') as f:
            zf.writestr('lambda_handler.py', f.read())

    zip_buffer.seek(0)
    print("[OK] Lambda ZIP 생성 완료")
    return zip_buffer.read()


def get_or_create_lambda_role():
    """Lambda 실행 역할 생성/조회"""
    role_name = 'ubikais-lambda-role'

    # 기존 역할 확인
    try:
        role = iam_client.get_role(RoleName=role_name)
        print(f"[INFO] 기존 역할 사용: {role_name}")
        return role['Role']['Arn']
    except iam_client.exceptions.NoSuchEntityException:
        pass

    # 새 역할 생성
    print(f"[INFO] 새 역할 생성: {role_name}")

    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }
        ]
    }

    try:
        role = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description='UBIKAIS Lambda Execution Role'
        )

        # 정책 연결
        policies = [
            'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'
        ]

        for policy in policies:
            iam_client.attach_role_policy(RoleName=role_name, PolicyArn=policy)

        print(f"[OK] 역할 생성 완료: {role_name}")
        return role['Role']['Arn']

    except Exception as e:
        print(f"[ERROR] 역할 생성 오류: {e}")
        raise


def create_or_update_lambda():
    """Lambda 함수 생성/업데이트"""
    print(f"[INFO] Lambda 함수 처리: {LAMBDA_FUNCTION_NAME}")

    zip_content = create_lambda_zip()
    role_arn = get_or_create_lambda_role()

    # 역할 적용 대기
    import time
    time.sleep(10)

    try:
        # 기존 함수 업데이트
        lambda_client.update_function_code(
            FunctionName=LAMBDA_FUNCTION_NAME,
            ZipFile=zip_content
        )
        print(f"[OK] Lambda 함수 업데이트 완료")

    except lambda_client.exceptions.ResourceNotFoundException:
        # 새 함수 생성
        print(f"[INFO] Lambda 함수 생성 중...")

        lambda_client.create_function(
            FunctionName=LAMBDA_FUNCTION_NAME,
            Runtime='python3.11',
            Role=role_arn,
            Handler='lambda_handler.handler',
            Code={'ZipFile': zip_content},
            Description='UBIKAIS API - Korean Aviation Data',
            Timeout=30,
            MemorySize=256,
            Environment={
                'Variables': {
                    'S3_BUCKET': S3_BUCKET_NAME,
                    'S3_DB_KEY': 'ubikais_full.db'
                }
            }
        )
        print(f"[OK] Lambda 함수 생성 완료")


def create_api_gateway():
    """API Gateway 생성"""
    print(f"[INFO] API Gateway 생성: {API_NAME}")

    try:
        # REST API 생성
        api = apigateway_client.create_rest_api(
            name=API_NAME,
            description='UBIKAIS API - Korean Aviation Data',
            endpointConfiguration={'types': ['REGIONAL']}
        )
        api_id = api['id']
        print(f"[OK] API 생성: {api_id}")

        # 루트 리소스 조회
        resources = apigateway_client.get_resources(restApiId=api_id)
        root_id = resources['items'][0]['id']

        # proxy 리소스 생성 ({proxy+})
        proxy = apigateway_client.create_resource(
            restApiId=api_id,
            parentId=root_id,
            pathPart='{proxy+}'
        )
        proxy_id = proxy['id']

        # Lambda ARN
        lambda_arn = f"arn:aws:lambda:{AWS_REGION}:{boto3.client('sts').get_caller_identity()['Account']}:function:{LAMBDA_FUNCTION_NAME}"

        # ANY 메서드 생성 (Lambda 프록시 통합)
        apigateway_client.put_method(
            restApiId=api_id,
            resourceId=proxy_id,
            httpMethod='ANY',
            authorizationType='NONE'
        )

        apigateway_client.put_integration(
            restApiId=api_id,
            resourceId=proxy_id,
            httpMethod='ANY',
            type='AWS_PROXY',
            integrationHttpMethod='POST',
            uri=f'arn:aws:apigateway:{AWS_REGION}:lambda:path/2015-03-31/functions/{lambda_arn}/invocations'
        )

        # Lambda 권한 추가
        lambda_client.add_permission(
            FunctionName=LAMBDA_FUNCTION_NAME,
            StatementId=f'apigateway-{api_id}',
            Action='lambda:InvokeFunction',
            Principal='apigateway.amazonaws.com',
            SourceArn=f'arn:aws:execute-api:{AWS_REGION}:*:{api_id}/*/*'
        )

        # 배포
        apigateway_client.create_deployment(
            restApiId=api_id,
            stageName='prod'
        )

        api_url = f"https://{api_id}.execute-api.{AWS_REGION}.amazonaws.com/prod"
        print(f"[OK] API Gateway 배포 완료")
        print(f"[URL] {api_url}")

        return api_url

    except Exception as e:
        print(f"[ERROR] API Gateway 생성 오류: {e}")
        return None


def create_crawler_schedule():
    """CloudWatch Events로 크롤러 스케줄 생성"""
    print("[INFO] 크롤러 스케줄 설정 (1시간마다)")

    try:
        # EventBridge 규칙 생성
        rule_name = 'ubikais-crawler-schedule'

        events_client.put_rule(
            Name=rule_name,
            ScheduleExpression='rate(1 hour)',
            State='ENABLED',
            Description='UBIKAIS Crawler - Every Hour'
        )

        print(f"[OK] 스케줄 규칙 생성: {rule_name}")

    except Exception as e:
        print(f"[ERROR] 스케줄 생성 오류: {e}")


def deploy():
    """전체 배포 실행"""
    print("\n" + "="*60)
    print("UBIKAIS API AWS 배포")
    print("="*60 + "\n")

    # 1. S3 버킷 생성
    create_s3_bucket()

    # 2. Lambda 함수 생성/업데이트
    create_or_update_lambda()

    # 3. API Gateway 생성
    api_url = create_api_gateway()

    # 4. 크롤러 스케줄 설정
    create_crawler_schedule()

    print("\n" + "="*60)
    print("[COMPLETE] 배포 완료!")
    print("="*60)

    if api_url:
        print(f"\nAPI Endpoints:")
        print(f"  - {api_url}/api/flights")
        print(f"  - {api_url}/api/flights/route?callsign=KAL123")
        print(f"  - {api_url}/api/weather/metar/RKPU")
        print(f"  - {api_url}/api/notam")
        print(f"  - {api_url}/api/airports")


if __name__ == '__main__':
    deploy()
