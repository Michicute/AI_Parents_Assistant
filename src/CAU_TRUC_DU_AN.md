# AI Parent Assistant for English Learning Centers - Cấu Trúc Dự Án

## Tổng Quan
Monorepo MVP sẵn sàng cho sản xuất cho trợ lý AI hỗ trợ phụ huynh. Sản phẩm giúp phụ huynh hiểu tiến độ học tiếng Anh của con, xem lại phân tích câu trả lời đánh giá, và nhận các khuyến nghị thực tế để hỗ trợ học tập tại nhà.

## Cấu Trúc Monorepo
```
apps/
  frontend/   Ứng dụng web parent/teacher/admin bằng Next.js
  backend/    API FastAPI, RBAC, định tuyến công cụ, dịch vụ AI
docs/         Kiến trúc, lược đồ cơ sở dữ liệu, ghi chú triển khai
scripts/      Các công cụ hỗ trợ cài đặt cục bộ
```

## Công Nghệ Chính

### Frontend
- Next.js với TypeScript
- Tailwind CSS để tạo kiểu dáng
- React hooks để quản lý trạng thái
- Lucide React để biểu tượng

### Backend
- Framework FastAPI
- Python 3.9+
- PostgreSQL với pgvector cho dữ liệu và RAG
- Xác thực dựa trên JWT kết hợp với RBAC
- Tích hợp API OpenAI (có kế hoạch tương thích với Claude sau)

### Cơ Sở Dữ Liệu
- PostgreSQL với extension pgvector cho khả năng RAG
- Bảo mật trên hàng (RLS) được bật trên tất cả các bảng
- Hệ thống ghi nhật ký kiểm toán toàn diện
- Các mối quan hệ giữa người dùng, học sinh, giáo viên, lớp học, đánh giá, v.v.

## Tính Năng Cốt Lõi

### Xác Thực & Phân Quyền
- Xác thực JWT kết hợp với kiểm soát truy cập dựa trên vai trò (RBAC)
- Ba vai trò: ADMIN, TEACHER, PARENT
- Cô lập dữ liệu nghiêm ngặt: Phụ huynh chỉ xem thấy học sinh được liên kết, Giáo viên chỉ thấy lớp học được giao
- Xác thực token JWT trên backend
- Nhật ký kiểm toán cho tất cả các thao tác nhạy cảm

### Tính Năng Cho Phụ Huynh
- Bảng điều khiển hiển thị總 quan tiến độ của con
- Trò chuyện AI để hỏi về việc học của con, chính sách trung tâm, hỗ trợ tại nhà
- Quy trình phân tích câu trả lời với phản hồi chi tiết
- Theo dõi kỹ năng và khuyến nghị để hỗ trợ học tập tại nhà
- Hiển thị các bài tập và công việc sắp tới

### Tính Năng Cho Giáo Viên
- Quản lý lớp học và học sinh
- Tạo đánh giá có rubric
- Nộp và phân tích câu trả lời
- Ghi lại và theo dõi điểm số
- Hệ thống phản hồi có thể kiểm soát mức độ hiển thị cho phụ huynh

### Tính Năng Cho Quản Trị Viên
- Quản lý người dùng (tạo giáo viên, phụ huynh, học sinh)
- Gán vai trò và kiểm soát quyền限
- Phân công lớp học và giáo viên
- Khả năng giám sát hệ thống

### Năng Lực AI
- Định tuyến ý định cho các loại truy vấn khác nhau
- Retrieval-Augmented Generation (RAG) cho tài liệu trung tâm
- Truy vấn SQL trực tiếp cho dữ liệu có cấu trúc (điểm số, bài tập, v.v.)
- Phân tích câu trả lời dựa trên rubric
- Gợi ý thân thiện cho phụ huynh và khuyến nghị hỗ trợ tại nhà
- Giao límite cung cấp cho phép sử dụng OpenAI hiện nay, Claude sau này

## Mô Hình Bảo Mật
- Backend thực hiện tất cả các quyết định về quyền限
- LLM không truy cập cơ sở dữ liệu trực tiếp hoặc đưa ra quyết định về quyền限
- Tất cả các thao tác đọc/ghi nhạy cảm tạo ra nhật ký kiểm toán
- Cô lập dữ liệu được thực thi ở lớp dịch vụ
- Có thể bổ sung các cơ chế kiểm soát ở tầng database để phản chiếu kiểm tra backend

## Chi Tiết Các Tập Tin

### Cấu Trúc Backend
- `apps/backend/app/main.py` - Hàm tạo ứng dụng FastAPI
- `apps/backend/app/api/routes.py` - Tất cả các điểm cuối API với việc tiêm phụ thuộc
- `apps/backend/app/core/security.py` - Các trợ lý trích xuất chủ thể và RBAC
- `apps/backend/app/core/config.py` - Quản lý cài đặt
- `apps/backend/app/models/domain.py` - Các mô hình miền vàenum
- `apps/backend/app/schemas/api.py` - Các mô hình Pydantic để xác thực yêu cầu/phản hồi
- `apps/backend/app/services/` - Lớp lógica nghiệp vụ:
  - `ai_provider.py` - Trừu tượng hóa nhà cung cấp LLM
  - `audit.py` - Ghi nhật ký kiểm toán
  - `intent_router.py` - Phân loại ý định truy vấn
  - `repositories.py` - Lớp truy cập dữ liệu
  - `tools.py` - Truy xuất ngữ cảnh được ủy quyền cho công cụ AI

### Cấu Trúc Frontend
- `apps/frontend/app/` - Các trang của bộ định tuyến app của Next.js:
  - Xác thực: `/login`
  - Phụ huynh: `/parent/*` (bảng điều khiển, trò chuyện, xem học sinh)
  - Giáo viên: `/teacher/*` (bảng điều khiển, đánh giá, học sinh)
  - Quản trị: `/admin/*` (quản lý người dùng, phân công lớp/giao viên)
  - Công cộng: `/` (trang đích)
- `apps/frontend/components/` - Các thành phần UI có thể sử dụng lại:
  - Thành phần bố cục (AppShell, DashboardCards, v.v.)
  - Thành phần đặc trưng cho tính năng (AssistantWorkspace, AssessmentManager, v.v.)
  - Primitives UI (StatusPill, AuthGate, v.v.)
- `apps/frontend/lib/` - Các thư viện tiện ích:
  - `api.ts` - Máy khách API backend
  - `demo-data.ts` - Dữ liệu giả cho phát triển
  - `dev-auth.ts` - Trợ lý xác thực phát triển

### Lược Đồ Cơ Sở Dữ Liệu
- `docs/database.sql` - Bản sao chỉ đọc của lược đồ

## Tài Liệu
- `docs/architecture.md` - Kiến trúc hệ thống và luồng dữ liệu
- `docs/deployment.md` - Hướng dẫn triển khai
- `docs/security.md` - Chi tiết mô hình bảo mật
- `README.md` - Tổng quan dự án và hướng dẫn cài đặt

## Hướng Dẫn Cài Đặt

1. **Thiết Lutsch Môi Trường**
   ```bash
   cp .env.example .env
   cp apps/frontend/.env.example apps/frontend/.env.local
   cp apps/backend/.env.example apps/backend/.env
   ```

2. **Cài Đặt Phụ Thuộc**
   ```bash
   # Frontend
   npm install
   
   # Backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r apps/backend/requirements.txt
   ```

3. **Khởi Động Dịch Vụ**
   ```bash
    # Khởi động backend và cơ sở dữ liệu cục bộ
    docker compose up --build -d
   
   # Khởi động backend và frontend
   npm run backend:dev  # FastAPI trên http://localhost:8000
   npm run dev          # Next.js trên http://localhost:3000
   ```

## Quy Trình Phát Triển

Dự án tuân theo kiến trúc mô-đun với sự tách biệt rõ ràng về trách nhiệm:
- Lớp API xử lý các vấn đề HTTP và định tuyến
- Lớp dịch vụ chứa logic nghiệp vụ
- Lớp kho lưu trữ quản lý truy cập dữ liệu
- Các mô hình định nghĩa cấu trúc dữ liệu
- Lớp bảo mật thực thi kiểm soát truy cập

Tất cả các thao tác nhạy cảm đều yêu cầu xác thực và ủy quyền thích hợp, cùng với việc ghi nhật ký kiểm toán toàn diện để tuân thủ và giám sát bảo mật.
