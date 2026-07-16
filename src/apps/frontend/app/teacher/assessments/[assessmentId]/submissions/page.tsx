import { AssessmentManager } from "@/components/AssessmentManager";
import { AppShell } from "@/components/AppShell";

export default async function TeacherAssessmentSubmissionsPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;

  return (
    <AppShell role="teacher" title="Bài làm của học viên" subtitle="Theo dõi trạng thái chấm bài và AI Insight theo từng học viên">
      <AssessmentManager assessmentId={assessmentId} rosterOnly />
    </AppShell>
  );
}
