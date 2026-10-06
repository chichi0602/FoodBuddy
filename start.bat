@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where dotnet >nul 2>nul || (echo [錯誤] 找不到 dotnet，請先安裝 .NET 8 SDK & pause & exit /b 1)
where npm >nul 2>nul || (echo [錯誤] 找不到 npm，請先安裝 Node.js & pause & exit /b 1)

if not exist "client\node_modules" (
  echo 第一次啟動，安裝前端套件中...
  pushd client
  call npm install || (popd & echo [錯誤] npm install 失敗 & pause & exit /b 1)
  popd
)

echo 啟動後端 http://localhost:5122 ...
start "FoodBuddy 後端" /d "%~dp0server\FoodBuddy.Api" cmd /k dotnet run --launch-profile http

echo 啟動前端 http://localhost:5173 ...
start "FoodBuddy 前端" /d "%~dp0client" cmd /k npm run dev

echo 等待前端就緒...
:wait
timeout /t 1 /nobreak >nul
curl -s -o nul http://localhost:5173 || goto wait

start "" http://localhost:5173
echo 已開啟瀏覽器。要關閉系統，請關掉「FoodBuddy 後端」與「FoodBuddy 前端」兩個視窗。
timeout /t 5 >nul
