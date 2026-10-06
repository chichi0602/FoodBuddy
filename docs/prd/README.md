# prd — 產品能力現況

- 文件狀態：維護中
- 對應階段：Phase 6
- 最後核對日期：2026/10/06

本目錄以「產品能力」為單位描述**目前程式實際的樣子**。「規劃中」一律獨立分區，不代表系統已提供。
內容以程式碼為準；需求原文見 [需求 Agenda](../planning/AI美食紀錄與探索系統-需求Agenda.md)，開發過程見 [changelog](../changelog/README.md)。

## 能力覆蓋矩陣

| 產品能力 | PRD | 路由 | 主要程式 | 狀態 |
|----------|-----|------|----------|------|
| 首頁與導覽 | [首頁與導覽](首頁與導覽-prd.md) | `/` | `HomePage.tsx`、`AppLayout.tsx` | 已實作 |
| 我的美食 | [我的美食](我的美食-prd.md) | `/my`、`/my/new`、`/my/:id`、`/my/:id/edit` | `MyFoodPage.tsx`、`PlaceFormPage.tsx`、`PlaceDetailPage.tsx`、`placeRepository.ts` | 已實作 |
| 美食分類與篩選（含 Tag 管理） | [美食分類與篩選](美食分類與篩選-prd.md) | `/my`、`/settings` | `FilterPanel.tsx`、`filterPlaces.ts`、`SettingsPage.tsx`、`tagRepository.ts` | 已實作 |
| AI 找美食 | [AI 找美食](AI找美食-prd.md) | `/ai` | `AiSearchPage.tsx`、`AiController`、`RecommendationService`、`OsmPlaceSearchService`、`AzureOpenAiService` | 已實作 |
| 地圖 | [地圖](地圖-prd.md) | `/map`、`/ai`（地圖模式） | `MapPage.tsx`、`FoodMap.tsx`、`MapPopups.tsx`、`GeoController` | 已實作 |
| 到訪紀錄 | — | `/visits` | `ComingSoonPage.tsx`（佔位） | 規劃中（Phase 7） |

> 返回 [文件總索引](../README.md)
