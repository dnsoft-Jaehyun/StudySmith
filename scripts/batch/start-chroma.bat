@echo off
echo ChromaDB 서버 시작 중...

REM 현재 디렉토리 저장
set CURRENT_DIR=%CD%

REM 환경 변수 설정 (필요한 경우)
set CHROMA_PORT=8001
set CHROMA_HOST=localhost
set CHROMA_DATA_PATH=./chroma_ts_data

REM 데이터 디렉토리가 없으면 생성
if not exist "%CHROMA_DATA_PATH%" (
  echo 데이터 디렉토리 생성: %CHROMA_DATA_PATH%
  mkdir "%CHROMA_DATA_PATH%"
)

REM ChromaDB 서버 시작
echo ChromaDB 서버를 백그라운드에서 실행합니다... (데이터 경로: %CHROMA_DATA_PATH%)
start /B chroma run --path="%CHROMA_DATA_PATH%" --host=%CHROMA_HOST% --port=%CHROMA_PORT%

echo ChromaDB 서버 시작됨 (포트: %CHROMA_PORT%, 호스트: %CHROMA_HOST%)
echo 서버가 실행 중인 동안 이 창을 닫지 마세요.

pause 