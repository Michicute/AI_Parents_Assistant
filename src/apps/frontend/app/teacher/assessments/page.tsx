import { AppShell } from "@/components/AppShell";
import { TeacherClassSelectionPage } from "@/components/teacher/TeacherClassFlow";

export default function TeacherAssessmentsPage() {
  return (
    <AppShell role="teacher" title="Bài kiểm tra" subtitle="Chọn lớp trước để tạo, chấm và theo dõi bài kiểm tra">
      <TeacherClassSelectionPage mode="assessments" />
    </AppShell>
  );
}
