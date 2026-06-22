const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const { WebSocketServer } = require('ws');

// ── 靜態檔案伺服器 ──
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// ── 解析 color number (32-bit integer) -> rgba string ──
function parseColor(num) {
  const r = (num >> 24) & 0xFF;
  const g = (num >> 16) & 0xFF;
  const b = (num >> 8) & 0xFF;
  const a = num & 0xFF;
  return `rgba(${r},${g},${b},${a / 255})`;
}

// ── 讀取 POST body ──
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // REST API: POST /log
  if (req.method === 'POST' && req.url === '/log') {
    try {
      const data = await readBody(req);
      const logEntry = {
        type: 'log',
        time: formatTime(new Date()),
        ip: 'REST',
        text: data.log,
        color: parseColor(data.color),
      };
      console.log(`[LOG REST] ${logEntry.time}: ${logEntry.text}`);
      broadcastToClients(logEntry);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // REST API: POST /inspector
  if (req.method === 'POST' && req.url === '/inspector') {
    try {
      const data = await readBody(req);
      const monitorEntry = {
        type: 'monitor',
        key: data.key,
        value: data.value,
        color: parseColor(data.color),
      };
      console.log(`[MONITOR REST] ${monitorEntry.key} = ${monitorEntry.value}`);
      broadcastToClients(monitorEntry);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 靜態檔案
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'WWW', filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// ── WebSocket ──
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  // 接收客戶端發來的 Log / 監控資料
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);

      if (data.cmd === 'log') {
        const logEntry = {
          type: 'log',
          time: formatTime(new Date()),
          ip: 'WS',
          text: data.log,
          color: parseColor(data.color),
        };
        console.log(`[LOG WS] ${logEntry.time}: ${logEntry.text}`);
        broadcastToClients(logEntry);
      } else if (data.cmd === 'inspector') {
        const monitorEntry = {
          type: 'monitor',
          key: data.key,
          value: data.value,
          color: parseColor(data.color),
        };
        console.log(`[MONITOR WS] ${monitorEntry.key} = ${monitorEntry.value}`);
        broadcastToClients(monitorEntry);
      }
    } catch (e) {
      console.error('WebSocket parse error:', e.message);
    }
  });

  ws.on('close', () => console.log('WebSocket client disconnected'));
});

function broadcastToClients(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// ── 時間格式化 YYYY-MM-DD HH:MM:SS.MS ──
function formatTime(date) {
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
}

// ── 解析 null-terminated string ──
function parseNullString(buf, offset) {
  let nullIndex = buf.indexOf(0, offset);
  if (nullIndex === -1) nullIndex = buf.length;
  return {
    str: buf.subarray(offset, nullIndex).toString('utf-8'),
    nextOffset: nullIndex + 1,
  };
}

// ── UDP Port 995 — 接收 Log 資料 ──
const logSocket = dgram.createSocket('udp4');

logSocket.on('error', (err) => {
  console.error('Log UDP Error:', err);
  logSocket.close();
});

logSocket.on('message', (msg, rinfo) => {
  if (msg.length < 4) return;

  const color = `rgba(${msg[0]},${msg[1]},${msg[2]},${msg[3] / 255})`;
  let logText = msg.subarray(4);
  let nullIndex = logText.indexOf(0);
  if (nullIndex !== -1) logText = logText.subarray(0, nullIndex);
  const text = logText.toString('utf-8');

  const logEntry = {
    type: 'log',
    time: formatTime(new Date()),
    ip: rinfo.address,
    text,
    color,
  };

  console.log(`[LOG] ${logEntry.time} ${logEntry.ip}: ${logEntry.text}`);
  broadcastToClients(logEntry);
});

logSocket.bind(995, () => {
  console.log('Log UDP server listening on port 995');
});

// ── UDP Port 996 — 接收監控資料 ──
const monitorSocket = dgram.createSocket('udp4');

monitorSocket.on('error', (err) => {
  console.error('Monitor UDP Error:', err);
  monitorSocket.close();
});

monitorSocket.on('message', (msg) => {
  if (msg.length < 4) return;

  const color = `rgba(${msg[0]},${msg[1]},${msg[2]},${msg[3] / 255})`;

  // 解析 key
  const keyResult = parseNullString(msg, 4);
  // 解析 value
  const valueResult = parseNullString(msg, keyResult.nextOffset);

  const monitorEntry = {
    type: 'monitor',
    key: keyResult.str,
    value: valueResult.str,
    color,
  };

  console.log(`[MONITOR] ${monitorEntry.key} = ${monitorEntry.value}`);
  broadcastToClients(monitorEntry);
});

monitorSocket.bind(996, () => {
  console.log('Monitor UDP server listening on port 996');
});

// ── 啟動 HTTP 伺服器 ──
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`HTTP server running at http://localhost:${PORT}`);
});
