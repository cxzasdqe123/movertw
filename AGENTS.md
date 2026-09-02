# AGENTS.md

## 文件分工

- `README.md` 是給一般人看的，尤其是非工程背景的 Chris。保持簡短、白話、少放程式碼與 API 細節。
- `AGENTS.md` 是給 Jay、Codex、AI agent 或工程協作者看的。技術決策、安全規則、local 測試方式、不要踩的坑都寫在這裡。
- 如果要新增複雜技術說明，優先放在 `AGENTS.md`，不要把 README 變成工程文件。

## 專案定位

這是一個「租賃車／機場接送車資試算網站」。目前重點是可靠完成：

1. 使用者輸入地點。
2. 後端搜尋 Google 候選地點。
3. 使用者選定候選地點。
4. 後端用 Google Routes API 算開車距離。
5. 後端計算車資並回傳前端顯示。

這不是後台系統，也不是大型框架專案。請保持簡單。

## 目前架構

```text
google.html
  靜態前端。只呼叫本站 API，不直接呼叫 Google。

netlify/functions/places-search.mjs
  POST /api/places/search
  後端讀 GOOGLE_MAPS_API_KEY，呼叫 Google Places API。

netlify/functions/quote.mjs
  POST /api/quote
  後端讀 GOOGLE_MAPS_API_KEY，呼叫 Google Routes API，並計算車資。

netlify.toml
  將 /api/places/search 和 /api/quote rewrite 到 Netlify Functions。

scripts/dev-server.mjs
  本機模擬 Netlify Functions，用來 local 測試。
```

## 最重要的安全規則

- Google API key 絕對不能出現在 `index.html`、`google.html` 或任何前端 JS。
- Google API key 絕對不能 commit 到 GitHub。
- 前端不要使用 `maps.googleapis.com/maps/api/js?...key=...`。
- 前端不要要求使用者輸入 Google key。
- 前端不要把 Google key 放進 `localStorage` 或 `sessionStorage`。
- Google key 只能從後端讀取：`process.env.GOOGLE_MAPS_API_KEY`。
- 如果要新增 webhook、Sheet token、訂單 token，也同樣只能放後端 env。

如果你在瀏覽器 F12 的 Source、Network、Console、Storage 看到 `AIza...`，就是錯的。

## 不需要 Express

目前不需要另外寫 Express server。Netlify Functions 已經是本專案的小後端。

只有在未來需要長連線、複雜 session、資料庫常駐連線、排程或更完整 API gateway 時，才考慮搬到 Express / FastAPI / Cloud Run。

## 地點搜尋規則

- 使用者輸入地點後，必須顯示候選地點讓使用者選。
- 不要自動相信第一筆結果。
- 候選結果至少要包含：
  - `place_id`
  - `name`
  - `address`
  - `lat`
  - `lng`
- 前端送 `/api/quote` 時必須送已選候選地點，不要只送純文字地址。

目前 `places-search.mjs` 使用舊版 Google Places Text Search endpoint：

```text
https://maps.googleapis.com/maps/api/place/textsearch/json
```

這是因為 Google Cloud Console 裡的 `Places API` 限制已可用。若改成 Places API New endpoint，必須同步確認 Google Cloud API 與 key restrictions。

## 距離與報價規則

- 正式報價使用 Google Routes API 的開車距離。
- Routes API 的起點與機場優先使用 Google Place ID，避免裸經緯度被吸附到跑道、塔台或錯誤道路。
- 路線偏好使用 `TRAFFIC_AWARE_OPTIMAL`，讓結果更接近 Google Maps 「立即出發」的最佳路線。
- 不要用 Haversine 直線距離假裝正式報價。
- Google Routes 失敗時，應回傳錯誤或顯示需人工確認。
- 前端送來的價格不可信，後端必須重新計算。

目前基本價格邏輯：

```text
base_price = max(round(distance_km * 20), 799)
```

機場固定價優先，例如：

- 臺北市 / 台北市 -> TPE: 1100
- 文山區 -> TPE: 1300
- 汐止區 -> TPE: 1400
- 臺北市 / 台北市 -> TSA: 850

車型加價：

```text
comfort_4: +0
luxury_import: +500
business_7: +300
premium_7: +2000
```

加購：

```text
sign: +200
childSeat: +300
```

## 前端原則

- 保留目前深色、高級感、金色點綴的風格。
- 不要為了小改動重寫成 React/Vue。
- 不要把 UI 改成 landing page。第一屏就是可用試算工具。
- 地點搜尋後要讓使用者看得到候選名稱和地址。
- 中文輸入法 composition 期間不要干擾 input。

## Local 驗證

啟動：

```bash
GOOGLE_MAPS_API_KEY='<server-key>' node scripts/dev-server.mjs
```

開啟：

```text
http://127.0.0.1:8080/google.html
```

不要用 `file://` 開。

快速 API 測試：

```bash
curl -L -X POST http://127.0.0.1:8080/api/places/search \
  -H 'content-type: application/json' \
  --data '{"query":"台北101"}'
```

## Netlify 設定

Environment variable：

```text
GOOGLE_MAPS_API_KEY=<server-key>
```

必要條件：

- Context 至少填 Production。
- Scope 至少包含 Functions。
- 修改 env 後要重新 deploy。

Google Cloud key 設定：

```text
Application restrictions: None
API restrictions:
  - Places API
  - Routes API
Billing: enabled
```

## 上線後驗證

檢查 key 是否外露：

```bash
curl -L https://flourishing-narwhal-f3b2fe.netlify.app/google.html
```

不應該看到：

```text
AIza
GOOGLE_MAPS_API_KEY
apiKeyInput
google-maps-browser-key
maps.googleapis.com/maps/api/js
key=
```

功能測試：

```bash
curl -L -X POST https://flourishing-narwhal-f3b2fe.netlify.app/api/places/search \
  -H 'content-type: application/json' \
  --data '{"query":"台北101"}'
```

應回傳 `candidates`。

## 不要做的事

- 不要把 Google key 寫回前端。
- 不要在前端計算最終正式價格。
- 不要自動選第一個搜尋結果。
- 不要在 Google Routes 失敗時用直線距離充數。
- 不要加入大型框架或複雜後端，除非需求真的擴大。
- 不要刪掉現有機場接送、車型加價、加購邏輯，除非需求明確要求。
