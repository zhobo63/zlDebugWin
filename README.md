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
| 顯示 IP | 勾選顯示 Log 的 IP 欄位；取消勾選時隱藏整個 IP 欄位，Log 內容會自動加大 |

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

- C++ 17，主要實作於 `server.cpp`
- 使用 [libhv](https://github.com/ithewei/libhv) 提供 HTTP、WebSocket 與 UDP Server
- HTTP/WebSocket 預設 Port：`3000`，可由啟動參數指定
- UDP Log Port：`995`
- UDP 監控 Port：`996`
- 以 libhv static library 連結；Windows MSVC 預設使用 `/MT` runtime
- 靜態檔案由 `WWW/` 提供

### `server.cpp` 後端流程

`server.cpp` 啟動後會建立 HTTP/WebSocket Server，以及兩個 UDP 接收器：

1. 建立 HTTP Service，從執行檔附近尋找 `WWW/` 目錄並提供靜態檔案。
2. 註冊 REST API：`POST /log` 與 `POST /inspector`。
3. 建立 WebSocket Service，接收外部送入的 Log/監控命令，也將資料廣播給所有已連線的瀏覽器。
4. 在 UDP `995` 接收 Log binary 封包，在 UDP `996` 接收監控 binary 封包。
5. UDP 資料解析後會轉換成 JSON，再透過 WebSocket 推送至前端。

後端會以全域 WebSocket client 清單管理瀏覽器連線，傳送資料時會自動移除已斷線的連線。Color 使用 32-bit RGBA 整數，前端收到後轉為 CSS `rgba(...)` 顏色。

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

WebSocket 連線位於 HTTP Server 的同一個 Port（預設 `3000`）。送入的命令由 `server.cpp` 解析後，會廣播給所有已連線的前端。

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

## 建置與執行

### 取得原始碼

`libhv` 是 git submodule，首次取得專案後需要初始化：

```bash
git clone <repository-url>
cd zlDebugWin
git submodule update --init --recursive
```

### 使用 CMake 建置

需要 CMake 3.14 以上及 C++17 編譯器。Windows MSVC 建置範例：

```bash
cmake -S . -B build
cmake --build build --config Release
```

專案會使用 libhv 的靜態目標 `hv_static`，並在 MSVC 下使用 `/MT`（Debug 使用 `/MTd`）。

### 執行

```bash
# 預設使用 HTTP/WebSocket Port 3000
zlDebugServer.exe

# 指定 HTTP/WebSocket Port
zlDebugServer.exe 8080
```

啟動後開啟瀏覽器訪問 `http://localhost:3000`（或指定的 Port）。UDP Port `995` 與 `996` 固定用於接收 Log 和監控資料。

## 專案結構

```
zlDebugWin/
├── server.cpp         # C++ 後端 (HTTP + UDP + WebSocket)
├── CMakeLists.txt     # CMake 建置設定
├── libhv/             # libhv git submodule
├── WWW/
│   ├── index.html     # 前端頁面
│   ├── style.css      # 樣式
│   └── main.js        # 前端邏輯
├── README.md
└── requirement.md
```
