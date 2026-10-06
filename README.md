# FoodBuddy 美食夥伴

個人美食收藏 + AI 美食探索。需求文件見 [docs/food-ai-system.md](docs/food-ai-system.md)。

- `client/`：React + Vite + TypeScript + Ant Design，資料存在瀏覽器 IndexedDB
- `server/FoodBuddy.Api/`：ASP.NET Core Web API（.NET 8），代理 Azure OpenAI

## 啟動

**快速啟動（Windows）**：雙擊專案根目錄的 `start.bat`，會自動開兩個視窗分別跑後端與前端，並開啟瀏覽器 http://localhost:5173。關閉兩個視窗即停止系統。

手動啟動：

```bash
# 後端（http://localhost:5122）
cd server/FoodBuddy.Api
dotnet run --launch-profile http

# 前端（http://localhost:5173，/api 會轉發到後端）
cd client
npm install
npm run dev
```

## Azure OpenAI 設定

金鑰使用 [.NET User Secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets) 存放，檔案在專案資料夾外，不會進 git。開發環境（Development）啟動時會自動讀取。

**方法一：直接編輯 secrets.json**

`%APPDATA%\Microsoft\UserSecrets\61fdfd9c-d88f-4efe-b8f9-20e5fd73fb71\secrets.json`

```json
{
  "AzureOpenAI": {
    "Endpoint": "https://<your-resource>.openai.azure.com/",
    "ApiKey": "<your-api-key>",
    "Deployment": "<your-deployment-name>"
  }
}
```

**方法二：用指令設定**

```bash
cd server/FoodBuddy.Api
dotnet user-secrets set "AzureOpenAI:Endpoint" "https://<your-resource>.openai.azure.com/"
dotnet user-secrets set "AzureOpenAI:ApiKey" "<your-api-key>"
dotnet user-secrets set "AzureOpenAI:Deployment" "<your-deployment-name>"
dotnet user-secrets list   # 確認設定
```

設定好後啟動後端，開啟 http://localhost:5122/api/health，`aiConfigured` 為 `true` 代表已讀到設定。

AI 功能於 Phase 3 加入；未填金鑰時會使用模擬資料。
