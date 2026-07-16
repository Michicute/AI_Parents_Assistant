# Teacher UI Rebuild Spec

## Mục tiêu

Thiết kế lại toàn bộ giao diện khu vực `teacher` theo hướng `class-first`.

Giáo viên phải làm việc theo ngữ cảnh lớp học trước, sau đó mới đi vào:

- học viên
- điểm số
- bài kiểm tra
- điểm danh
- báo cáo

Không giữ flow cũ theo kiểu màn hình rời rạc theo `student` hoặc `assessment` mà thiếu ngữ cảnh lớp.

## Yêu cầu chính

Khu vực `teacher` phải có đúng các tab điều hướng chính sau:

1. `Dashboard`
2. `Quản lý lớp học`
3. `Điểm số`
4. `Bài kiểm tra`
5. `Báo cáo`

## Cấu trúc route đề xuất

```text
src/apps/frontend/app/teacher/
├─ dashboard/
│  └─ page.tsx
├─ classes/
│  ├─ page.tsx
│  └─ [classId]/
│     ├─ page.tsx
│     ├─ students/
│     │  ├─ page.tsx
│     │  └─ [studentId]/
│     │     └─ page.tsx
│     ├─ grades/
│     │  └─ page.tsx
│     ├─ assessments/
│     │  ├─ page.tsx
│     │  ├─ new/
│     │  │  └─ page.tsx
│     │  └─ [assessmentId]/
│     │     ├─ page.tsx
│     │     └─ print/
│     │        └─ page.tsx
│     ├─ attendance/
│     │  └─ page.tsx
│     └─ reports/
│        └─ page.tsx
└─ reports/
   └─ page.tsx
```

## Ý nghĩa từng route

### `teacher/dashboard/page.tsx`

Trang tổng quan giáo viên.

Hiển thị:

- số lớp đang phụ trách
- tổng số học viên
- tổng số bài kiểm tra
- điểm danh gần đây hoặc trạng thái lớp gần đây
- các lối tắt sang từng lớp học

### `teacher/classes/page.tsx`

Tab `Quản lý lớp học`.

Hiển thị danh sách tất cả lớp học giáo viên đang phụ trách.

Mỗi item lớp nên có:

- tên lớp
- lịch học
- phòng học
- số học viên
- số bài kiểm tra
- CTA `Xem chi tiết lớp`

### `teacher/classes/[classId]/page.tsx`

Trang overview của một lớp.

Hiển thị:

- tên lớp
- lịch học
- phòng học
- course hoặc level nếu có
- số học viên
- số bài kiểm tra
- các action/card dẫn tới:
  - danh sách học viên
  - điểm số của lớp
  - bài kiểm tra của lớp
  - điểm danh
  - báo cáo lớp

### `teacher/classes/[classId]/students/page.tsx`

Danh sách học viên trong lớp.

Hiển thị:

- bảng hoặc card danh sách học viên
- tên học viên
- level
- trạng thái học
- CTA `Xem chi tiết`

Có thể có:

- search theo tên
- filter nhẹ nếu cần

### `teacher/classes/[classId]/students/[studentId]/page.tsx`

Chi tiết một học viên trong đúng lớp đó.

Hiển thị:

- thông tin cơ bản học viên
- điểm kỹ năng
- điểm bài kiểm tra
- nhận xét liên quan
- lịch sử học tập nếu có

Lưu ý:

- chỉ hiển thị dữ liệu trong phạm vi giáo viên được phân công
- ưu tiên giữ ngữ cảnh lớp đang mở

### `teacher/classes/[classId]/grades/page.tsx`

Tab `Điểm số` của một lớp.

Hiển thị điểm số theo lớp trước.

Trang này cần thể hiện:

- danh sách học viên của lớp
- điểm trung bình
- điểm kỹ năng
- số bài kiểm tra đã có điểm
- CTA `Xem chi tiết học viên`

Flow mong muốn:

1. giáo viên vào tab `Điểm số`
2. thấy danh sách các lớp hoặc đang ở sẵn một lớp
3. chọn lớp
4. xem toàn bộ điểm của lớp đó
5. có thể bấm vào từng học viên để xem chi tiết

### `teacher/classes/[classId]/assessments/page.tsx`

Tab `Bài kiểm tra` của một lớp.

Hiển thị:

- danh sách bài kiểm tra thuộc lớp đó
- ngày kiểm tra
- mô tả ngắn
- trạng thái hoặc số học viên đã nộp nếu có

Phải có nút rõ ràng ở phía trên:

- `Tạo bài kiểm tra`

Nút này dẫn tới:

- `teacher/classes/[classId]/assessments/new/page.tsx`

### `teacher/classes/[classId]/assessments/new/page.tsx`

Trang tạo bài kiểm tra mới cho lớp đang chọn.

Mục tiêu:

- tách riêng trải nghiệm tạo mới khỏi danh sách
- không nhồi form tạo bài kiểm tra trực tiếp vào màn danh sách nếu muốn UI sạch hơn

### `teacher/classes/[classId]/assessments/[assessmentId]/page.tsx`

Trang chi tiết một bài kiểm tra.

Hiển thị hoặc cho phép xử lý:

- thông tin bài kiểm tra
- câu hỏi
- bài làm học viên
- chấm điểm
- AI insight nếu có
- link sang bản in

### `teacher/classes/[classId]/assessments/[assessmentId]/print/page.tsx`

Bản in đề kiểm tra.

### `teacher/classes/[classId]/attendance/page.tsx`

Điểm danh của lớp.

Hiển thị:

- chọn ngày học
- danh sách học viên
- trạng thái có mặt/vắng mặt
- nút lưu

### `teacher/classes/[classId]/reports/page.tsx`

Báo cáo của riêng một lớp.

Có thể gồm:

- chuyên cần của lớp
- phân bố điểm
- học viên cần chú ý
- số bài kiểm tra đã thực hiện
- xu hướng mạnh/yếu của lớp

### `teacher/reports/page.tsx`

Tab `Báo cáo` tổng hợp cho giáo viên.

Trang này là view tổng hợp nhiều lớp.

Hiển thị:

- danh sách lớp kèm số liệu chính
- lớp nào cần chú ý
- link vào báo cáo chi tiết từng lớp

## Cấu trúc component đề xuất

```text
src/apps/frontend/components/teacher/
├─ TeacherDashboardOverview.tsx
├─ TeacherClassList.tsx
├─ TeacherClassOverview.tsx
├─ TeacherStudentList.tsx
├─ TeacherStudentDetail.tsx
├─ TeacherClassGrades.tsx
├─ TeacherAssessmentList.tsx
├─ TeacherAssessmentCreateForm.tsx
├─ TeacherAssessmentDetail.tsx
├─ TeacherAttendanceBoard.tsx
├─ TeacherReportsOverview.tsx
└─ TeacherClassReport.tsx
```

Không bắt buộc phải đúng 100% tên file này, nhưng nên bám tư duy tách component theo domain `teacher/class/...` thay vì nhồi hết logic vào vài file lớn.

## Điều hướng chính mong muốn

Menu teacher phải là:

```text
Dashboard
Quản lý lớp học
Điểm số
Bài kiểm tra
Báo cáo
```

## Flow UX mong muốn

### 1. Dashboard

- vào là thấy tổng quan giáo viên
- có shortcut sang từng lớp

### 2. Quản lý lớp học

- thấy toàn bộ lớp phụ trách
- chọn một lớp
- vào trang chi tiết lớp
- trong đó thấy:
  - thông tin lớp
  - danh sách học viên
  - link sang điểm số, bài kiểm tra, điểm danh, báo cáo

### 3. Điểm số

- xem điểm theo từng lớp
- chọn một lớp
- xem bảng điểm lớp đó
- bấm vào học viên để xem chi tiết

### 4. Bài kiểm tra

- xem bài kiểm tra theo từng lớp
- chọn một lớp
- thấy danh sách bài kiểm tra của lớp
- có nút `Tạo bài kiểm tra` ở phía trên
- bấm vào từng bài để xem chi tiết/chấm điểm/quản lý

### 5. Báo cáo

- xem overview báo cáo các lớp
- chọn lớp để xem báo cáo chi tiết của lớp đó

## Quy tắc logic

1. Toàn bộ teacher flow phải là `class-first`.
2. Mọi màn chi tiết học viên hoặc bài kiểm tra phải giữ được ngữ cảnh lớp.
3. Không để giáo viên rơi vào màn hình chi tiết mà không biết đang thuộc lớp nào.
4. Không dùng flow cũ kiểu vào `students`, `grades`, `assessments` mà thiếu tầng lớp học.
5. Các route cũ có thể bỏ hoặc redirect sang route mới nếu cần.

## Hướng xử lý route cũ

Nếu đang có các route cũ như:

- `teacher/students`
- `teacher/students/[studentId]`
- `teacher/grades`
- `teacher/assessments`
- `teacher/assessments/[assessmentId]`
- `teacher/attendance`

thì nên xử lý một trong hai cách:

1. thay thế hoàn toàn bằng route mới
2. hoặc giữ route cũ nhưng redirect sang route mới theo `classId`

Ưu tiên cách 1 nếu đang làm lại toàn bộ giao diện.

## Giao diện mong muốn

Phong cách giữ theo portal hiện tại:

- clean academic portal
- dashboard nội bộ
- class-first
- hierarchy rõ
- card trắng, border mảnh, shadow nhẹ
- không mang cảm giác landing page marketing

## Dữ liệu cần dùng lại từ hệ thống hiện tại

Có thể tái sử dụng các API/backend logic hiện có nếu phù hợp, đặc biệt là:

- lấy danh sách lớp giáo viên phụ trách
- lấy học viên
- lấy bài kiểm tra theo lớp
- lấy điểm theo học viên
- lấy phiên điểm danh theo lớp

Nhưng frontend cần được tổ chức lại theo route và UI mới.

## Mục tiêu triển khai

AI thực hiện cần:

1. tạo lại cấu trúc route teacher theo spec này
2. cập nhật menu điều hướng teacher
3. chia lại UI theo 5 tab chính
4. chuyển toàn bộ teacher flow sang class-first
5. giữ style đồng bộ với design system hiện tại
6. hạn chế làm file quá lớn, ưu tiên tách component theo domain

## Ghi chú cuối

Đây là spec cho việc làm lại UI teacher.

Ưu tiên:

- cấu trúc đúng
- điều hướng rõ
- logic class-first rõ ràng

Không ưu tiên giữ nguyên layout cũ nếu layout cũ không còn phù hợp.
