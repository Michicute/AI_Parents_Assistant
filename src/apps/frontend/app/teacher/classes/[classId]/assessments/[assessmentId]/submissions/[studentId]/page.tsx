import { AssessmentManager } from "@/components/AssessmentManager";
import { AppShell } from "@/components/AppShell";

export default async function TeacherClassStudentSubmissionPage({ params }: { params: Promise<{ classId: string; assessmentId: string; studentId: string }> }) {
  const { classId, assessmentId, studentId } = await params;

  return (
    <AppShell role="teacher" title="Kết quả bài làm" subtitle="OCR bài giấy, chấm điểm và duyệt AI Insight">
      <AssessmentManager assessmentId={assessmentId} initialClassId={classId} initialStudentId={studentId} submissionOnly />
    </AppShell>
  );
}
