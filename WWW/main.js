// ── DOM 元素 ──
const logArea = document.getElementById("logArea");
const showIpCheckbox = document.getElementById("showIpCheckbox");
const monitorArea = document.getElementById("monitorArea");
const clearBtn = document.getElementById("clearBtn");
const filterInput = document.getElementById("filterInput");
const ipInput = document.getElementById("ipInput");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

// ── 監控資料儲存 (Key -> {value, color}) ──
const monitorData = new Map();

// ── WebSocket 連線 ──
const ws = new WebSocket(`ws://${location.host}`);

ws.onopen = () => {
  console.log("WebSocket connected");
};

ws.onclose = () => {
  console.log("WebSocket disconnected, reconnecting in 3s...");
  setTimeout(() => {
    location.reload();
  }, 3000);
};

ws.onerror = (err) => {
  console.error("WebSocket error:", err);
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "log") {
    addLogEntry(data);
  } else if (data.type === "monitor") {
    updateMonitorEntry(data);
  }
};

// ── 加入 Log 項目 ──
function addLogEntry(entry) {
  console.log("Log", entry);
  // 檢查過濾條件
  if (!passesFilter(entry)) return;

  const div = document.createElement("div");
  div.className = "log-entry";

  const timeSpan = document.createElement("span");
  timeSpan.className = "log-time";
  timeSpan.textContent = entry.time;

  const ipSpan = document.createElement("span");
  ipSpan.className = "log-ip";
  ipSpan.textContent = entry.ip;
  if (!showIpCheckbox.checked) {
    ipSpan.style.display = "none";
    ipSpan.classList.add("hidden");
  }

  const textSpan = document.createElement("span");
  textSpan.className = "log-text";
  textSpan.textContent = entry.text;
  if (entry.color) {
    textSpan.style.color = entry.color;
  }

  div.appendChild(timeSpan);
  div.appendChild(ipSpan);
  div.appendChild(textSpan);
  logArea.appendChild(div);

  // 自動捲動到底部
  logArea.scrollTop = logArea.scrollHeight;
}

// ── 過濾邏輯 ──
function passesFilter(entry) {
  const filterText = filterInput.value.trim().toLowerCase();
  const filterIp = ipInput.value.trim();

  if (filterText && !entry.text.toLowerCase().includes(filterText)) {
    return false;
  }

  if (filterIp && entry.ip !== filterIp) {
    return false;
  }

  return true;
}

// ── 更新監控項目 ──
function updateMonitorEntry(entry) {
  console.log("Monitor", entry);
  const { key, value, color } = entry;

  // 檢查是否有相同 Key
  if (monitorData.has(key)) {
    // 更新 Value
    const existing = monitorData.get(key);
    existing.value = value;
    existing.color = color;
    updateMonitorDOM(key, value, color);
  } else {
    // 新增到監控區塊
    monitorData.set(key, { value, color });
    createMonitorDOM(key, value, color);
  }
}

// ── 建立監控 DOM 元素 ──
function createMonitorDOM(key, value, color) {
  const div = document.createElement("div");
  div.className = "monitor-entry";
  div.dataset.key = key;

  const keySpan = document.createElement("span");
  keySpan.className = "monitor-key";
  keySpan.textContent = key;

  const valueSpan = document.createElement("span");
  valueSpan.className = "monitor-value";
  valueSpan.textContent = value;
  if (color) {
    valueSpan.style.color = color;
  }

  div.appendChild(keySpan);
  div.appendChild(valueSpan);
  monitorArea.appendChild(div);
}

// ── 更新監控 DOM 元素 ──
function updateMonitorDOM(key, value, color) {
  const entry = monitorArea.querySelector(`.monitor-entry[data-key="${key}"]`);
  if (entry) {
    const valueSpan = entry.querySelector(".monitor-value");
    if (valueSpan) {
      valueSpan.textContent = value;
      if (color) {
        valueSpan.style.color = color;
      }
    }
  }
}

// ── 搜尋功能 ──
let lastSearchIndex = -1;

searchBtn.addEventListener("click", () => {
  const searchText = searchInput.value.trim().toLowerCase();
  if (!searchText) return;

  const entries = logArea.querySelectorAll(".log-entry");
  if (entries.length === 0) return;

  // 移除之前的 highlight
  entries.forEach((e) => e.classList.remove("highlight"));

  // 從上次搜尋位置後開始找
  lastSearchIndex++;

  let found = false;
  for (let i = lastSearchIndex; i < entries.length; i++) {
    const textSpan = entries[i].querySelector(".log-text");
    if (textSpan && textSpan.textContent.toLowerCase().includes(searchText)) {
      // 找到相符項目
      entries[i].classList.add("highlight");
      entries[i].scrollIntoView({ behavior: "smooth", block: "center" });
      lastSearchIndex = i;
      found = true;
      break;
    }
  }

  // 如果沒找到，從頭開始找
  if (!found) {
    lastSearchIndex = -1;
    for (let i = 0; i < entries.length; i++) {
      const textSpan = entries[i].querySelector(".log-text");
      if (textSpan && textSpan.textContent.toLowerCase().includes(searchText)) {
        entries[i].classList.add("highlight");
        entries[i].scrollIntoView({ behavior: "smooth", block: "center" });
        lastSearchIndex = i;
        found = true;
        break;
      }
    }
  }

  if (!found) {
    console.log("未找到相符的 Log");
  }
});

// ── 顯示IP 勾選切換 ──
showIpCheckbox.addEventListener("change", () => {
  const visible = showIpCheckbox.checked;
  logArea.querySelectorAll(".log-ip").forEach((el) => {
    el.classList.toggle("hidden", !visible);
  });
});

// ── 清除按鈕 ──
clearBtn.addEventListener("click", () => {
  logArea.innerHTML = "";
  monitorArea.innerHTML = "";
  monitorData.clear();
  lastSearchIndex = -1;
});
