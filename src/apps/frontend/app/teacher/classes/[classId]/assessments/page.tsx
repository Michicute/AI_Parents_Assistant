import { AppShell } from "@/components/AppShell";
import { TeacherClassAssessmentsPage } from "@/components/teacher/TeacherClassFlow";

export default async function TeacherClassAssessmentsRoute({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;

  return (
    <AppShell role="teacher" title="Bài kiểm tra theo lớp" subtitle="Tạo và quản lý bài kiểm tra trong phạm vi lớp">
      <TeacherClassAssessmentsPage classId={classId} />
    </AppShell>
  );
}
