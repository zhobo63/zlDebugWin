---
name: libhv
description: C++ network library for building HTTP, WebSocket, and UDP servers. Use when writing or modifying server code with libhv — covers HttpServer, WebSocketService, UDP sockets, event loop patterns, JSON handling, and CMake integration.
---

# libhv Server Development

libhv is a cross-platform C/C++ network library. This project uses it to build an HTTP + WebSocket + UDP server.

## Core Architecture

- **Single-threaded event loop** (`hloop_t`) drives I/O via epoll/kqueue/IOCP
- `HttpServer` runs in its own thread pool internally — call `server.start()` (non-blocking), not `server.run()` (blocking)
- UDP sockets are created on a specific `hloop_t` and run on that loop's thread

## Key Headers

```cpp
#include "hv.h"              // main umbrella header
#include "HttpServer.h"      // HttpServer, HttpService, HttpContextPtr
#include "WebSocketServer.h" // WebSocketService, WebSocketChannelPtr
```

All symbols are in the `hv` namespace. Use `using namespace hv;`.

## HTTP Server Setup

```cpp
HttpService http;
http.Static("/", "/path/to/www");  // static file serving with auto MIME detection

http.GET("/ping", [](const HttpContextPtr& ctx) {
    return ctx->send("pong");
});

http.POST("/api", [](const HttpContextPtr& ctx) {
    Json body = Json::parse(ctx->body());
    // ... process
    return ctx->send(body.dump(), 200);
});

HttpServer server(&http);
server.port = 3000;
server.start();  // non-blocking, runs in its own thread pool
```

### HTTP Response Helpers

- `ctx->send(string)` — send body with default content-type
- `ctx->send(string, status_code)` — send with custom status code
- `Json::parse(str)` / `json.dump()` — JSON parse/serialize (uses nlohmann-style API)

## WebSocket Setup

```cpp
WebSocketService ws;

ws.onopen = [](const WebSocketChannelPtr& channel, const HttpRequestPtr& req) {
    // store channel reference for later broadcast
};

ws.onmessage = [](const WebSocketChannelPtr& channel, const std::string& msg) {
    Json data = Json::parse(msg);
    // process message
};

ws.onclose = [](const WebSocketChannelPtr& channel) {
    // remove from stored channels
};

HttpServer server(&http);
server.ws = &ws;  // attach WebSocket service to the same HTTP server
```

### Sending WebSocket Messages

```cpp
channel->send("text message", WS_OPCODE_TEXT);   // text frame
channel->send(data, len, WS_OPCODE_BINARY);      // binary frame
```

## UDP Server (C API)

libhv has no C++ wrapper for UDP — use the C API directly:

```cpp
hloop_t* loop = hloop_new(0);

// Create UDP socket on this event loop
hio_t* io = hloop_create_udp_server(loop, "0.0.0.0", 995);
if (!io) { /* error */ }

// Set read callback: (hio_t*, void* buf, int readbytes)
hio_setcb_read(io, [](hio_t* io, void* buf, int readbytes) {
    // Get peer address from the UDP socket
    struct sockaddr* addr = hio_peeraddr(io);
    char ipstr[SOCKADDR_STRLEN] = {0};
    std::string ip = SOCKADDR_STR(addr, ipstr);

    // process buf[0..readbytes-1]
});

hio_read(io);  // start receiving

// Run the event loop (blocks)
hloop_run(loop);
```

### UDP Data Format in This Project

**Port 995 (Log):** `[RGBA:4 bytes][text: null-terminated UTF8]`

**Port 996 (Monitor):** `[RGBA:4 bytes][key: null-terminated][value: null-terminated]`

RGBA is big-endian: byte[0]=R, byte[1]=G, byte[2]=B, byte[3]=A. Convert with:
```cpp
int color = data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3];
```

## Threading Model — Important Gotchas

- `HttpServer.start()` spawns its own thread pool internally. HTTP/WebSocket callbacks run on those threads.
- UDP callbacks run on the event loop's thread (the one calling `hloop_run`).
- **Shared state between HTTP and UDP needs synchronization** — use `std::mutex` to protect WebSocket client lists, etc.
- Do NOT call `hloop_run()` from multiple threads on the same `hloop_t`.

## Time Formatting

```cpp
datetime_t dt = datetime_now();
char buf[DATETIME_FMT_BUFLEN] = {0};
snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d.%03d",
         dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, dt.millisecond);
```

## CMake Integration

```cmake
add_subdirectory(libhv EXCLUDE_FROM_ALL)
target_link_libraries(myapp PRIVATE hv)
```

On Windows with MSVC, add `/utf-8` compile flag for source encoding.
