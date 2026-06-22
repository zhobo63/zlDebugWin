# zlDebugWin

顯示 Log 的頁面、可以接收不同網路協議

## 功能

### 前端

| 功能 | 說明 |
|------|------|
| 清除 | 清空所有 Log 和監控資料 |
| 過濾 | 輸入文字，Log 包含要過濾的文字才顯示，不輸入全部顯示 |
| IP 過濾 | 輸入 IP，從輸入 IP 來的訊息才顯示，不輸入全部顯示 |
| 搜尋 | 輸入文字，尋找 Log 相符文字 |
| 搜尋按鈕 | 找下一個相符文字並高亮顯示 |

### 主區塊

- 主要顯示 Log 區域，可以捲動
- 顯示格式：**時間** | **IP** | **Log**
- Log 文字顏色使用資料格式裡的 Color
- 時間格式：`YYYY-MM-DD HH:MM:SS.MS`

### 監控區塊

- 位於主區塊右方
- 收到監控資料找到是否有相同 Key
  - **有**：更新 Value 資料
  - **沒有**：新增到監控區塊
- 可以捲動
- 使用監控資料的顏色

## 技術

### 前端

- 資料夾 `WWW/`
- 檔案 `index.html`、`style.css`、`main.js`
- WebSocket 即時接收後端推送的 Log 和監控資料

### 後端

- Node.js
- 預設 Port 3000
- 檔案 `server.js`

## 通訊

### UDP Port 995 — 接收 Log 資料

LOG 資料為 Binary 格式：

| 欄位 | 說明 |
|------|------|
| Color | 4 Byte RGBA |
| log | string 不固定長度 0 為結束字元 |

### UDP Port 996 — 接收監控資料

Key Value 資料為 Binary 格式：

| 欄位 | 說明 |
|------|------|
| Color | 4 Byte RGBA |
| key | string 不固定長度 0 為結束字元 |
| value | string 不固定長度 0 為結束字元 |

### REST API

**接收 Log 資料**

```
POST /log
Content-Type: application/json

{
  "color": number,   // 32-bit RGBA integer
  "log": string
}
```

**接收監控資料**

```
POST /inspector
Content-Type: application/json

{
  "color": number,   // 32-bit RGBA integer
  "key": string,
  "value": string
}
```

### WebSocket

**接收 Log 資料**

```json
{
  "cmd": "log",
  "color": number,   // 32-bit RGBA integer
  "log": string
}
```

**接收監控資料**

```json
{
  "cmd": "inspector",
  "color": number,   // 32-bit RGBA integer
  "key": string,
  "value": string
}
```

## 安裝與執行

1. 安裝 Node.js（LTS 版本）
2. 安裝依賴：`npm install`
3. 執行伺服器：`node server.js`
4. 開啟瀏覽器訪問 `http://localhost:3000`

## 專案結構

```
zlDebugWin/
├── server.js          # Node.js 後端 (HTTP + UDP + WebSocket)
├── WWW/
│   ├── index.html     # 前端頁面
│   ├── style.css      # 樣式
│   └── main.js        # 前端邏輯
├── package.json
├── README.md
└── requirement.md
```
