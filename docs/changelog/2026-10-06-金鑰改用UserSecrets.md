# 金鑰改用 .NET User Secrets

- 文件狀態：已實作
- 對應階段：Phase 2 與 Phase 3 之間
- 最後核對日期：2026/10/06

## 變更目的

使用者準備放入 Azure OpenAI 金鑰時詢問「要怎麼放 secret.json 讓 appsetting 讀取」。
Step 0 原本規劃金鑰放在 `appsettings.Development.json`（已 gitignore），但它仍在專案資料夾內，有誤推上 git 的風險。

## 與使用者確認的決策

- 兩個選項：「.NET User Secrets」或「專案內自訂 secret.json + AddJsonFile」→ 使用者選 **User Secrets**。

## 怎麼生成

1. 在 `server/FoodBuddy.Api` 執行 `dotnet user-secrets init`，[FoodBuddy.Api.csproj](../../server/FoodBuddy.Api/FoodBuddy.Api.csproj) 加上 `<UserSecretsId>61fdfd9c-…</UserSecretsId>`。這只是資料夾編號，不是秘密，可以 commit。
2. 在 `%APPDATA%\Microsoft\UserSecrets\<id>\secrets.json` 建立欄位留空的範本。
3. `appsettings.Development.json` 拿掉 `AzureOpenAI` 區塊，金鑰只放一個地方。
4. 刪除 `appsettings.Example.json`，改在 README 與 [金鑰與設定檔](../operations/金鑰與設定檔.md) 說明。
5. `GET /api/health` 多回傳 `aiConfigured`，只判斷三個欄位是否都有值，**不回傳任何金鑰內容**。

ASP.NET Core 在 Development 環境會自動載入 User Secrets，而且優先於 appsettings，所以 Program.cs 不需要額外程式。

## 驗證

- 用假值 `dotnet user-secrets set …` → 啟動 → `/api/health` 回 `aiConfigured: true`；清空後回 `false`。測完把檔案恢復成空白範本。
- `git status` 確認沒有任何金鑰進入版控。

## 相關 commit

- `6b5999c` 改用 .NET User Secrets 存放 Azure OpenAI 金鑰

> 返回 [changelog 索引](README.md)
