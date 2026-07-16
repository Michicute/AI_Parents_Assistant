# Hướng dẫn lấy Zalo Credentials cho Zalo Bot Service

Để chạy `zalo-bot-service` ở chế độ thật (adapter `zca-js`), bạn cần lấy 3 thông tin từ tài khoản Zalo sẽ dùng làm bot:

- `ZALO_COOKIE`
- `ZALO_IMEI`
- `ZALO_USER_AGENT`

---

## Yêu cầu

- Trình duyệt Chrome/Edge (có DevTools)
- Một tài khoản Zalo riêng dùng làm bot (không dùng tài khoản cá nhân)

---

## Các bước thực hiện

### Bước 1: Mở Zalo Web

1. Mở trình duyệt Chrome/Edge
2. Truy cập: https://chat.zalo.me
3. Đăng nhập bằng tài khoản Zalo sẽ dùng làm bot

### Bước 2: Mở DevTools

1. Nhấn `F12` hoặc `Ctrl + Shift + I` (Windows) / `Cmd + Option + I` (Mac)
2. Chuyển sang tab **Application** (Chrome) hoặc **Storage** (Firefox)

### Bước 3: Lấy ZALO_COOKIE

1. Trong DevTools, vào tab **Application**
2. Ở sidebar trái, mở **Cookies** → chọn `https://chat.zalo.me`
3. Tìm và copy giá trị của các cookie sau (ghép lại thành chuỗi):
   - `zpw_sek`
   - `zpw_sekg`  
   - Các cookie khác bắt đầu bằng `zpw_`

**Cách nhanh hơn:** Vào tab **Network** trong DevTools:
1. Reload trang (`F5`)
2. Click vào bất kỳ request nào đến `chat.zalo.me`
3. Trong phần **Headers** → **Request Headers**, copy toàn bộ giá trị của `Cookie`

Đó là giá trị `ZALO_COOKIE`.

### Bước 4: Lấy ZALO_IMEI

1. Trong DevTools, vào tab **Console**
2. Gõ lệnh sau và nhấn Enter:

```javascript
JSON.parse(localStorage.getItem("z_uuid") || localStorage.getItem("zid_uuid") || "null")
```

3. Nếu không ra kết quả, thử:

```javascript
Object.keys(localStorage).filter(k => k.includes("uuid") || k.includes("imei")).map(k => `${k}: ${localStorage.getItem(k)}`)
```

4. Hoặc tìm trong Network tab: tìm request có param `imei` trong URL/body

Giá trị này là `ZALO_IMEI`.

### Bước 5: Lấy ZALO_USER_AGENT

1. Trong DevTools, vào tab **Console**
2. Gõ:

```javascript
navigator.userAgent
```

3. Copy kết quả — đó là `ZALO_USER_AGENT`

---

## Cấu hình

Sau khi có đủ 3 giá trị, thêm vào file `src/.env`:

```env
ZALO_COOKIE=zpw_sek=...; zpw_sekg=...; ...
ZALO_IMEI=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ZALO_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
ZALO_LANGUAGE=vi
ZALO_ADAPTER=zca-js
ZALO_ACCOUNT_LABEL=default
INTEGRATION_SHARED_SECRET=your-secret-here
```

---

## Khởi chạy

```bash
cd src/
docker-compose up --build
```

Hoặc chạy local:

```bash
cd src/apps/zalo-bot-service
cp .env.example .env
# Điền credentials vào .env
npm install
npm run dev
```

---

## Kiểm tra

1. Xem log service:
   ```
   zalo-bot-service  | {"level":30,"msg":"Server listening at http://0.0.0.0:4001"}
   ```

2. Check health:
   ```bash
   curl http://localhost:4001/health
   # → {"status":"ok","service":"zalo-bot-service","adapter":"zca-js"}
   ```

3. Check bot session status (qua backend):
   ```bash
   curl -H "Authorization: Bearer change-me" http://localhost:8000/api/integrations/zalo/bot-session/default
   # → status: "connected" nghĩa là bot đã login thành công
   ```

---

## Lưu ý quan trọng

- **Cookie hết hạn:** Cookie Zalo có thời hạn. Khi hết hạn, bot sẽ disconnect. Bạn cần lấy lại cookie mới.
- **Không dùng tài khoản cá nhân:** Tạo một tài khoản Zalo riêng cho bot để tránh bị khóa tài khoản chính.
- **Một thiết bị tại một thời điểm:** Zalo chỉ cho phép đăng nhập web từ một nơi. Nếu bạn login Zalo Web ở trình duyệt khác, bot sẽ bị đẩy ra.
- **Session persist:** Sau lần login đầu, service tự lưu session lên backend (qua bot-session API). Khi restart, nó sẽ restore từ session đã lưu thay vì cần credentials mới.

---

## Troubleshooting

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|-----------|
| Bot status = "missing_credentials" | Chưa điền ZALO_COOKIE/IMEI/USER_AGENT | Điền đủ 3 giá trị vào .env |
| Bot status = "failed" | Cookie hết hạn hoặc sai | Lấy cookie mới từ Zalo Web |
| QR hiển thị nhưng quét không hoạt động | Bot chưa connected | Kiểm tra log, đảm bảo bot status = "connected" |
| "Zalo service is unavailable" | zalo-bot-service chưa chạy | Kiểm tra docker-compose logs |
