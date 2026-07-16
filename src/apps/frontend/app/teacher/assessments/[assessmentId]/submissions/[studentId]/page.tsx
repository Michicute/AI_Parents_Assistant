import { AssessmentManager } from "@/components/AssessmentManager";
import { AppShell } from "@/components/AppShell";

export default async function TeacherStudentSubmissionPage({ params }: { params: Promise<{ assessmentId: string; studentId: string }> }) {
  const { assessmentId, studentId } = await params;

  return (
    <AppShell role="teacher" title="Kết quả bài làm" subtitle="OCR bài giấy, chấm điểm và duyệt AI Insight">
      <AssessmentManager assessmentId={assessmentId} initialStudentId={studentId} submissionOnly />
    </AppShell>
  );
}
