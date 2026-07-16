import { AppShell } from "@/components/AppShell";
import { TeacherClassOverviewPage } from "@/components/teacher/TeacherClassFlow";

export default async function TeacherClassOverviewRoute({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;

  return (
    <AppShell role="teacher" title="Tổng quan lớp">
      <TeacherClassOverviewPage classId={classId} />
    </AppShell>
  );
}
