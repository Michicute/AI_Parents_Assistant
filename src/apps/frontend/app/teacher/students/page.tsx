import { AppShell } from "@/components/AppShell";
import { TeacherClassSelectionPage } from "@/components/teacher/TeacherClassFlow";

export default function TeacherStudentsPage() {
  return (
    <AppShell role="teacher" title="Học viên" subtitle="Chọn lớp trước để quản lý học viên đúng phạm vi phụ trách">
      <TeacherClassSelectionPage mode="students" />
    </AppShell>
  );
}
