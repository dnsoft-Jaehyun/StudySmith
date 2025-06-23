@echo off
echo ChromaDB 마이그레이션 도구 설치 및 실행
echo =======================================

REM ChromaDB 마이그레이션 도구 설치
echo ChromaDB 마이그레이션 도구 설치 중...
pip install chroma-migrate

REM 환경 변수 설정 - 마이그레이션 관련
set SOURCE_DIR=./chroma_db
set TARGET_DIR=./chroma_db_new

REM 대상 디렉토리 확인 및 생성
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

echo 소스 디렉토리: %SOURCE_DIR%
echo 대상 디렉토리: %TARGET_DIR%

echo ChromaDB 데이터 마이그레이션 시작 중...
echo (이 작업은 데이터 양에 따라 시간이 걸릴 수 있습니다)

REM ChromaDB 마이그레이션 실행
chroma-migrate migrate --source-directory %SOURCE_DIR% --target-directory %TARGET_DIR%

echo.
echo 마이그레이션이 완료되었습니다.
echo 새 설정으로 ChromaDB를 사용하려면 다음을 참고하세요:
echo 1. chroma_config.yaml 파일에서 persist_directory를 %TARGET_DIR%로 변경하세요.
echo 2. src/chroma.ts 파일에서 경로를 새로운 방식으로 지정하세요:
echo    const chroma = new ChromaClient({
echo      path: "http://localhost:8001"
echo    });

pause

./start-chroma-ts.bat 