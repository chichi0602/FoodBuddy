# Web API 端點目錄

- 文件狀態：維護中
- 對應階段：Phase 9
- 最後核對日期：2026/10/22

後端 `server/FoodBuddy.Api`，開發時位址 `http://localhost:5122`。JSON 一律 camelCase。
**登入**：Phase 9 起以 HttpOnly Cookie（`FoodBuddy.Auth`）記住登入。除了 `/api/health`、`/api/auth/providers`、`register`、`login`、`logout`、`google`，其他端點都要登入，未登入回 401（不轉址）。
錯誤回應格式：`{ "message": "給使用者看的中文訊息" }`。

## GET /api/health

確認後端是否運作、AI 設定是否齊全。**不回傳任何金鑰內容。**

```json
{ "status": "ok", "aiConfigured": true }
```

## 帳號（/api/auth）

| 端點 | 說明 | 回應 |
|------|------|------|
| `GET /api/auth/providers` | 可用的登入方式 | `{ "google": false }` |
| `POST /api/auth/register` | `{ email, password, displayName? }`；成功後直接登入 | 200 使用者資訊；400 `{ message }`（Email 重複、密碼太短…） |
| `POST /api/auth/login` | `{ email, password }` | 200 使用者資訊；401 帳密錯誤、鎖定中、Google 帳號 |
| `POST /api/auth/logout` | 登出 | 204 |
| `GET /api/auth/me` | 目前登入的使用者 | 200 使用者資訊；401 未登入 |
| `DELETE /api/auth/account` | 刪除帳號與伺服器上所有資料 | 204 |
| `GET /api/auth/google` | 導到 Google 登入（後端有設定才啟用，否則 404） | 302 |
| `GET /api/auth/google/callback` | Google 登入完成後回來，建立或連結帳號 | 302 到 `/`；失敗到 `/login?error=google` |

使用者資訊：`{ id, email, displayName, hasPassword, logins: ["Google"] }`。Google 的 OAuth 回呼路徑是 `/signin-google`（由驗證中介軟體處理）。

## POST /api/sync

雙向同步（Phase 9）。先寫入前端送來的變更，再回傳 `since` 之後的變更。

請求：

| 欄位 | 說明 |
|------|------|
| since | 上次同步拿到的 cursor，第一次為 0 |
| changes | 最多 500 筆：`{ collection, id, data, deleted, updatedAt }`；collection 只能是 places、userPlaces、visits、tags、searchHistory、dismissed；updatedAt 為本機修改時間（毫秒） |

回應：`{ cursor, hasMore, changes: [...] }`

- changes 的格式同請求，一次最多 300 筆。hasMore 為 true 時用新的 cursor 再呼叫一次。
- 這次剛寫入的資料不會傳回。
- updatedAt 比伺服器舊的修改不寫入，伺服器版本會傳回給送出的裝置。

| 狀態碼 | 情況 |
|------|------|
| 200 | 成功 |
| 400 | collection 不允許、資料格式錯誤、單筆超過 4MB、帳號超過 20000 筆 |
| 401 | 未登入，或帳號已被刪除 |
| 413 | 請求超過 20MB |

## POST /api/ai/parse

把自然語言需求解析成條件。同一句需求 1 小時內直接回傳快取結果。

請求：`{ "query": "幫我找高雄左營附近，適合三個人晚餐，每人 500 元左右的日式料理。" }`

回應：

```json
{
  "conditions": {
    "summary": "尋找高雄市左營區附近適合三人晚餐、每人預算約 500 元的日式料理。",
    "country": null, "city": "高雄市", "district": "左營區", "landmark": null,
    "cuisines": ["日式"], "mealTime": "dinner", "people": 3, "budgetPerPerson": 500,
    "keywords": []
  },
  "mock": false
}
```

`mealTime`：`breakfast`／`lunch`／`teatime`／`dinner`／`lateNight`／`null`。

## POST /api/ai/recommend

從 OpenStreetMap 取得範圍內真實店家與範圍內的收藏，交給 AI 挑選分析。
同一個請求（內容完全相同）10 分鐘內直接回傳快取結果；「換一批」帶入不同的 excludeNames，不會命中。

請求：

| 欄位 | 必填 | 說明 |
|------|------|------|
| query | ✅ | 原始需求 |
| conditions | ✅ | `/parse` 的結果（可由使用者移除部分條件） |
| excludeNames | | 要排除的店名（「換一批」用） |
| origin | | `{ lat, lng }`，條件沒有地點時的搜尋中心 |
| profile | | 口味摘要：topCuisines[{name,count}]、preferredPriceRanges、highRated、dislikedCuisines、dislikedNames、topDistricts、visitCount、totalSaved |
| savedPlaces | | 收藏清單：id、name、lat、lng、city、district、cuisines、statuses、rating、priceRange |
| excludeIds | | 沒興趣的 OpenStreetMap id（Phase 8） |
| onlyUnvisitedSaved | | true 時收藏區只看還沒去過的店，並列出範圍內全部（為你推薦使用） |

回應：

```json
{
  "recommendations": [{
    "id": "node/1710193301", "name": "石精臼牛肉湯",
    "city": "台南市", "district": "中西區", "address": "臺南市中西區民族路二段246號",
    "lat": 22.99, "lng": 120.20, "distanceMeters": 747,
    "openingHours": "…", "phone": "+886 6 223 2266", "website": null,
    "placeType": "餐廳", "cuisines": ["台式", "牛肉湯"], "priceRange": null, "estimatedPricePerPerson": null,
    "reputation": "台南知名的傳統牛肉湯店…", "recommendedDishes": ["牛肉湯"],
    "reason": "…", "pros": ["…"], "cons": ["…"], "suitableFor": null,
    "preferenceReason": null, "matchScore": 96,
    "score": 82,
    "scoreBreakdown": [{ "key": "match", "label": "需求符合度", "points": 38, "max": 40, "note": "AI 判斷符合這次需求的程度 96/100" }, "…共六項"]
  }],
  "saved": [{ "placeId": "本機店家 id", "reason": "你之前收藏的這間…", "matchScore": 96 }],
  "mock": false,
  "area": { "lat": 22.99, "lng": 120.21, "label": "中西區", "radiusMeters": 2500 },
  "candidateCount": 40,
  "message": "範圍內符合條件的店家較少，只找到 2 間。可以放寬條件或換個地點。"
}
```

- `recommendations` 只包含使用者尚未收藏的新店，依 `score` 排序（公式見 [為你推薦 PRD](../prd/為你推薦-prd.md)）；`preferenceReason` 有值的放「根據你的口味推薦」，否則放「AI 網路探索」。
- `saved` 的 `placeId` 是前端 IndexedDB 的店家 id。
- `area.label` 為 `目前位置` 時表示用 `origin` 搜尋。

| 狀態碼 | 情況 |
|------|------|
| 200 | 成功（可能 0 筆，看 `message`） |
| 400 | 需求空白或超過 500 字、座標不正確、沒有地點也沒有 origin、地點找不到 |
| 502 | Azure OpenAI 或 OpenStreetMap 失敗 |

## POST /api/ai/for-you

首頁「為你推薦」（Phase 8）：依口味推薦還沒去過的店。

請求：`{ city, district, origin, profile, savedPlaces, excludeNames, excludeIds }`（city／district 或 origin 擇一）

- 以 profile 中權重 ≥ 2 的前 3 名料理當條件，重用 `/recommend` 的流程（`onlyUnvisitedSaved: true`）
- 回應格式同 `/recommend`；`saved` 為範圍內還沒去過的收藏（AI 有挑中的附 AI 評語）

| 狀態碼 | 情況 |
|------|------|
| 200 | 成功 |
| 400 | 沒有 profile（喜歡的店不足 3 間）、座標不正確、地點找不到 |
| 502 | AI 或地圖服務失敗 |

## POST /api/ai/taste-insight

依收藏與到訪紀錄寫一段口味觀察（Phase 7）。

請求：

| 欄位 | 說明 |
|------|------|
| profile | 口味摘要（可為 null，例如喜歡的店少於 3 間） |
| stats | `{ totalSaved, visitedPlaces, visitCount, averageRating }` |
| visits | 到訪清單：placeName、cuisines、area、visitedAt、rating、wouldRevisit、dishes（伺服器只取前 100 筆）；**不含心得、同行人、金額、照片** |
| notRecommended | 標為不推薦的店名；AI 不會建議再去這些店 |

回應：`{ "insight": { "summary": "…", "highlights": ["…"], "suggestions": ["…"] }, "mock": false }`

| 狀態碼 | 情況 |
|------|------|
| 200 | 成功 |
| 400 | 沒有任何收藏（totalSaved 為 0） |
| 502 | AI 服務失敗 |

## POST /api/geo/geocode

用地址或店名找店家座標（OpenStreetMap Nominatim），給編輯頁與地圖頁的「補座標」使用。

請求：`{ "name": "守賀家庭式和風定食料理", "address": "813高雄市左營區孟子路587號", "city": "高雄市", "district": "左營區", "country": "台灣" }`（name 與 address 至少一個）

回應：

```json
{ "lat": 22.6773313, "lng": 120.3044965, "displayName": "守賀家庭式和風定食料理, 587, 孟子路, …", "matchedBy": "address" }
```

- 依序嘗試：轉換後的台灣地址（`孟子路 587, 左營區, 高雄市`）→ 原始地址 → 「店名, 行政區, 城市」。
- 只接受精確到街道以下的結果（Nominatim `place_rank ≥ 26`）。
- `matchedBy` 為 `name` 時位置可能是同名的別間店，畫面會提醒使用者確認。

| 狀態碼 | 情況 |
|------|------|
| 200 | 找到 |
| 400 | name 與 address 都沒有 |
| 404 | 找不到，或只找到行政區等粗略位置 |
| 502 | 地點查詢服務失敗 |

## POST /api/dev/benchmark

開發用：比較多個 Azure OpenAI 部署的速度與結果（AI 找美食加速）。**只在 Development 環境可用**。

- 比較的部署：`Deployment` 加上設定 `AzureOpenAI:BenchmarkDeployments`（見 [金鑰與設定檔](../operations/金鑰與設定檔.md)）
- 固定 3 句需求；每個部署跑 1 次解析、2 次挑店，用同一份地圖候選店家
- 請求：無 body

回應：每個部署一筆 `{ deployment, avgParseSeconds, avgRankSeconds, parse: [...], rank: [...] }`；rank 每筆含 avgSeconds、token 數、picks、names、firstReason、error。不含金鑰。

| 狀態碼 | 情況 |
|------|------|
| 200 | 成功（個別部署失敗會寫在該筆的 error） |
| 400 | 示範模式，沒有可比較的部署 |
| 404 | 非 Development 環境 |

> 返回 [architecture 索引](README.md)
