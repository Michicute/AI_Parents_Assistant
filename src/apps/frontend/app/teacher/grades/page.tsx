import { AppShell } from "@/components/AppShell";
import { TeacherClassSelectionPage } from "@/components/teacher/TeacherClassFlow";

export default function TeacherGradesPage() {
  return (
    <AppShell role="teacher" title="Điểm số" subtitle="Chọn lớp trước để xem bảng điểm và tiến độ theo kỹ năng">
      <TeacherClassSelectionPage mode="grades" />
    </AppShell>
  );
}
