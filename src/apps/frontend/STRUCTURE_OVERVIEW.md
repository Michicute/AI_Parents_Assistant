# Frontend Structure Overview

Tài liệu này tóm tắt nhanh cấu trúc hiện tại của `src/apps/frontend` để dùng làm điểm tham chiếu sau này.

## Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS

## Mục đích thư mục

- `app/`: định nghĩa route theo Next.js App Router
- `components/`: component dùng lại và component theo tính năng
- `lib/`: API client, auth client-side, utility

## Root-level Files And Folders

- `.env.example`: biến môi trường mẫu
- `.env.local`: biến môi trường local
- `.next/`: build output cục bộ của Next.js
- `Dockerfile`: cấu hình container frontend
- `eslint.config.mjs`: cấu hình ESLint
- `next.config.ts`: cấu hình Next.js
- `package.json`: scripts và dependencies
- `postcss.config.js`: cấu hình PostCSS
- `tailwind.config.ts`: cấu hình Tailwind
- `tsconfig.json`: cấu hình TypeScript

## App Router

### Core

- `app/layout.tsx`
  - layout gốc của toàn app
  - đặt `lang="vi"`
  - nạp font `Plus Jakarta Sans`
- `app/page.tsx`
  - redirect từ `/` sang `/login`
- `app/globals.css`
  - CSS global

### Public / Entry

- `app/login/page.tsx`
  - trang đăng nhập

### Parent Routes

- `app/parent/dashboard/page.tsx`
- `app/parent/chat/page.tsx`
- `app/parent/students/page.tsx`
- `app/parent/students/[studentId]/page.tsx`

Mục đích: luồng dành cho phụ huynh xem học sinh được liên kết và tương tác với assistant.

### Teacher Routes

- `app/teacher/dashboard/page.tsx`
- `app/teacher/grades/page.tsx`
- `app/teacher/attendance/page.tsx`
- `app/teacher/students/page.tsx`
- `app/teacher/students/[studentId]/page.tsx`
- `app/teacher/assessments/page.tsx`
- `app/teacher/assessments/[assessmentId]/page.tsx`
- `app/teacher/assessments/[assessmentId]/print/page.tsx`

Mục đích: luồng dành cho giáo viên quản lý điểm, điểm danh, học sinh và bài đánh giá.

### Student Routes

- `app/student/dashboard/page.tsx`
- `app/student/assessments/[assessmentId]/page.tsx`

Mục đích: khu vực học sinh, hiện đang gọn hơn so với parent và teacher.

### Admin Routes

- `app/admin/dashboard/page.tsx`
- `app/admin/classes/page.tsx`
- `app/admin/users/page.tsx`
- `app/admin/zalo-bot/page.tsx`
- `app/admin/zalo-logs/page.tsx`
- `app/admin/parents/new/page.tsx`
- `app/admin/teachers/new/page.tsx`
- `app/admin/students/new/page.tsx`
- `app/admin/students/[studentId]/zalo/page.tsx`

Mục đích: khu vực quản trị người dùng, lớp học và tích hợp Zalo.

## Components

### Shared / Layout

- `components/AppShell.tsx`: shell/layout dùng chung
- `components/AssistantWorkspace.tsx`: vùng làm việc chính của assistant
- `components/AuthGate.tsx`: kiểm tra token, login, logout, load session
- `components/BrandMark.tsx`: nhận diện thương hiệu
- `components/ChatbotHero.tsx`: khối hero cho assistant/chat
- `components/DashboardCards.tsx`: nhóm card dashboard
- `components/StatusPill.tsx`: hiển thị trạng thái ngắn gọn

### Feature Components

- `components/AssessmentManager.tsx`: quản lý assessment
- `components/GradeManager.tsx`: quản lý điểm
- `components/ZaloQrSection.tsx`: phần QR liên quan Zalo

### Admin-specific Components

- `components/admin/AdminSession.tsx`
- `components/admin/AdminAccountForm.tsx`

### UI Primitives

- `components/ui/Avatar.tsx`
- `components/ui/Badge.tsx`
- `components/ui/Button.tsx`
- `components/ui/Card.tsx`
- `components/ui/DataTable.tsx`
- `components/ui/EmptyState.tsx`
- `components/ui/MetricCard.tsx`
- `components/ui/PageSection.tsx`
- `components/ui/SectionHeader.tsx`
- `components/ui/Skeleton.tsx`
- `components/ui/index.ts`

Mục đích: các building block tái sử dụng cho UI.

## Lib

- `lib/api.ts`
  - file trung tâm cho type API và client gọi backend
  - chứa nhiều kiểu dữ liệu cho auth, dashboard, attendance, assessment, AI insight, score, user
- `lib/dev-auth.ts`
  - lưu / đọc / xóa access token phía client
- `lib/chat-history.ts`
  - quản lý lịch sử chat local
- `lib/score-utils.ts`
  - utility liên quan điểm số

## Current Architectural Notes

- Frontend đang tổ chức chủ yếu theo vai trò: `admin`, `teacher`, `parent`, `student`.
- `AuthGate.tsx` là một entry quan trọng cho đăng nhập và khôi phục session phía client.
- `lib/api.ts` đang đóng vai trò khá lớn, vừa chứa type vừa chứa API layer.
- Cấu trúc hiện tại phù hợp để tiếp tục mở rộng theo domain hoặc theo role.

## Quick Mental Model

Nếu cần nhớ nhanh, có thể hình dung:

1. `app/` = màn hình và route
2. `components/` = khối UI và feature tái sử dụng
3. `lib/` = giao tiếp backend và utility
4. route được chia theo role: `admin`, `teacher`, `parent`, `student`

## Suggested Re-read Order

Nếu sau này cần đọc lại code mà muốn vào nhanh:

1. `app/layout.tsx`
2. `app/page.tsx`
3. `app/login/page.tsx`
4. `components/AuthGate.tsx`
5. `components/AssistantWorkspace.tsx`
6. `lib/api.ts`
7. sau đó mới đi vào từng nhánh `app/parent`, `app/teacher`, `app/admin`, `app/student`
