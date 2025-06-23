@echo off
setlocal enableextensions enabledelayedexpansion

:: 컬러 텍스트 설정
set BLUE=[94m
set GREEN=[92m
set YELLOW=[93m
set RED=[91m
set RESET=[0m

:: 제목 출력
echo %BLUE%=============================================%RESET%
echo %BLUE%    교육용 대화 앱 실행 스크립트 v1.1%RESET%
echo %BLUE%=============================================%RESET%

:: 노드 버전 확인
echo %YELLOW%노드 버전 확인 중...%RESET%
node --version > nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo %RED%오류: Node.js가 설치되어 있지 않습니다.%RESET%
  echo Node.js를 설치한 후 다시 시도하세요.
  pause
  exit /b 1
)

:: 변수 설정
set NODE_OPTIONS=--max-old-space-size=4096 --max-http-header-size=16384

:: 시스템 정보 출력
echo %YELLOW%시스템 정보 수집 중...%RESET%
for /f "tokens=2 delims==" %%a in ('wmic os get TotalVisibleMemorySize /value') do set /a MEM_KB=%%a
set /a MEM_MB=%MEM_KB% / 1024
set /a MEM_GB=%MEM_MB% / 1024
echo 사용 가능한 메모리: %GREEN%%MEM_MB%MB (%MEM_GB%GB)%RESET%
echo Node 메모리 제한: %GREEN%4096MB%RESET%

:: 워커 스레드 수 설정 (CPU 코어 수, 최대 6개)
for /f "tokens=2 delims==" %%a in ('wmic cpu get NumberOfCores /value') do set CPU_CORES=%%a
if %CPU_CORES% GTR 6 (
  set WORKER_THREADS=6
) else (
  set WORKER_THREADS=%CPU_CORES%
)
echo CPU 코어 수: %GREEN%%CPU_CORES%%RESET%
echo PDF 처리용 워커 스레드: %GREEN%%WORKER_THREADS%%RESET%

:: 병렬 처리 관련 환경 변수 설정
set PDF_PARALLEL_PROCESSING=true
set PDF_MAX_WORKERS=%WORKER_THREADS%
set PDF_BATCH_SIZE=10

:: 환경 변수 설정
echo %YELLOW%환경 변수 설정 중...%RESET%
set DEBUG=false
set PORT=3000
set CHROMA_SERVER_PORT=8001

:: 의존성 확인
echo %YELLOW%의존성 확인 중...%RESET%
if not exist node_modules (
  echo 노드 모듈이 설치되어 있지 않습니다. 설치를 시작합니다...
  call npm install
  if %ERRORLEVEL% neq 0 (
    echo %RED%오류: npm 의존성 설치 실패%RESET%
    pause
    exit /b 1
  )
)

:: 빌드 확인
echo %YELLOW%빌드 확인 중...%RESET%
if not exist dist (
  echo TypeScript 빌드가 필요합니다. 빌드를 시작합니다...
  call npx tsc
  if %ERRORLEVEL% neq 0 (
    echo %RED%오류: TypeScript 빌드 실패%RESET%
    pause
    exit /b 1
  )
)

echo %GREEN%모든 준비가 완료되었습니다. 애플리케이션을 시작합니다...%RESET%
echo.

:: 애플리케이션 실행
echo %BLUE%=============================================%RESET%
echo %BLUE%    교육용 대화 앱이 실행 중입니다...%RESET%
echo %BLUE%=============================================%RESET%
echo.
echo 앱 접속 주소: %GREEN%http://localhost:3000%RESET%
echo 개발 서버는 변경 사항을 자동으로 감지합니다.
echo 종료하려면 이 창에서 Ctrl+C를 누르세요.
echo.

npx concurrently "npx tsc --watch" "npx nodemon --watch dist dist/index.js" "start /min cmd /c start-chroma.bat"

endlocal 