# Zalo Bot Service - Luồng hoạt động

## Tổng quan

`zalo-bot-service` là một microservice Node.js (Fastify) có nhiệm vụ kết nối tài khoản Zalo của phụ huynh với học viên trong hệ thống. Service này hoạt động như một bridge giữa Zalo (qua thư viện `zca-js`) và backend chính.

**Port:** 4001  
**Stack:** TypeScript, Fastify, zca-js, Zod

---

## Kiến trúc

```
┌─────────────────┐       ┌────────────────────────┐       ┌──────────────┐
│   Backend API   │◄─────►│   Zalo Bot Service     │◄─────►│   Zalo API   │
│   (port 8000)   │       │   (port 4001)          │       │   (zca-js)   │
└─────────────────┘       └────────────────────────┘       └──────────────┘
        │                           │
        │                           ├── adapters/
        │                           │     └── zca-js-adapter   (real Zalo QR)
        │                           │
        │                           ├── routes/internal.ts
        │                           ├── services/zalo-session-service.ts
        │                           └── lib/
        │                                 ├── backend-client.ts
        │                                 ├── session-store.ts (in-memory)
        │                                 └── env.ts
        │
   Admin tạo link session
   qua frontend
```

---

## Luồng liên kết Zalo (Link Session Flow)

### Bước 1: Admin tạo link session

```
Frontend → Backend POST /api/integrations/zalo/link-sessions
```

- Admin chọn học viên cần liên kết Zalo
- Backend tạo session record (token + thời hạn) trong DB
- Backend gọi sang `zalo-bot-service`:

```
Backend → Zalo Bot Service POST /internal/link-sessions
  Body: { session_id, session_token, student_id, expires_at }
  Header: Authorization: Bearer <INTEGRATION_SHARED_SECRET>
```

### Bước 2: Zalo Bot Service xử lý

1. Xác thực `Authorization` header
2. Lưu session vào in-memory store
3. Gọi adapter `startLinkSession()`:
   - **zca-js QR mode:** Kiểm tra bot đã login chưa, tạo hướng dẫn/QR liên kết thật cho phụ huynh gửi session token đến bot
4. Trả response cho backend: `{ status, qr_code_url, deep_link_url }`

### Bước 3: Phụ huynh quét QR / gửi tin nhắn

- Phụ huynh mở Zalo, gửi **session_token** đến tài khoản bot
- `zca-js` listener nhận message:

```
Zalo Message → zca-js listener → normalizeZcaMessage() → deps.onMessageLinked()
```

### Bước 4: Hoàn tất liên kết

```
onMessageLinked():
  1. Tìm session bằng token (text phụ huynh gửi)
  2. Gọi Backend: POST /api/integrations/zalo/link-sessions/{session_id}/complete
     Body: { sender_id, zalo_display_name }
  3. Cập nhật session store: status = "connected"
```

- Backend nhận request → tạo/cập nhật `student_channel_link` → lưu DB
- Từ nay hệ thống biết sender_id Zalo nào map với học viên nào

---

## Luồng khởi động (Startup Flow)

```
index.ts:
  1. createZaloSessionService() → khởi tạo zca-js adapter
  2. zaloSessionService.restore():
     - Gọi Backend GET /api/integrations/zalo/bot-session/{account_label}
     - Lấy credentials đã lưu (hoặc dùng từ ENV)
     - Login vào Zalo qua zca-js
     - Persist trạng thái bot session lên Backend
  3. Đăng ký routes /internal/*
  4. Lắng nghe port 4001
```

---

## Adapter Pattern

### zca-js-adapter (Production)

- Dùng thư viện `zca-js` để login vào Zalo bằng cookie/imei/user-agent
- Lắng nghe tin nhắn realtime qua WebSocket
- Tự động persist session (credentials) lên backend để reuse sau restart
- Gửi tin xác nhận lại cho phụ huynh khi liên kết thành công

Service hiện chỉ dùng `zca-js-adapter`. Không còn mock adapter hoặc mock-complete endpoint; mọi liên kết Zalo phải đi qua bot đã đăng nhập bằng QR thật.

---

## API Endpoints

### Internal (gọi từ Backend, cần Authorization header)

| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/internal/link-sessions` | Tạo link session mới |
| GET | `/internal/link-sessions/:sessionToken` | Lấy trạng thái session |
| GET | `/internal/bot/status` | Lấy trạng thái đăng nhập bot |
| POST | `/internal/bot/login-qr` | Tạo/khởi động đăng nhập bot bằng QR thật |

### Public

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/health` | Health check |

---

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|------|----------|--------|
| `PORT` | Không | Port service (mặc định: 4001) |
| `BACKEND_URL` | Có | URL backend chính (ví dụ: http://backend:8000) |
| `INTEGRATION_SHARED_SECRET` | Có | Secret dùng chung giữa backend và zalo-bot |
| `ZALO_ADAPTER` | Không | Chỉ hỗ trợ `zca-js` (mặc định) |
| `ZALO_ACCOUNT_LABEL` | Không | Label tài khoản bot (mặc định: `default`) |
| `ZALO_COOKIE` | Có* | Cookie đăng nhập Zalo (lấy từ browser/devtools) |
| `ZALO_IMEI` | Có* | IMEI thiết bị Zalo |
| `ZALO_USER_AGENT` | Có* | User-Agent trình duyệt Zalo |
| `ZALO_LANGUAGE` | Không | Ngôn ngữ (mặc định: `vi`) |

*Dùng khi cần cấu hình/tái sử dụng phiên `zca-js`; service không còn hỗ trợ mock mode.

---

## Session States

```
pending → link_ready → connected
                    → failed
                    → expired
```

- **pending**: Session vừa tạo, chờ adapter xử lý
- **link_ready**: QR/deeplink đã sẵn sàng, chờ phụ huynh scan
- **connected**: Phụ huynh đã gửi token, liên kết thành công
- **failed**: Lỗi (bot chưa login, timeout, v.v.)
- **expired**: Session hết hạn (theo `ZALO_LINK_SESSION_TTL_MINUTES` ở backend)

---

## Giao tiếp với Backend

Mọi request từ zalo-bot-service đến backend đều qua `backend-client.ts`:

| Hàm | Endpoint Backend | Mục đích |
|-----|------------------|----------|
| `completeLinkSession()` | POST `/api/integrations/zalo/link-sessions/{id}/complete` | Báo liên kết thành công |
| `failLinkSession()` | POST `/api/integrations/zalo/link-sessions/{id}/fail` | Báo liên kết thất bại |
| `getBotSession()` | GET `/api/integrations/zalo/bot-session/{label}` | Lấy credentials đã lưu |
| `upsertBotSession()` | PUT `/api/integrations/zalo/bot-session/{label}` | Cập nhật trạng thái bot |

Tất cả đều dùng header `Authorization: Bearer <INTEGRATION_SHARED_SECRET>`.

---

## Chạy trong Docker

```bash
cd src/
docker-compose up --build
```

Service `zalo-bot-service` sẽ:
1. Build TypeScript → JavaScript (multi-stage Dockerfile)
2. Chờ backend khởi động xong (`depends_on: backend`)
3. Restore session (login Zalo nếu có credentials)
4. Lắng nghe port 4001

---

## Chạy local (dev)

```bash
cd src/apps/zalo-bot-service
cp .env.example .env
# Đăng nhập bot bằng QR thật qua trang quản trị hoặc endpoint /internal/bot/login-qr
npm install
npm run dev
```
