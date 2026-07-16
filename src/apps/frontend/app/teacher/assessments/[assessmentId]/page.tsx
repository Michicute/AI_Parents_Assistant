import { AssessmentManager } from "@/components/AssessmentManager";
import { AppShell } from "@/components/AppShell";

export default async function TeacherAssessmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<{ classId?: string }>;
}) {
  const { assessmentId } = await params;
  const { classId } = await searchParams;

  return (
    <AppShell role="teacher" title="Quản lý bài kiểm tra" subtitle="Làm việc theo lớp: thêm câu hỏi, nhập bài làm và xem điểm mạnh/yếu của học viên trong lớp đang chọn">
      <AssessmentManager assessmentId={assessmentId} initialClassId={classId} />
    </AppShell>
  );
}
