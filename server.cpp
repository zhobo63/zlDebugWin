#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <mutex>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <sys/stat.h>
#endif

#define HV_STATICLIB
#include "hv.h"
#include "HttpServer.h"
#include "WebSocketServer.h"

using namespace hv;

// ── 全域 WebSocket 連線管理 ──
static std::vector<WebSocketChannelPtr> g_ws_clients;
static std::mutex                       g_ws_mutex;

static void broadcastToClients(const std::string& message) {
    std::lock_guard<std::mutex> lock(g_ws_mutex);
    for (auto it = g_ws_clients.begin(); it != g_ws_clients.end();) {
        if ((*it)->isConnected()) {
            (*it)->send(message, WS_OPCODE_TEXT);
            ++it;
        } else {
            it = g_ws_clients.erase(it);
        }
    }
}

// ── 時間格式化 YYYY-MM-DD HH:MM:SS.MS ──
static std::string formatTime() {
    datetime_t dt = datetime_now();
    char buf[DATETIME_FMT_BUFLEN] = {0};
    snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d.%03d",
             dt.year, dt.month, dt.day,
             dt.hour, dt.min, dt.sec, dt.ms);
    return std::string(buf);
}

// ── 解析 color number (32-bit integer) -> rgba string ──
static std::string parseColor(int num) {
    int r = (num >> 24) & 0xFF;
    int g = (num >> 16) & 0xFF;
    int b = (num >> 8)  & 0xFF;
    int a = num         & 0xFF;
    char buf[64];
    snprintf(buf, sizeof(buf), "rgba(%d,%d,%d,%.3f)", r, g, b, a / 255.0);
    return std::string(buf);
}

// ── 解析 color number -> ANSI escape code (for console colored output) ──
static std::string ansiColor(int num) {
    int r = (num >> 24) & 0xFF;
    int g = (num >> 16) & 0xFF;
    int b = (num >> 8)  & 0xFF;
    char buf[32];
    snprintf(buf, sizeof(buf), "\033[38;2;%d;%d;%dm", r, g, b);
    return std::string(buf);
}

static const char* ansiReset() { return "\033[0m"; }

// ── 解析 null-terminated string from buffer ──
static std::string parseNullString(const char* buf, int len, int offset) {
    if (offset >= len) return "";
    const char* p = buf + offset;
    const char* end = buf + len;
    while (p < end && *p != '\0') ++p;
    return std::string(buf + offset, static_cast<size_t>(p - buf - offset));
}

// ── UDP Log handler (port 995) ──
static void on_log_udp(hio_t* io, void* buf, int readbytes) {
    if (readbytes < 4) return;

    const unsigned char* data = static_cast<unsigned char*>(buf);
    std::string color = parseColor(static_cast<int>(data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3]));

    // Extract null-terminated text after the first 4 bytes
    const char* p = static_cast<const char*>(buf) + 4;
    const char* end = static_cast<const char*>(buf) + readbytes;
    while (p < end && *p != '\0') ++p;
    std::string text(static_cast<const char*>(buf) + 4, static_cast<size_t>(p - static_cast<const char*>(buf) - 4));

    // Get peer address from UDP socket
    struct sockaddr* addr = hio_peeraddr(io);
    char ipstr[SOCKADDR_STRLEN] = {0};
    std::string ip = SOCKADDR_STR(addr, ipstr);

    // Build JSON message
    Json j;
    j["type"]  = "log";
    j["time"]  = formatTime();
    j["ip"]    = ip;
    j["text"]  = text;
    j["color"] = color;

    int colorInt = static_cast<int>(data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3]);
    std::string msg = j.dump();
    printf("[LOG] %s %s: %s%s\n", ansiColor(colorInt).c_str(), j["time"].get<std::string>().c_str(), ip.c_str(), text.c_str(), ansiReset());
    broadcastToClients(msg);
}

// ── UDP Monitor handler (port 996) ──
static void on_monitor_udp(hio_t* io, void* buf, int readbytes) {
    if (readbytes < 4) return;

    const unsigned char* data = static_cast<unsigned char*>(buf);
    std::string color = parseColor(static_cast<int>(data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3]));

    // Parse key (null-terminated) starting at offset 4
    std::string key = parseNullString(static_cast<const char*>(buf), readbytes, 4);

    // Find next null after key to get value offset
    const char* p = static_cast<const char*>(buf) + 4;
    while (p < static_cast<const char*>(buf) + readbytes && *p != '\0') ++p;
    if (*p == '\0') ++p; // skip null terminator

    std::string value = parseNullString(static_cast<const char*>(buf), readbytes, p - static_cast<const char*>(buf));

    // Build JSON message
    Json j;
    j["type"]  = "monitor";
    j["key"]   = key;
    j["value"] = value;
    j["color"] = color;

    int colorInt = static_cast<int>(data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3]);
    std::string msg = j.dump();
    printf("[MONITOR] %s%s = %s%s\n", ansiColor(colorInt).c_str(), key.c_str(), value.c_str(), ansiReset());
    broadcastToClients(msg);
}

// ── 取得 WWW 目錄的絕對路徑 ──
static std::string getWwwPath() {
#ifdef _WIN32
    char exe_path[MAX_PATH] = {0};
    GetModuleFileNameA(NULL, exe_path, MAX_PATH);
    std::string exe(exe_path);

    // Walk up from the executable directory until we find WWW/
    while (!exe.empty()) {
        size_t lastSlash = 0;
        for (size_t i = exe.size(); i > 0; --i) {
            if (exe[i - 1] == '/' || exe[i - 1] == '\\') {
                lastSlash = i - 1;
                break;
            }
        }
        std::string base = exe.substr(0, lastSlash + 1);
        std::string www = base + "WWW";
        struct _stat st;
        if (_stat(www.c_str(), &st) == 0 && (st.st_mode & _S_IFDIR)) {
            return www;
        }
        // Truncate to walk up one level
        exe = base.substr(0, lastSlash);
    }
#endif
    // Fallback: use current directory
    return "WWW";
}

int main(int argc, char** argv) {
#ifdef _WIN32
    // Set C runtime locale so std::cout handles multibyte (UTF-8) characters correctly.
    setlocale(LC_ALL, "zh_TW.UTF-8");
    // Set console input/output code pages to UTF-8 so emoji and all Unicode display correctly.
    SetConsoleCP(65001);
    SetConsoleOutputCP(65001);

    // Enable ANSI color support on Windows console
    HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
    if (hOut != INVALID_HANDLE_VALUE) {
        DWORD dwMode = 0;
        if (GetConsoleMode(hOut, &dwMode)) {
            SetConsoleMode(hOut, dwMode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
        }
    }
#endif

    int port = 3000;
    if (argc > 1) {
        port = atoi(argv[1]);
    }

    // ── HTTP Service ──
    HttpService http;

    // Static file serving from WWW directory
    std::string wwwPath = getWwwPath();
    printf("Serving static files from: %s\n", wwwPath.c_str());
    http.Static("/", wwwPath.c_str());

    // REST API: POST /log
    http.POST("/log", [](const HttpContextPtr& ctx) {
        try {
            Json body = Json::parse(ctx->body());
            if (!body.is_object()) throw std::runtime_error("Invalid JSON");

            Json j;
            j["type"]  = "log";
            j["time"]  = formatTime();
            j["ip"]    = "REST";
            j["text"]  = body["log"].get<std::string>();
            j["color"] = parseColor(body["color"].get<int>());

            int colorInt = body["color"].get<int>();
            std::string msg = j.dump();
            printf("[LOG REST] %s%s: %s%s\n", ansiColor(colorInt).c_str(), j["time"].get<std::string>().c_str(),
                   j["text"].get<std::string>().c_str(), ansiReset());
            broadcastToClients(msg);

            Json resp;
            resp["status"] = "ok";
            return ctx->send(resp.dump());
        } catch (const std::exception& e) {
            Json err;
            err["error"] = e.what();
            ctx->setStatus(http_status::HTTP_STATUS_BAD_REQUEST);
            return ctx->send(err.dump());
        }
    });

    // REST API: POST /inspector
    http.POST("/inspector", [](const HttpContextPtr& ctx) {
        try {
            Json body = Json::parse(ctx->body());
            if (!body.is_object()) throw std::runtime_error("Invalid JSON");

            Json j;
            j["type"]  = "monitor";
            j["key"]   = body["key"].get<std::string>();
            j["value"] = body["value"].get<std::string>();
            j["color"] = parseColor(body["color"].get<int>());

            int colorInt = body["color"].get<int>();
            std::string msg = j.dump();
            printf("[MONITOR REST] %s%s = %s%s\n",
                   ansiColor(colorInt).c_str(),
                   j["key"].get<std::string>().c_str(),
                   j["value"].get<std::string>().c_str(), ansiReset());
            broadcastToClients(msg);

            Json resp;
            resp["status"] = "ok";
            return ctx->send(resp.dump());
        } catch (const std::exception& e) {
            Json err;
            err["error"] = e.what();
            ctx->setStatus(http_status::HTTP_STATUS_BAD_REQUEST);
            return ctx->send(err.dump());
        }
    });

    // ── WebSocket Service ──
    WebSocketService ws;

    ws.onopen = [](const WebSocketChannelPtr& channel, const HttpRequestPtr& req) {
        printf("WebSocket client connected\n");
        std::lock_guard<std::mutex> lock(g_ws_mutex);
        g_ws_clients.push_back(channel);
    };

    ws.onmessage = [](const WebSocketChannelPtr& channel, const std::string& msg) {
        try {
            Json data = Json::parse(msg);

            if (data["cmd"] == "log") {
                Json j;
                j["type"]  = "log";
                j["time"]  = formatTime();
                j["ip"]    = "WS";
                j["text"]  = data["log"].get<std::string>();
                j["color"] = parseColor(data["color"].get<int>());

                int colorInt = data["color"].get<int>();
                std::string broadcast_msg = j.dump();
                printf("[LOG WS] %s%s: %s%s\n",
                       ansiColor(colorInt).c_str(),
                       j["time"].get<std::string>().c_str(),
                       j["text"].get<std::string>().c_str(), ansiReset());
                broadcastToClients(broadcast_msg);
            } else if (data["cmd"] == "inspector") {
                Json j;
                j["type"]  = "monitor";
                j["key"]   = data["key"].get<std::string>();
                j["value"] = data["value"].get<std::string>();
                j["color"] = parseColor(data["color"].get<int>());

                int colorInt = data["color"].get<int>();
                std::string broadcast_msg = j.dump();
                printf("[MONITOR WS] %s%s = %s%s\n",
                       ansiColor(colorInt).c_str(),
                       j["key"].get<std::string>().c_str(),
                       j["value"].get<std::string>().c_str(), ansiReset());
                broadcastToClients(broadcast_msg);
            }
        } catch (const std::exception& e) {
            fprintf(stderr, "WebSocket parse error: %s\n", e.what());
        }
    };

    ws.onclose = [](const WebSocketChannelPtr& channel) {
        printf("WebSocket client disconnected\n");
        std::lock_guard<std::mutex> lock(g_ws_mutex);
        g_ws_clients.erase(
            std::remove_if(g_ws_clients.begin(), g_ws_clients.end(),
                [&channel](const WebSocketChannelPtr& c) { return c == channel; }),
            g_ws_clients.end());
    };

    // ── 啟動 HTTP + WebSocket Server (non-blocking, runs in its own thread pool) ──
    HttpServer server(&http);
    server.ws = &ws;
    server.port = port;

    printf("HTTP server running at http://localhost:%d\n", port);
    server.start();

    // ── UDP Log (port 995) ──
    hloop_t* loop = hloop_new(0);
    hio_t* log_io = hloop_create_udp_server(loop, "0.0.0.0", 995);
    if (!log_io) {
        fprintf(stderr, "Failed to create UDP server on port 995\n");
        return -1;
    }
    hio_setcb_read(log_io, on_log_udp);
    hio_read(log_io);
    printf("Log UDP server listening on port 995\n");

    // ── UDP Monitor (port 996) ──
    hio_t* monitor_io = hloop_create_udp_server(loop, "0.0.0.0", 996);
    if (!monitor_io) {
        fprintf(stderr, "Failed to create UDP server on port 996\n");
        return -1;
    }
    hio_setcb_read(monitor_io, on_monitor_udp);
    hio_read(monitor_io);
    printf("Monitor UDP server listening on port 996\n");

    // ── 運行事件迴圈 (blocks here) ──
    hloop_run(loop);

    // Cleanup
    server.stop();
    hio_close(log_io);
    hio_close(monitor_io);
    hloop_free(&loop);

    return 0;
}
