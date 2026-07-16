import { AppShell } from "@/components/AppShell";
import { TeacherClassStudentsPage } from "@/components/teacher/TeacherClassFlow";

export default async function TeacherClassStudentsRoute({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;

  return (
    <AppShell role="teacher" title="Học viên">
      <TeacherClassStudentsPage classId={classId} />
    </AppShell>
  );
}
