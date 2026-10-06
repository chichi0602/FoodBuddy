# FoodBuddy 美食夥伴

個人美食收藏 + AI 美食探索。需求文件見 [docs/food-ai-system.md](docs/food-ai-system.md)。

- `client/`：React + Vite + TypeScript + Ant Design，資料存在瀏覽器 IndexedDB
- `server/FoodBuddy.Api/`：ASP.NET Core Web API（.NET 8），代理 Azure OpenAI

## 啟動

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

在 `server/FoodBuddy.Api/appsettings.Development.json`（已加入 .gitignore）填入：

```json
"AzureOpenAI": {
  "Endpoint": "https://<your-resource>.openai.azure.com/",
  "ApiKey": "<your-api-key>",
  "Deployment": "<your-deployment-name>"
}
```

AI 功能於 Phase 3 加入；未填金鑰時會使用模擬資料。
