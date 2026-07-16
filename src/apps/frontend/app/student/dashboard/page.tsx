"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getStudentAssessments, StudentAssessmentListItem } from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";

export default function StudentDashboardPage() {
  const [assessments, setAssessments] = useState<StudentAssessmentListItem[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAssessments() {
      const token = getAccessToken();
      if (!token) return;
      try {
        setAssessments(await getStudentAssessments(token));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Không thể tải bài kiểm tra");
      } finally {
        setLoading(false);
      }
    }
    void loadAssessments();
  }, []);

  const pending = assessments.filter((a) => !a.submitted);
  const submitted = assessments.filter((a) => a.submitted);

  return (
    <AppShell role="student" title="Bài kiểm tra" subtitle="Chỉ hiển thị bài kiểm tra thuộc lớp học viên đang theo học">
      {status ? <p className="mb-4 portal-card border-coral/30 bg-coral-light/50 text-sm font-bold text-coral-dark">{status}</p> : null}

      {loading ? (
        <div className="portal-section animate-pulse-soft">
          <div className="h-6 w-48 rounded-lg bg-muted" />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="h-40 rounded-4xl bg-muted" />
            <div className="h-40 rounded-4xl bg-muted" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <section className="portal-section">
              <SectionHeader icon={Clock} label="Chưa nộp" title={`${pending.length} bài cần làm`} />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {pending.map((assessment) => (
                  <AssessmentCard key={assessment.id} assessment={assessment} />
                ))}
              </div>
            </section>
          )}

          <section className="portal-section">
            <SectionHeader icon={ClipboardList} label="Tất cả" title="Danh sách bài kiểm tra" />
            {assessments.length === 0 ? (
              <div className="mt-4">
                <EmptyState icon={ClipboardList} title="Chưa có bài kiểm tra" description="Bài kiểm tra sẽ xuất hiện khi giáo viên giao bài cho lớp." />
              </div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {assessments.map((assessment) => (
                  <AssessmentCard key={assessment.id} assessment={assessment} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function AssessmentCard({ assessment }: { assessment: StudentAssessmentListItem }) {
  return (
    <article className="portal-card group flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-bold text-brand">{assessment.assessment_date || "Chưa đặt ngày"}</p>
          <h3 className="mt-1 text-heading-3 text-ink">{assessment.title}</h3>
          <p className="mt-1 text-body text-ink-muted line-clamp-2">{assessment.description || "Không có mô tả"}</p>
        </div>
        <span className={`portal-badge shrink-0 ${assessment.submitted ? "bg-brand-50 text-brand ring-brand-100" : "bg-gold-light text-gold-dark ring-gold/30"}`}>
          {assessment.submitted ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {assessment.submitted ? "Đã nộp" : "Chưa nộp"}
        </span>
      </div>
      <p className="mt-3 text-body font-semibold text-ink-muted">{assessment.question_count} câu hỏi</p>
      <Link
        href={`/student/assessments/${assessment.id}`}
        className="portal-btn-primary mt-4 self-start"
      >
        {assessment.submitted ? "Xem câu trả lời" : "Làm bài"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  );
}
