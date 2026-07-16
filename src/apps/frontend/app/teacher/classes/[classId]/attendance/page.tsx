import { AppShell } from "@/components/AppShell";
import { TeacherClassAttendancePage } from "@/components/teacher/TeacherClassFlow";

export default async function TeacherClassAttendanceRoute({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;

  return (
    <AppShell role="teacher" title="Điểm danh theo lớp">
      <TeacherClassAttendancePage classId={classId} />
    </AppShell>
  );
}
