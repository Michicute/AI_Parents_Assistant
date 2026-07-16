"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Sparkles, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ZaloQrSection } from "@/components/ZaloQrSection";
import {
  AiInsightResponse,
  getStudentAiInsights,
  getStudentAssessmentSummary,
  getStudentDashboard,
  StudentAssessmentSummaryResponse,
  StudentDashboardResponse,
} from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";

const skillLabels: Record<string, string> = {
  reading: "Đọc",
  listening: "Nghe",
  speaking: "Nói",
  writing: "Viết",
  grammar: "Ngữ pháp",
  vocabulary: "Từ vựng",
};

export default function StudentPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;
  const accessToken = getAccessToken();
  const [dashboard, setDashboard] = useState<StudentDashboardResponse | null>(null);
  const [assessmentSummary, setAssessmentSummary] = useState<StudentAssessmentSummaryResponse | null>(null);
  const [latestInsight, setLatestInsight] = useState<AiInsightResponse | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function loadStudentDashboard() {
      const token = getAccessToken();
      if (!token || !studentId) return;

      try {
        setStatus("");
        const [dashboardData, insights, summaryData] = await Promise.all([
          getStudentDashboard(studentId, token),
          getStudentAiInsights(studentId, token).catch(() => []),
          getStudentAssessmentSummary(studentId, token).catch(() => null),
        ]);

        setDashboard(dashboardData);
        setAssessmentSummary(summaryData);
        setLatestInsight(insights[0] ?? null);
      } catch (error) {
        setDashboard(null);
        setAssessmentSummary(null);
        setLatestInsight(null);
        setStatus(error instanceof Error ? error.message : "Không thể tải hồ sơ học viên");
      }
    }

    void loadStudentDashboard();
  }, [studentId]);

  const student = dashboard?.student;
  const progress = dashboard?.progress;

  return (
    <AppShell
      role="parent"
      title={student?.full_name ?? "Hồ sơ học viên"}
      subtitle={student && progress ? `${student.level} - ${progress.course}` : "Dữ liệu học viên được phân quyền từ trung tâm"}
      sidebarWidget={studentId ? <ZaloQrSection studentId={studentId} accessToken={accessToken} compact /> : undefined}
    >
      {status ? <p className="mb-4 rounded-[16px] border border-coral/30 bg-coral-light p-4 text-body font-semibold text-coral-dark">{status}</p> : null}
      {!dashboard ? (
        <section className="space-y-4 animate-pulse-soft">
          <div className="skeleton h-40 rounded-[20px]" />
          <div className="grid gap-4 xl:grid-cols-[0.84fr_1.16fr]">
            <div className="skeleton h-[720px] rounded-[20px]" />
            <div className="skeleton h-[720px] rounded-[20px]" />
          </div>
        </section>
      ) : (
        <StudentProfile dashboard={dashboard} assessmentSummary={assessmentSummary} latestInsight={latestInsight} />
      )}
    </AppShell>
  );
}

function StudentProfile({
  dashboard,
  assessmentSummary,
  latestInsight,
}: {
  dashboard: StudentDashboardResponse;
  assessmentSummary: StudentAssessmentSummaryResponse | null;
  latestInsight: AiInsightResponse | null;
}) {
  const student = dashboard.student;
  const progress = dashboard.progress;
  const skills = useMemo(() => Object.entries(progress.skills).sort((a, b) => b[1].average - a[1].average), [progress.skills]);
  const [activeScoreTab, setActiveScoreTab] = useState<"skills" | "assessments">("skills");
  const attendancePresent = dashboard.attendance.filter((item) => item.status === "present").length;
  const attendanceTotal = dashboard.attendance.length;
  const attendancePercent = attendanceTotal > 0 ? Math.round(progress.attendance_rate * 100) : 0;
  const attendanceDetail = attendanceTotal > 0 ? `${attendancePresent}/${attendanceTotal} buổi có mặt` : "Chưa có dữ liệu điểm danh";
  const weakestSkill = [...skills].sort((a, b) => a[1].average - b[1].average)[0];
  const parsedInsight = parseInsightContent(latestInsight?.content);

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-3">
        <MetricTile icon={<TrendingUp className="h-6 w-6" />} label="Current Level" value={student.level} detail={progress.course} tone="green" />
        <MetricTile icon={<CalendarDays className="h-6 w-6" />} label="Attendance" value={attendanceTotal > 0 ? `${attendancePercent}%` : "--"} detail={attendanceDetail} tone="neutral" />
        <MetricTile
          icon={<ClipboardList className="h-6 w-6" />}
          label="Recent Average"
          value={skills.length > 0 ? `${Math.round(progress.recent_average)}%` : "--"}
          detail={skills.length > 0 ? `${skills.length} kỹ năng đã có dữ liệu` : "Chưa có dữ liệu kỹ năng"}
          tone="gold"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <aside className="space-y-6">
          <ScoreSummaryPanel
            activeTab={activeScoreTab}
            onTabChange={setActiveScoreTab}
            skills={skills}
            assessmentSummary={assessmentSummary}
          />
          <TeacherFeedbackPanel feedback={dashboard.teacher_feedback} />
        </aside>

        <section className="space-y-6">
          <section className="portal-section p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">Skill Progress</p>
                <h3 className="mt-3 text-heading-2 text-ink">Bản đồ kỹ năng</h3>
              </div>
              {weakestSkill ? (
                <span
                  className={`rounded-full border px-3 py-1 text-caption font-extrabold ${scoreAppearance(weakestSkill[1].average).badge}`}
                  style={{ color: scoreAppearance(weakestSkill[1].average).foreground }}
                >
                  {labelForSkill(weakestSkill[0])} cần bồi dưỡng
                </span>
              ) : (
                <span className="rounded-full border border-[#d9e2d3] bg-muted px-3 py-1 text-caption font-semibold text-ink-muted">Đang cập nhật</span>
              )}
            </div>

            {skills.length === 0 ? (
              <div className="mt-6 rounded-[16px] bg-muted p-4 text-body text-ink-muted">Chưa có điểm kỹ năng cho học viên này.</div>
            ) : (
              <div className="mt-6 space-y-3">
                {skills.map(([skill, score]) => (
                  <div key={skill} className={`rounded-[16px] border p-4 ${scoreAppearance(score.average).card}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-base font-semibold text-ink">{labelForSkill(skill)}</p>
                      <SkillStatus value={score.average} />
                    </div>
                    <div className="mt-4">
                      <ProgressRow value={Math.round(score.average)} animate />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <ParentInsightPanel insight={latestInsight} parsedInsight={parsedInsight} />
        </section>
      </div>
    </div>
  );
}

function ScoreSummaryPanel({
  activeTab,
  onTabChange,
  skills,
  assessmentSummary,
}: {
  activeTab: "skills" | "assessments";
  onTabChange: (tab: "skills" | "assessments") => void;
  skills: Array<[string, { average: number; latest: number }]>;
  assessmentSummary: StudentAssessmentSummaryResponse | null;
}) {
  return (
    <section className="portal-section p-6">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">Assessment Summary</p>
          <h3 className="mt-3 text-heading-2 text-ink">Điểm số và đánh giá</h3>
        </div>
        <div className="grid grid-cols-2 gap-2" aria-label="Chọn loại điểm">
          <button type="button" onClick={() => onTabChange("skills")} className={`min-h-[44px] rounded-[14px] border px-3 text-sm font-semibold ${activeTab === "skills" ? "border-brand bg-brand text-white" : "border-[#d9e2d3] bg-white text-ink"}`}>
            Điểm kỹ năng
          </button>
          <button type="button" onClick={() => onTabChange("assessments")} className={`min-h-[44px] rounded-[14px] border px-3 text-sm font-semibold ${activeTab === "assessments" ? "border-brand bg-brand text-white" : "border-[#d9e2d3] bg-white text-ink"}`}>
            Điểm bài kiểm tra
          </button>
        </div>
      </div>

      {activeTab === "skills" ? (
        skills.length === 0 ? (
          <div className="mt-5 rounded-[16px] bg-muted p-4 text-body text-ink-muted">Chưa có điểm kỹ năng cho học viên này.</div>
        ) : (
          <div className="mt-5 space-y-3">
            {skills.map(([skill, score]) => (
              <div key={skill} className={`rounded-[18px] border p-5 ${scoreAppearance(score.latest).card}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-ink">{labelForSkill(skill)}</p>
                  <ScoreIcon value={score.latest} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">Điểm trung bình</p>
                    <p className={`mt-1 text-xl font-bold ${scoreAppearance(score.average).text}`}>{Math.round(score.average)}%</p>
                  </div>
                  <div className="border-l border-[#d9e2d3] pl-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">Điểm gần nhất</p>
                    <p className={`mt-1 text-xl font-bold ${scoreAppearance(score.latest).text}`}>{Math.round(score.latest)}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : !assessmentSummary || assessmentSummary.assessments.length === 0 ? (
        <div className="mt-5 rounded-[16px] bg-muted p-4 text-body text-ink-muted">Chưa có điểm bài kiểm tra cho học viên này.</div>
      ) : (
        <div className="mt-5 space-y-3">
          {assessmentSummary.assessments.map((assessment) => (
            <article key={assessment.id} className={`rounded-[18px] border p-4 ${assessment.total_score === null ? "border-[#d9e2d3] bg-surface" : scoreAppearance((assessment.total_score / assessment.max_score) * 100).card}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-ink">{assessment.title}</p>
                  <p className="mt-1 text-caption text-ink-muted">{assessment.assessment_date || "Chưa có ngày kiểm tra"}</p>
                </div>
                <div className="flex items-center gap-3">
                  {assessment.total_score !== null ? <ScoreIcon value={(assessment.total_score / assessment.max_score) * 100} /> : null}
                  <div className={`rounded-full bg-white/80 px-3 py-1.5 text-sm font-semibold ${assessment.total_score === null ? "text-ink-muted" : scoreAppearance((assessment.total_score / assessment.max_score) * 100).text}`}>
                    {assessment.total_score ?? "-"}/{assessment.max_score}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TeacherFeedbackPanel({ feedback }: { feedback: StudentDashboardResponse["teacher_feedback"] }) {
  return (
    <section className="portal-section p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">Teacher Feedback</p>
          <h3 className="mt-3 text-heading-3 text-ink">Nhận xét giáo viên</h3>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1.5 text-caption font-semibold text-brand">{feedback.length} nhận xét</span>
      </div>

      {feedback.length === 0 ? (
        <div className="mt-5 rounded-[16px] bg-muted p-4 text-body text-ink-muted">Chưa có nhận xét giáo viên cho học viên này.</div>
      ) : (
        <div className="mt-5 space-y-3">
          {feedback.map((item) => (
            <article key={item.id} className="rounded-[16px] border border-[#d9e2d3] bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-base font-semibold text-ink">{item.teacher_name}</p>
                <p className="text-caption text-ink-muted">{new Date(item.created_at).toLocaleDateString("vi-VN")}</p>
              </div>
              <p className="mt-3 text-body leading-7 text-ink-soft">{item.comment}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ParentInsightPanel({
  insight,
  parsedInsight,
}: {
  insight: AiInsightResponse | null;
  parsedInsight: {
    summary?: string;
    new_strengths?: string[];
    new_weaknesses?: string[];
    parent_actions?: string[];
  } | null;
}) {
  return (
    <section className="portal-section p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">AI Insight</p>
          <h3 className="mt-3 text-heading-3 text-ink">Nhận định mới từ bài kiểm tra</h3>
        </div>
        <Sparkles className="h-5 w-5 text-brand" aria-hidden="true" />
      </div>

      {!insight ? (
        <p className="mt-5 rounded-[16px] bg-muted p-4 text-body text-ink-muted">Chưa có AI Insight mới từ bài kiểm tra đã chấm.</p>
      ) : parsedInsight ? (
        <div className="mt-5 space-y-4 text-body text-ink-soft">
          <div className="rounded-[16px] bg-muted p-4 font-medium text-ink">{parsedInsight.summary || "Đã có insight mới từ bài kiểm tra."}</div>
          <InsightList title="Điểm mạnh" items={parsedInsight.new_strengths} />
          <InsightList title="Cần hỗ trợ" items={parsedInsight.new_weaknesses} />
          <InsightList title="Gợi ý tại nhà" items={parsedInsight.parent_actions} />
        </div>
      ) : (
        <p className="mt-5 rounded-[16px] bg-muted p-4 text-body text-ink-soft">{insight.content}</p>
      )}
    </section>
  );
}

function InsightList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="font-semibold text-ink">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 rounded-[14px] border border-[#d9e2d3] bg-surface px-3 py-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function parseInsightContent(value?: string) {
  if (!value) return null;
  try {
    return JSON.parse(value) as {
      summary?: string;
      new_strengths?: string[];
      new_weaknesses?: string[];
      parent_actions?: string[];
    };
  } catch {
    return null;
  }
}

function labelForSkill(skill: string) {
  return skillLabels[skill] || skill;
}

function MetricTile({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "green" | "gold" | "neutral" }) {
  const tones = {
    green: "bg-brand-50 text-brand",
    gold: "bg-gold-light text-gold-dark",
    neutral: "bg-muted text-ink-soft",
  };

  return (
    <article className="portal-section flex items-center gap-5 p-6">
      <div className={`grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[18px] ${tones[tone]}`}>{icon}</div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">{label}</p>
        <p className="mt-2 text-[2rem] font-extrabold leading-none tracking-[-0.03em] text-ink">{value}</p>
        <p className="mt-2 text-body text-ink-soft">{detail}</p>
      </div>
    </article>
  );
}

function scoreAppearance(value: number) {
  if (value >= 80) {
    return {
      card: "border-[#cde6d2] bg-[#f3faf5]",
      fill: "bg-[#17853b]",
      text: "text-[#126b31]",
      badge: "border-[#b9ddc1] bg-[#e5f5e9] text-[#126b31]",
      foreground: "#0b5d28",
      label: "Vững",
    };
  }
  if (value >= 50) {
    return {
      card: "border-[#ead99b] bg-[#fff9e8]",
      fill: "bg-[#d39a16]",
      text: "text-[#9a6900]",
      badge: "border-[#ead080] bg-[#fff1bd] text-[#875c00]",
      foreground: "#754d00",
      label: "Cần chú ý",
    };
  }
  return {
    card: "border-[#f1c8c5] bg-[#fff5f4]",
    fill: "bg-[#d4433b]",
    text: "text-[#b4231d]",
    badge: "border-[#efc0bc] bg-[#fde7e5] text-[#b4231d]",
    foreground: "#9f1f19",
    label: "Cần luyện",
  };
}

function SkillStatus({ value }: { value: number }) {
  const appearance = scoreAppearance(value);
  return (
    <span className={`rounded-full border px-3 py-1 text-caption font-extrabold ${appearance.badge}`} style={{ color: appearance.foreground }}>
      {appearance.label}
    </span>
  );
}

function ScoreIcon({ value }: { value: number }) {
  const appearance = scoreAppearance(value);
  const isStrong = value >= 80;
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${appearance.badge}`} aria-label={appearance.label}>
      {isStrong ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5" aria-hidden="true" />}
    </span>
  );
}

function ProgressRow({ value, animate = false }: { value: number; animate?: boolean }) {
  const boundedValue = Math.max(0, Math.min(100, value));
  const [displayValue, setDisplayValue] = useState(animate ? 0 : boundedValue);
  const appearance = scoreAppearance(boundedValue);

  useEffect(() => {
    if (!animate) {
      setDisplayValue(boundedValue);
      return;
    }
    setDisplayValue(0);
    const frame = window.requestAnimationFrame(() => setDisplayValue(boundedValue));
    return () => window.cancelAnimationFrame(frame);
  }, [animate, boundedValue]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-caption font-semibold text-ink-muted">
        <span>Tiến độ hiện tại</span>
        <span className={appearance.text}>{boundedValue}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#e9eee6]">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none ${appearance.fill}`}
          style={{ width: `${displayValue}%` }}
        />
      </div>
    </div>
  );
}
