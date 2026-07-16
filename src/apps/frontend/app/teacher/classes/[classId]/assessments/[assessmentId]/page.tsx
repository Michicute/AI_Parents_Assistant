import { AssessmentManager } from "@/components/AssessmentManager";
import { AppShell } from "@/components/AppShell";

export default async function TeacherClassAssessmentDetailRoute({ params }: { params: Promise<{ classId: string; assessmentId: string }> }) {
  const { classId, assessmentId } = await params;

  return (
    <AppShell role="teacher" title="Quản lý bài kiểm tra" subtitle="Làm việc theo lớp: thêm câu hỏi, nhập bài làm và xem kết quả học viên">
      <AssessmentManager assessmentId={assessmentId} initialClassId={classId} />
    </AppShell>
  );
}
