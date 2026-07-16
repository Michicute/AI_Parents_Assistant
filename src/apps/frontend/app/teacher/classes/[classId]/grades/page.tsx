import { AppShell } from "@/components/AppShell";
import { GradeManager } from "@/components/GradeManager";

export default async function TeacherClassGradesRoute({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;

  return (
    <AppShell role="teacher" title="Bảng điểm theo lớp" subtitle="Điểm số được lọc theo lớp đang mở">
      <GradeManager initialClassId={classId} />
    </AppShell>
  );
}
