# chris-project

這是一個「車旅所」接送車資試算頁。目標是讓使用者輸入出發地、選擇抵達機場和車型後，可以估算接送距離與價格。

目前主要測試頁：

```text
https://flourishing-narwhal-f3b2fe.netlify.app/google.html
```

## 現在可以做什麼

- 輸入出發地址或地標。
- 顯示 Google 找到的候選地點。
- 讓使用者選擇正確地點。
- 選擇抵達機場。
- 選擇車型與加購項目。
- 桃園機場價目依目前的行政區價目表計算，其他行程按每公里 NT$20、最低 NT$800 計算。
- 桃園機場接送依上／下車行政區、接送方向與車型查詢固定價；其他行程則依 Google 開車路線距離試算。

## 為什麼要用 Google 版

地址搜尋如果只靠免費地圖資料，台灣地址有時會找不到或定位不準。Google 版的目標是讓使用者更容易選到正確地點，距離也比較接近實際開車路線。

## API key 安全

Google Maps API key 不會寫在網頁裡，也不會放在 GitHub。

目前做法是：

```text
使用者的瀏覽器
  -> 呼叫我們自己的網站
  -> 網站後端再去問 Google
```

所以一般使用者打開網頁時，看不到真正的 Google key。

## 誰需要看哪份文件

- `README.md`：給一般人、非工程背景的人快速理解這個專案。
- `AGENTS.md`：給 Jay 和協助改程式的 AI / 工程人員看，裡面會放比較細的技術規則。

如果只是想知道這個網站在做什麼，看這份 README 就好。

## 如何試用

打開：

```text
https://flourishing-narwhal-f3b2fe.netlify.app/google.html
```

測試流程：

1. 在「出發地址」輸入地點，例如：台北101。
2. 從 Google 候選地點中選一個正確的。
3. 選擇抵達機場。
4. 選擇車型。
5. 看下方試算結果。

如果搜尋不到地點，通常不是你操作錯，而是 Google key、Google API 或 Netlify 設定需要檢查。

## 目前部署在哪裡

網站部署在 Netlify：

```text
https://flourishing-narwhal-f3b2fe.netlify.app/
```

程式碼放在 GitHub：

```text
https://github.com/yseyableach/chris-project
```

每次 GitHub 更新後，Netlify 會重新部署網站。

## Netlify 需要設定什麼

Netlify 需要放一個 Google Maps key。這個值只放在 Netlify 後台，不要貼到 GitHub。

變數名稱是：

```text
GOOGLE_MAPS_API_KEY
```

這個變數至少要套用到：

- Production
- Functions

改完 Netlify 設定後，要重新部署一次網站。

## Google Cloud 需要開什麼

Google Cloud 的 key 需要可以使用：

- Places API
- Routes API

也需要確認 Google Cloud 專案有啟用 billing。

## 常見狀況

### 網頁打開了，但搜尋地點失敗

通常是 Google key、Places API、Netlify 環境變數或 billing 設定還沒好。

### 地點可以選，但距離算不出來

通常是 Routes API 沒有啟用，或 Google key 沒有允許 Routes API。

### Netlify 後台改了 key，但網站還是不行

改完環境變數後，通常需要重新部署一次。

### 直接打開電腦裡的 `google.html` 不會動

這是正常的。Google 版需要透過 Netlify 或本機 server 才能正常呼叫後端。

## 目前還不是正式產品

這個網站目前是測試版，重點是先確認：

- Google 地址搜尋可以用。
- 使用者可以選到正確地點。
- 開車距離可以算出來。
- 車資邏輯可以跑通。

正式上線前，價格規則、錯誤提示、訂單流程和付款流程都還可以再整理。
