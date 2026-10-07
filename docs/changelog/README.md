# changelog — 開發紀錄

- 文件狀態：維護中
- 對應階段：Phase 8
- 最後核對日期：2026/10/07

本目錄每篇對應一個開發步驟（每個 Phase 與每個小修正都要有一篇），記錄**當時**做了什麼、為什麼這樣做、踩到什麼問題、怎麼驗證。
能力的最新現況以 [prd/](../prd/README.md) 為準。

| 變更（新到舊） | 文件 | Commit |
|------|------|------|
| Phase 8：首頁為你推薦、推薦分數與明細、沒興趣清單 | [Phase8-AI個人化推薦](2026-10-07-Phase8-AI個人化推薦.md) | 待 commit |
| Phase 7：到訪紀錄、店家狀態與評分同步、口味統計、AI 口味分析 | [Phase7-到訪與口味統計](2026-10-06-Phase7-到訪與口味統計.md) | `1d9ed1e` |
| Phase 6：地圖頁、AI 結果地圖、用地址找座標 | [Phase6-地圖呈現](2026-10-06-Phase6-地圖呈現.md) | `bce5bfc` |
| Phase 5：AI 推薦同時參考收藏與口味，結果分成三區 | [Phase5-AI參考個人收藏](2026-10-06-Phase5-AI參考個人收藏.md) | `cab5e16` |
| Phase 4：改用 OpenStreetMap 真實店家，AI 只能從中挑選 | [Phase4-串接OpenStreetMap](2026-10-06-Phase4-串接OpenStreetMap.md) | `33129f7` |
| Phase 3：AI 解析自然語言需求並推薦店家 | [Phase3-AI自然語言搜尋](2026-10-06-Phase3-AI自然語言搜尋.md) | `ba1245f` |
| Azure OpenAI 金鑰改放 .NET User Secrets | [金鑰改用UserSecrets](2026-10-06-金鑰改用UserSecrets.md) | `6b5999c` |
| Phase 2：篩選面板、附近、排序、Tag 管理 | [Phase2-分類搜尋篩選](2026-10-06-Phase2-分類搜尋篩選.md) | `dbbf7ec` |
| Phase 1：我的美食新增／編輯／刪除、狀態與評分；配色與粉圓體 | [Phase1-我的美食](2026-10-06-Phase1-我的美食.md) | `dfe737f` |
| Step 0：需求文件、前後端骨架、主題與版面 | [Step0-專案骨架與文件](2026-10-06-Step0-專案骨架與文件.md) | `dfe737f` |

## 每篇的固定結構

1. 變更目的
2. 與使用者確認的決策
3. 怎麼生成（步驟、主要檔案）
4. 功能介紹
5. ⚠️ 踩到的問題與修正
6. 刻意的取捨與已知限制
7. 驗證結果
8. 相關 commit

> 返回 [文件總索引](../README.md)
