import { AppShell } from "@/components/AppShell";
import { TeacherClassesPage } from "@/components/teacher/TeacherClassFlow";

export default function TeacherClassesRoute() {
  return (
    <AppShell role="teacher" title="Lớp học của tôi">
      <TeacherClassesPage />
    </AppShell>
  );
}
