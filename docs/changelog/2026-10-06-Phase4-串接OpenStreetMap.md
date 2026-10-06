# Phase 4：串接 OpenStreetMap 真實店家

- 文件狀態：已實作
- 對應階段：Phase 4
- 最後核對日期：2026/10/06

## 變更目的

Phase 3 的推薦只靠模型知識，地址與價格可能過時，甚至可能推薦不存在的店。
依 Agenda 第 7 節流程「搜尋網路美食資訊 → 合併 → AI 分析」，改成**先從 OpenStreetMap 取得真實店家，再讓 AI 從中挑選與分析**。

## 與使用者確認的決策

| 問題 | 使用者的選擇 |
|------|------|
| OSM 找到的店不夠時 | **只用真實店家**，不足 5 間就少顯示，不用 AI 知識補 |
| 沒說地點或說「附近」 | **用瀏覽器定位**當搜尋中心；拒絕定位就請使用者補上地點 |

## 怎麼生成

### 先實測資料覆蓋度

開工前直接查詢 OSM，確認可行：

| 地區 | 範圍 | 有店名的店家 | 有料理標籤 | 有地址 | 查詢時間 |
|------|------|------|------|------|------|
| 高雄左營區 | 2.5 km | 240 | 122 | 88 | 4.5 秒 |
| 高雄巨蛋 | 1.5 km | 284 | 169 | 111 | 6.8 秒 |
| 台南中西區 | 2.5 km | 300 | 195 | 153 | 11.3 秒 |

覆蓋度足夠，連巷弄小店（石精臼牛肉湯、吉魯拉麵館）都有。同時發現 Overpass 偶爾回傳 XML 錯誤頁、`overpass.kumi.systems` 連不上 → 決定主站 `overpass-api.de`、備援 `overpass.private.coffee`、都失敗再重試主站一次。

### 後端

- [Services/Places/OsmPlaceSearchService.cs](../../server/FoodBuddy.Api/Services/Places/OsmPlaceSearchService.cs)
  - **Nominatim**：地名轉座標，依「地標 → 行政區＋城市 → 城市」由精確到粗略嘗試；遵守使用政策（可辨識的 User-Agent、每秒最多一次），快取 24 小時
  - **Overpass**：查詢範圍內 `amenity` 為 restaurant／cafe／fast_food／food_court／ice_cream／bar／pub 的店；範圍：地標或目前位置 1.5 km、行政區 2.5 km、只有城市 4 km；結果快取 30 分鐘
  - **料理對照**：中文分類對應 OSM `cuisine` 值與店名關鍵字（日式 → japanese／sushi／ramen…＋「壽司」「拉麵」「丼」）
  - **排序分數**：店名含使用者關鍵字（例如「牛肉湯」）> OSM 料理標籤相符 > 分類的一般店名提示 > 其他，再依距離；取前 40 間送給 AI
- [Services/RecommendationService.cs](../../server/FoodBuddy.Api/Services/RecommendationService.cs)：決定範圍 → 取得候選 → AI 挑選 → 合併真實資料
- **防止虛構的兩道保險**：
  1. 結構化輸出的 `candidateId` 用 **enum 限定為候選清單裡的 id**，模型在生成階段就無法產生清單外的店
  2. 伺服器端再檢查一次，不在清單中的 id 一律丟棄並記錄警告
- 店名、座標、地址、營業時間、電話、網站來自 OSM；評價、推薦餐點、推薦原因來自 AI（不認識的店就不寫）
- [Options/OsmOptions.cs](../../server/FoodBuddy.Api/Options/OsmOptions.cs) 與 `appsettings.json` 的 `Osm` 區塊
- 舊的「純 AI 知識推薦」移除，`IAiService` 改為 `RankAsync`

### 前端

- [AiSearchPage.tsx](../../client/src/pages/AiSearchPage.tsx)：條件沒有地點時先定位；顯示搜尋範圍（「以左營區為中心 2.5 公里內，找到 40 間相關店家」）；結果不足時顯示說明；頁尾 OSM 授權標示。
- [RecommendationCard.tsx](../../client/src/components/RecommendationCard.tsx)：「地圖已驗證」、距離、地址、營業時間、電話、官方網站。
- [aiMatch.ts](../../client/src/utils/aiMatch.ts)：加入收藏時保存座標、地址、營業時間、電話、網站；`findSaved` 加上「名稱互含且 100 公尺內」判斷；Google Maps 連結有地址用「店名＋地址」，沒有就用座標，避免連鎖店跳到別間分店。

## ⚠️ 踩到的問題與修正

- **台南牛肉湯只找到 1 間**，OSM 明明有石精臼牛肉湯：
  1. 「小吃」分類的店名提示（湯、飯、麵）太廣，前 60 間被一般店塞滿 → 改成分數排序，使用者關鍵字優先。
  2. AI 解析出的關鍵字是「**想吃**牛肉湯」，因為 schema 說明的範例就寫了「想吃牛肉湯」，模型照抄 → 範例改成「牛肉湯」並註明不要加動詞，伺服器端再去掉「想吃／想要／要吃」等字。
  修正後找到石精臼牛肉湯（含營業時間與電話）與杜牛肉湯，並誠實顯示「只找到 2 間」。
- **AI 的推薦理由出現「OSM 標籤」「候選清單」等系統用語** → 提示詞規定寫給使用者看的文字不得出現，距離改用「約 1.4 公里」這類說法。
- 第一次查詢花了 35 秒 → 候選從 60 間減為 40 間，降到約 20 秒。
- 測試時 5174 被使用者 `start.bat` 啟動的前端占用（5173 已被占用時 Vite 會自動往後跳），改用 5176，沒有動使用者的程式。

## 刻意的取捨與已知限制

- OSM 在城市、商圈、連鎖店較完整，巷弄小吃較少；很多店沒有地址。
- Nominatim 與 Overpass 是免費公益服務，忙碌時會失敗，畫面會請使用者稍後再試。
- 一次搜尋約 15～35 秒（查地圖 5～10 秒＋AI 10～25 秒），同地區 30 分鐘內再搜較快。

## 驗證

- 後端直接測試（真實 Azure OpenAI＋真實 OSM）：
  - 左營日式晚餐：5 間全部是 OSM 真實店家、id 都在候選清單內
  - 「想吃拉麵」＋定位：以目前位置為中心，最近一間 85 公尺
  - 沒有地點也沒有定位：回 400「請在需求中加上地點，或允許瀏覽器定位…」
- Playwright（Mock 與真實 AI）：搜尋範圍說明、卡片皆有地圖驗證與距離、OSM 授權標示、加入想去、詳細頁有經緯度與 Google Maps 連結、定位搜尋、拒絕定位提示、手機版牛肉湯結果。

## 相關 commit

- `33129f7` Phase 4: 串接 OpenStreetMap 真實店家

> 返回 [changelog 索引](README.md)
