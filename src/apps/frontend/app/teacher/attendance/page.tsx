import { AppShell } from "@/components/AppShell";
import { TeacherClassSelectionPage } from "@/components/teacher/TeacherClassFlow";

export default function TeacherAttendancePage() {
  return (
    <AppShell role="teacher" title="Điểm danh" subtitle="Chọn lớp trước khi cập nhật trạng thái có mặt/vắng mặt">
      <TeacherClassSelectionPage mode="attendance" />
    </AppShell>
  );
}
