@echo off
echo Installing required packages for browser compatibility...

echo Installing process polyfill...
npm install process@^0.11.10

echo Installing buffer polyfill...
npm install buffer@^6.0.3

echo Installation complete!
echo.
echo Now you can run:
echo   npm run build
echo   npm run client:dev
echo.
echo Or start the full application:
echo   npm run start:all
echo.
pause
