# 文件目錄索引

- 文件狀態：維護中
- 對應階段：Phase 5
- 最後核對日期：2026/10/06

本目錄收錄 FoodBuddy（AI 美食紀錄與探索系統）的需求、開發紀錄、功能說明、架構與操作文件。
文件依「特性」分類到下列子目錄；新增文件時先歸入既有分類，沒有適用的分類才新增語意明確的子目錄，並同步更新本檔。

## 分類規則

| 目錄 | 收納特性 | 範例 |
|------|----------|------|
| [`planning/`](planning/README.md) | 需求、規劃、路線圖 | 需求 Agenda、開發路線圖 |
| [`changelog/`](changelog/README.md) | 每個開發步驟的紀錄：怎麼做的、做了哪些決定、踩到什麼、怎麼驗證 | Phase 1～5 各一篇 |
| [`prd/`](prd/README.md) | 產品能力的**現況**說明（以程式碼為準） | 我的美食、篩選、AI 找美食 |
| [`architecture/`](architecture/README.md) | 系統架構、資料模型、API、設計系統 | 架構總覽、Web API 端點目錄 |
| [`operations/`](operations/README.md) | 啟動、設定檔、金鑰 | 啟動與停止系統、金鑰與設定檔 |
| [`guides/`](guides/README.md) | 操作說明（寫給使用者） | 系統使用說明 |

> 每個子目錄都有自己的 `README.md` 作為該目錄索引。

## 各分類文件

### planning — 需求與規劃
- [AI 美食紀錄與探索系統 — 需求 Agenda](planning/AI美食紀錄與探索系統-需求Agenda.md)（所有開發的起點）
- [開發路線圖](planning/開發路線圖.md)（Phase 0～8 進度與對應紀錄）

### changelog — 開發紀錄
- [Phase 5：AI 搜尋同時參考個人收藏](changelog/2026-10-06-Phase5-AI參考個人收藏.md)
- [Phase 4：串接 OpenStreetMap 真實店家](changelog/2026-10-06-Phase4-串接OpenStreetMap.md)
- [Phase 3：AI 自然語言搜尋](changelog/2026-10-06-Phase3-AI自然語言搜尋.md)
- [金鑰改用 .NET User Secrets](changelog/2026-10-06-金鑰改用UserSecrets.md)
- [Phase 2：分類、搜尋、篩選](changelog/2026-10-06-Phase2-分類搜尋篩選.md)
- [Phase 1：我的美食（含配色與字型）](changelog/2026-10-06-Phase1-我的美食.md)
- [Step 0：專案骨架與文件](changelog/2026-10-06-Step0-專案骨架與文件.md)

### prd — 產品能力現況
- [首頁與導覽](prd/首頁與導覽-prd.md)
- [我的美食](prd/我的美食-prd.md)
- [美食分類與篩選](prd/美食分類與篩選-prd.md)
- [AI 找美食](prd/AI找美食-prd.md)

### architecture — 架構與設計
- [架構總覽](architecture/架構總覽.md)
- [資料模型](architecture/資料模型.md)
- [Web API 端點目錄](architecture/Web%20API%20端點目錄.md)
- [設計系統（配色與字型）](architecture/設計系統.md)

### operations — 啟動與設定
- [啟動與停止系統](operations/啟動與停止系統.md)
- [金鑰與設定檔](operations/金鑰與設定檔.md)

### guides — 使用說明
- [系統使用說明](guides/系統使用說明.md)（寫給使用者）

## 維護規則

- **每完成一個 Phase**：新增一篇 `changelog/`、更新相關 `prd/`、更新 [開發路線圖](planning/開發路線圖.md) 的狀態與 commit，必要時更新 `architecture/` 與 `guides/`。
- `prd/` 只寫**已實作**的現況；還沒做的放在各 PRD 的「規劃中」區塊，不可混在現況描述裡。
- `changelog/` 記錄當時的決定與原因，事後不改寫歷史；能力現況以 `prd/` 為準。
- 每篇開頭保留「文件狀態／對應階段／最後核對日期」三行，修改內容時一併更新日期。
- 檔案一律 UTF-8，連結使用相對路徑。

> 返回 [專案 README](../README.md)
