# zlDebugWin

顯示Log的頁面、可以接收不同網路協議

# 前端

資料夾 WWW/
使用檔案 index.html style.css main.js

## 上方區塊

清除
過濾:輸入文字 LOG包含要過濾的文字才顯示 不輸入全部顯示
IP:輸入IP 從輸入IP來的訊息才顯示 不輸入全部顯示
搜尋:輸入文字 尋找log相符文字 
搜尋按鈕 找下一個相符文字

## 主區塊

主要顯示LOG區域
可以捲動
顯示格式
  時間 IP Log
Log文字顏色使用資料格式裡的Color
收到LOG資料加入LOG區域 
時間格式: YYYY-MM-DD HH:MM:SS.MS

### 資料格式

LOG資料:
Binary
  Color: 4 Byte RGBA
  log: string 不固定長度 0為結束字元

## 監控區塊
主區塊右方
收到監控資料找到是否有相同Key
  有: 更新Value資料
  沒有: 新增到監控區塊
可以捲動
使用監控資料的顏色

### 監控資料格式

Key Value資料:
Binary
  Color: 4 Byte RGBA
  key: string 不固定長度 0為結束字元
  value: string 不固定長度 0為結束字元

# 後端

NodeJs
預設 Port 3000
檔案 server.js

# 通訊

## UDP Port 995 
接收Log資料

## UDP Port 996 
接收監控資料資料

## REST API

- 接收Log資料
POST /log
  {
    color: number,
    log: string
  }

- 接收監控資料資料
POST /inspector
  {
    color: number,
    key: string,
    value: string
  }

## Websocket

- 接收Log資料
  {
    cmd: "log",
    color: number,
    log: string
  }

- 接收監控資料資料
  {
    cmd: "inspector",
    color: number,
    key: string,
    value: string
  }

# 說明

輸出說明檔案 README.md
