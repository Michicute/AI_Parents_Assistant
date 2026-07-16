"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CalendarCheck, Check, CheckCircle2, ClipboardCheck, LibraryBig, Plus, RefreshCw, Save, Search, Sparkles, Trash2, UploadCloud, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  AssessmentResponse,
  AttendanceSessionResponse,
  ClassDashboardResponse,
  ClassSummary,
  createAssessment,
  deleteAssessment,
  getClassAssessments,
  getClassAttendanceDates,
  getClassAttendanceSession,
  getClassDashboard,
  getClassStudents,
  getTeacherDashboardOverview,
  getTeacherClasses,
  saveClassAttendance,
  StudentSummary,
  TeacherStudentAlert,
} from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";

const classSkillLabels: Record<string, string> = {
  reading: "Đọc hiểu",
  listening: "Nghe hiểu",
  speaking: "Nói",
  writing: "Viết",
  grammar: "Ngữ pháp",
  vocabulary: "Từ vựng",
};

type ClassStats = {
  students: StudentSummary[];
  assessments: AssessmentResponse[];
};

type AttendanceStatus = "present" | "absent";

type ClassEntryMode = "students" | "attendance" | "grades" | "assessments";

const classEntryConfig = {
  students: {
    eyebrow: "Học viên",
    title: "Chọn lớp để xem học viên",
    description: "Giáo viên chọn lớp trước, sau đó mới xem danh sách và chi tiết học viên trong đúng ngữ cảnh lớp.",
    cta: "Xem học viên",
    route: "students",
    metric: "Học viên",
    icon: Users,
  },
  attendance: {
    eyebrow: "Điểm danh",
    title: "Chọn lớp để điểm danh",
    description: "Mỗi buổi điểm danh luôn bắt đầu từ lớp học để tránh nhầm học viên giữa các lớp.",
    cta: "Mở điểm danh",
    route: "attendance",
    metric: "Học viên",
    icon: CalendarCheck,
  },
  grades: {
    eyebrow: "Điểm số",
    title: "Chọn lớp để xem điểm số",
    description: "Điểm số được tổng hợp theo lớp trước, sau đó giáo viên có thể đi vào từng học viên.",
    cta: "Xem điểm lớp",
    route: "grades",
    metric: "Học viên",
    icon: BarChart3,
  },
  assessments: {
    eyebrow: "Bài kiểm tra",
    title: "Chọn lớp để quản lý bài kiểm tra",
    description: "Danh sách bài kiểm tra, tạo mới và chấm điểm đều được đặt trong ngữ cảnh lớp.",
    cta: "Xem bài kiểm tra",
    route: "assessments",
    metric: "Bài kiểm tra",
    icon: ClipboardCheck,
  },
} satisfies Record<ClassEntryMode, { eyebrow: string; title: string; description: string; cta: string; route: string; metric: string; icon: typeof Users }>;

function BackLink({ href, label = "Quay lại" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-2 rounded-xl text-sm font-bold text-brand hover:text-brand-dark">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function ClassHeader({ classRecord, eyebrow, title }: { classRecord: ClassSummary; eyebrow?: string; title?: string }) {
  return (
    <div className="mb-5 rounded-4xl border border-brand-100 bg-white p-5 shadow-soft">
      <div>
        <p className="text-caption font-bold uppercase tracking-[0.12em] text-brand">{eyebrow || "Lớp học"}</p>
        <h2 className="mt-1 text-heading-2 text-ink">{title || classRecord.name}</h2>
        <p className="mt-2 text-body text-ink-muted">{classRecord.schedule_note || classRecord.location || "Chưa có thông tin lịch học"}</p>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toLocalDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TeacherClassSelectionPage({ mode }: { mode: ClassEntryMode }) {
  const config = classEntryConfig[mode];
  const EntryIcon = config.icon;
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [statsByClass, setStatsByClass] = useState<Record<string, ClassStats>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = getAccessToken();
      if (!token) return;
      setLoading(true);
      try {
        const classData = await getTeacherClasses(token);
        const pairs = await Promise.all(
          classData.map(async (classRecord) => {
            const [students, assessments] = await Promise.all([
              getClassStudents(classRecord.id, token),
              getClassAssessments(classRecord.id, token),
            ]);
            return [classRecord.id, { students, assessments }] as const;
          }),
        );
        setClasses(classData);
        setStatsByClass(Object.fromEntries(pairs));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Không thể tải danh sách lớp");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const filteredClasses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return classes;
    return classes.filter((classRecord) => [classRecord.name, classRecord.location || "", classRecord.schedule_note || ""].some((value) => value.toLowerCase().includes(normalized)));
  }, [classes, query]);

  if (loading) {
    return (
      <section className="portal-section">
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => <div key={item} className="skeleton h-44 rounded-xl" />)}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="portal-section">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-portal-muted">{config.eyebrow}</p>
            <h2 className="mt-2 text-[32px] leading-tight tracking-[-0.02em] text-portal-ink">{config.title}</h2>
            <p className="mt-2 max-w-3xl text-base leading-6 text-portal-muted">{config.description}</p>
          </div>
          <label className="portal-input flex min-w-72 items-center gap-2">
            <Search className="h-4 w-4 text-portal-muted" aria-hidden="true" />
            <input className="w-full bg-transparent outline-none" placeholder="Tìm theo tên lớp, phòng, lịch..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
      </section>

      {status ? <p className="rounded-xl border border-coral-light bg-coral-light/30 p-4 text-sm font-semibold text-coral-dark">{status}</p> : null}
      {classes.length === 0 ? (
        <section className="portal-section">
          <EmptyState icon={EntryIcon} title="Chưa được phân công lớp học" description="Admin sẽ phân công lớp cho tài khoản giáo viên này." />
        </section>
      ) : filteredClasses.length === 0 ? (
        <section className="portal-section">
          <EmptyState icon={Search} title="Không tìm thấy lớp" description="Thử tìm bằng tên lớp, lịch học hoặc phòng học khác." />
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {filteredClasses.map((classRecord, index) => {
            const stats = statsByClass[classRecord.id] || { students: [], assessments: [] };
            const metricValue = mode === "assessments" ? stats.assessments.length : stats.students.length;
            return (
              <Link key={classRecord.id} href={`/teacher/classes/${classRecord.id}/${config.route}`} className="block">
                <article className="portal-card class-card-hover group p-6">
                  <div className="grid gap-6 md:grid-cols-[180px_1fr]">
                    <div className={`flex min-h-40 flex-col justify-between rounded-3xl p-5 text-portal-ink ${index % 2 === 0 ? "bg-portal-mint" : "bg-white ring-1 ring-portal-line"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold opacity-90">{classRecord.location || "English"}</p>
                        <EntryIcon className="h-7 w-7 text-portal-green" aria-hidden="true" />
                      </div>
                      <p className="font-display text-4xl leading-none">{classRecord.name.split(" ")[0]}</p>
                    </div>
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-2xl font-extrabold group-hover:text-portal-green">{classRecord.name}</h3>
                          <p className="mt-3 text-sm text-portal-muted">{classRecord.schedule_note || classRecord.location || "Chưa có lịch học"}</p>
                        </div>
                        <span className="portal-badge">Đang giảng dạy</span>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <span className="rounded-2xl bg-portal-mint p-4"><b className="block text-2xl text-portal-ink">{metricValue}</b>{config.metric}</span>
                        <span className="rounded-2xl bg-portal-mint p-4"><b className="block text-2xl text-portal-ink">{stats.assessments.length}</b>Bài kiểm tra</span>
                      </div>
                      <p className="mt-5 text-sm font-bold text-portal-green">{config.cta} →</p>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TeacherClassesPage() {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [statsByClass, setStatsByClass] = useState<Record<string, ClassStats>>({});
  const [alertedStudentsByClass, setAlertedStudentsByClass] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = getAccessToken();
      if (!token) return;
      setLoading(true);
      try {
        const [classData, dashboardOverview] = await Promise.all([
          getTeacherClasses(token),
          getTeacherDashboardOverview(toLocalDateInputValue(new Date()), 7, token).catch(() => null),
        ]);
        const pairs = await Promise.all(
          classData.map(async (classRecord) => {
            const [students, assessments] = await Promise.all([
              getClassStudents(classRecord.id, token),
              getClassAssessments(classRecord.id, token),
            ]);
            return [classRecord.id, { students, assessments }] as const;
          }),
        );
        const alertedStudentIds = (dashboardOverview?.alerts ?? []).reduce<Record<string, Set<string>>>((acc, alert) => {
          (acc[alert.class_id] ??= new Set()).add(alert.student_id);
          return acc;
        }, {});
        setClasses(classData);
        setStatsByClass(Object.fromEntries(pairs));
        setAlertedStudentsByClass(
          Object.fromEntries(Object.entries(alertedStudentIds).map(([classId, studentIds]) => [classId, studentIds.size])),
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Không thể tải danh sách lớp");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (loading) {
    return (
      <section className="portal-section">
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => <div key={item} className="skeleton h-48 rounded-xl" />)}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {status ? <p className="rounded-xl border border-coral-light bg-coral-light/30 p-4 text-sm font-semibold text-coral-dark">{status}</p> : null}
      <section className="portal-section">
        <SectionHeader icon={LibraryBig} label="Class-first" title="Lớp học của tôi" />
        {classes.length === 0 ? (
          <EmptyState icon={LibraryBig} title="Chưa được phân công lớp học" description="Admin sẽ phân công lớp cho tài khoản giáo viên này." />
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {classes.map((classRecord) => {
              const stats = statsByClass[classRecord.id] || { students: [], assessments: [] };
              const pendingAssessmentCount = stats.assessments.filter((assessment) => {
                const submissionStats = assessment.submission_stats;
                return Boolean(
                  submissionStats &&
                    submissionStats.submitted_students > 0 &&
                    (submissionStats.graded_students < submissionStats.submitted_students ||
                      submissionStats.insight_students < submissionStats.submitted_students),
                );
              }).length;
              const alertedStudentCount = alertedStudentsByClass[classRecord.id] ?? 0;
              return (
                <article key={classRecord.id} className="rounded-4xl border border-brand-100 bg-gradient-to-br from-white to-brand-50/30 p-6 shadow-soft">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-heading-3 text-ink">{classRecord.name}</h3>
                      <p className="mt-2 text-body text-ink-muted">{classRecord.schedule_note || classRecord.location || "Chưa có lịch học"}</p>
                    </div>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand">
                      <LibraryBig className="h-6 w-6" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <span className="rounded-2xl bg-muted p-4"><b className="block text-2xl text-ink">{stats.students.length}</b> học viên</span>
                    <span className="rounded-2xl bg-muted p-4"><b className="block text-2xl text-ink">{stats.assessments.length}</b> bài kiểm tra</span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link href={`/teacher/classes/${classRecord.id}`} className="portal-btn-primary text-sm">
                      Tổng quan
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <Link href={`/teacher/classes/${classRecord.id}/students`} className="portal-btn-secondary relative text-sm">
                      Học viên
                      {alertedStudentCount > 0 ? (
                        <span
                          className="urgent-count-badge student-alert-badge-pulsing absolute -right-2 -top-2 grid min-h-6 min-w-6 place-items-center rounded-full border-2 border-white px-1.5 text-xs font-black leading-none text-white"
                          aria-label={`${alertedStudentCount} học viên đang có cảnh báo`}
                        >
                          {alertedStudentCount > 99 ? "99+" : alertedStudentCount}
                        </span>
                      ) : null}
                    </Link>
                    <Link href={`/teacher/classes/${classRecord.id}/attendance`} className="portal-btn-secondary text-sm">
                      Điểm danh
                    </Link>
                    <Link href={`/teacher/classes/${classRecord.id}/assessments`} className="portal-btn-secondary relative text-sm">
                      Đánh giá
                      {pendingAssessmentCount > 0 ? (
                        <span
                          className="urgent-count-badge assessment-pending-badge-ringing absolute -right-2 -top-2 grid min-h-6 min-w-6 place-items-center rounded-full border-2 border-white px-1.5 text-xs font-black leading-none text-white"
                          aria-label={`${pendingAssessmentCount} bài kiểm tra đang cần thao tác`}
                        >
                          {pendingAssessmentCount > 99 ? "99+" : pendingAssessmentCount}
                        </span>
                      ) : null}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function TeacherClassOverviewPage({ classId }: { classId: string }) {
  const [classRecord, setClassRecord] = useState<ClassSummary | null>(null);
  const [classDashboard, setClassDashboard] = useState<ClassDashboardResponse | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = getAccessToken();
      if (!token) return;
      setLoading(true);
      try {
        const classData = await getTeacherClasses(token);
        const selected = classData.find((item) => item.id === classId) || null;
        if (!selected) {
          setStatus("Bạn không có quyền truy cập lớp này hoặc lớp không tồn tại.");
          setClassRecord(null);
          return;
        }
        setClassRecord(selected);
        setClassDashboard(await getClassDashboard(classId, token));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Không thể tải tổng quan lớp");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [classId]);

  if (loading) return <section className="portal-section"><p className="text-body text-ink-muted">Đang tải lớp học...</p></section>;
  if (!classRecord) return <section className="portal-section"><EmptyState icon={LibraryBig} title="Không mở được lớp" description={status || "Lớp không nằm trong phạm vi phụ trách."} /></section>;

  return (
    <div className="space-y-6">
      <BackLink href="/teacher/classes" label="Quay lại danh sách lớp" />
      <ClassHeader classRecord={classRecord} title={classRecord.name} />
      {status ? <p className="rounded-xl border border-coral-light bg-coral-light/30 p-4 text-sm font-semibold text-coral-dark">{status}</p> : null}
      <ClassTrendOverview dashboard={classDashboard} />
      <section className="grid gap-4 md:grid-cols-3">
        <ClassAction href={`/teacher/classes/${classId}/students`} icon={Users} title="Học viên" description="Xem học viên và bảng điểm chi tiết" />
        <ClassAction href={`/teacher/classes/${classId}/attendance`} icon={CalendarCheck} title="Điểm danh" description="Cập nhật có mặt/vắng mặt theo buổi" />
        <ClassAction href={`/teacher/classes/${classId}/assessments`} icon={ClipboardCheck} title="Đánh giá" description="Tạo và quản lý bài kiểm tra" />
      </section>
    </div>
  );
}

function ClassTrendOverview({ dashboard }: { dashboard: ClassDashboardResponse | null }) {
  return (
    <section className="portal-section">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand">Xu hướng lớp học</p>
          <h2 className="mt-2 text-heading-2 text-ink">Điểm trung bình theo kỹ năng</h2>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand">{dashboard?.total_students ?? 0} học viên</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        {Object.entries(classSkillLabels).map(([skill, label]) => (
          <ClassSkillCircle key={skill} label={label} value={dashboard?.skill_averages[skill as keyof ClassDashboardResponse["skill_averages"]] ?? null} />
        ))}
        <article className={`flex min-h-[150px] flex-col items-center justify-center rounded-[20px] border p-4 text-center ${
          (dashboard?.alerted_students ?? 0) > 0 ? "border-coral/30 bg-coral-light/35 text-coral-dark" : "border-brand-100 bg-brand-50 text-brand"
        }`}>
          <span className={`grid h-12 w-12 place-items-center rounded-full bg-white ${
            (dashboard?.alerted_students ?? 0) > 0 ? "text-coral" : "text-brand"
          }`}>
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <strong className="mt-3 text-2xl">{dashboard?.alerted_students ?? 0}/{dashboard?.total_students ?? 0}</strong>
          <span className="mt-1 text-sm font-bold">Học viên cần theo dõi</span>
        </article>
      </div>
    </section>
  );
}

function ClassSkillCircle({ label, value }: { label: string; value: number | null }) {
  const bounded = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  const animated = useClassChartValue(bounded);
  const circumference = 2 * Math.PI * 36;
  const color = value === null ? "#cfd8d1" : bounded >= 80 ? "#17853b" : bounded >= 50 ? "#d39a16" : "#d4433b";
  const textColor = value === null ? "text-ink-muted" : bounded >= 80 ? "text-[#126b31]" : bounded >= 50 ? "text-[#9a6900]" : "text-[#b4231d]";
  return (
    <article className="flex min-h-[150px] flex-col items-center justify-center rounded-[20px] border border-brand-100 bg-white p-4 text-center">
      <div className="relative grid h-[88px] w-[88px] place-items-center">
        <svg viewBox="0 0 88 88" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="44" cy="44" r="36" fill="none" stroke="#e4eae5" strokeWidth="9" />
          <circle cx="44" cy="44" r="36" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - animated / 100)} />
        </svg>
        <strong className={`relative text-base ${textColor}`}>{value === null ? "--" : `${animated}%`}</strong>
      </div>
      <p className="mt-2 text-sm font-bold text-ink-muted">{label}</p>
    </article>
  );
}

function useClassChartValue(target: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    setValue(0);
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 900);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function ClassAction({ href, icon: Icon, title, description }: { href: string; icon: typeof Users; title: string; description: string }) {
  return (
    <Link href={href} className="portal-card group">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <h3 className="mt-4 text-heading-3 group-hover:text-brand">{title}</h3>
      <p className="mt-2 text-body text-ink-muted">{description}</p>
    </Link>
  );
}

export function TeacherClassStudentsPage({ classId }: { classId: string }) {
  const [classRecord, setClassRecord] = useState<ClassSummary | null>(null);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [alertsByStudent, setAlertsByStudent] = useState<Record<string, TeacherStudentAlert[]>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = getAccessToken();
      if (!token) return;
      setLoading(true);
      try {
        const classData = await getTeacherClasses(token);
        const selected = classData.find((item) => item.id === classId) || null;
        if (!selected) {
          setStatus("Bạn không có quyền truy cập lớp này hoặc lớp không tồn tại.");
          return;
        }
        const [classStudents, dashboardOverview] = await Promise.all([
          getClassStudents(classId, token),
          getTeacherDashboardOverview(toLocalDateInputValue(new Date()), 7, token).catch(() => null),
        ]);
        const classAlerts = dashboardOverview?.alerts.filter((alert) => alert.class_id === classId) ?? [];
        const groupedAlerts = classAlerts.reduce<Record<string, TeacherStudentAlert[]>>((acc, alert) => {
          acc[alert.student_id] = [...(acc[alert.student_id] ?? []), alert];
          return acc;
        }, {});
        setClassRecord(selected);
        setStudents(classStudents);
        setAlertsByStudent(groupedAlerts);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Không thể tải học viên");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [classId]);

  const visibleStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return students;
    return students.filter((student) => student.full_name.toLowerCase().includes(normalized));
  }, [query, students]);

  if (loading) return <section className="portal-section"><p className="text-body text-ink-muted">Đang tải học viên...</p></section>;
  if (!classRecord) return <section className="portal-section"><EmptyState icon={Users} title="Không mở được lớp" description={status || "Lớp không nằm trong phạm vi phụ trách."} /></section>;

  return (
    <div className="space-y-5">
      <BackLink href={`/teacher/classes/${classId}`} />
      <ClassHeader classRecord={classRecord} title="Học viên" />
      <section className="portal-section">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader icon={Users} label="Danh sách" title={`${students.length} học viên`} />
          <label className="portal-input flex items-center gap-2">
            <Search className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            <input className="w-52 bg-transparent outline-none" placeholder="Tìm học viên..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        {status ? <p className="mb-4 rounded-xl border border-coral-light bg-coral-light/30 p-3 text-sm font-semibold text-coral-dark">{status}</p> : null}
        {visibleStudents.length === 0 ? (
          <EmptyState icon={Users} title="Chưa có học viên" description="Lớp này chưa có học viên nào." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleStudents.map((student) => {
              const alerts = alertsByStudent[student.id] ?? [];
              const primaryAlert = alerts[0];
              const isFlagged = Boolean(primaryAlert);
              return (
                <Link
                  key={student.id}
                  href={`/teacher/students/${student.id}?classId=${classId}`}
                  className={`group relative min-h-28 rounded-4xl border bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-panel ${
                    isFlagged ? "border-coral bg-coral-light/15 hover:border-coral" : "border-brand-100 hover:border-brand-200 hover:bg-brand-50/40"
                  }`}
                >
                  {isFlagged ? (
                    <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-coral px-3 py-1 text-xs font-black uppercase text-white shadow-soft">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      Cảnh báo
                    </span>
                  ) : null}
                  <span className="flex items-center gap-4">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm font-black ${
                      isFlagged ? "bg-coral-light text-coral" : "bg-brand-50 text-brand group-hover:bg-brand group-hover:text-white"
                    }`}>
                      {initials(student.full_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-heading-3 text-ink group-hover:text-brand">{student.full_name}</span>
                      <span className="mt-1 block text-sm font-semibold text-ink-muted">{student.level} · {classRecord.name}</span>
                    </span>
                    <ArrowRight className={`h-4 w-4 shrink-0 opacity-70 transition-transform group-hover:translate-x-1 ${isFlagged ? "text-coral" : "text-brand"}`} aria-hidden="true" />
                  </span>
                  {primaryAlert ? (
                    <span className="mt-4 block border-t border-coral-light pt-3 text-sm font-bold text-coral">
                      <span className="inline-flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        Cảnh báo: {primaryAlert.reason_label}
                      </span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function TeacherClassAttendancePage({ classId }: { classId: string }) {
  const [classRecord, setClassRecord] = useState<ClassSummary | null>(null);
  const [attendanceDates, setAttendanceDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [session, setSession] = useState<AttendanceSessionResponse | null>(null);
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadClass() {
      const token = getAccessToken();
      if (!token) return;
      setLoading(true);
      try {
        const classData = await getTeacherClasses(token);
        const selected = classData.find((item) => item.id === classId) || null;
        if (!selected) {
          setStatus("Bạn không có quyền truy cập lớp này hoặc lớp không tồn tại.");
          return;
        }
        setClassRecord(selected);
        const dates = await getClassAttendanceDates(classId, token);
        setAttendanceDates(dates);
        setSelectedDate(dates[0] || "");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Không thể tải điểm danh");
      } finally {
        setLoading(false);
      }
    }
    void loadClass();
  }, [classId]);

  useEffect(() => {
    async function loadSession() {
      const token = getAccessToken();
      if (!token || !selectedDate) {
        setSession(null);
        setRecords({});
        return;
      }
      try {
        const attendanceSession = await getClassAttendanceSession(classId, selectedDate, token);
        setSession(attendanceSession);
        setRecords(Object.fromEntries(attendanceSession.students.map((student) => [student.student_id, student.status])));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Không thể tải phiên điểm danh");
      }
    }
    void loadSession();
  }, [classId, selectedDate]);

  const presentCount = useMemo(() => Object.values(records).filter((value) => value === "present").length, [records]);

  function toggleStudent(studentId: string) {
    setRecords((current) => ({ ...current, [studentId]: current[studentId] === "present" ? "absent" : "present" }));
  }

  function markAllPresent() {
    if (!session) return;
    setRecords(Object.fromEntries(session.students.map((student) => [student.student_id, "present" as const])));
  }

  async function saveAttendance() {
    const token = getAccessToken();
    if (!token || !selectedDate || !session) return;
    setSaving(true);
    setStatus("");
    try {
      const updatedSession = await saveClassAttendance(
        classId,
        selectedDate,
        session.students.map((student) => ({ student_id: student.student_id, status: records[student.student_id] || "absent", note: student.note })),
        token,
      );
      setSession(updatedSession);
      setRecords(Object.fromEntries(updatedSession.students.map((student) => [student.student_id, student.status])));
      setStatus("Đã lưu điểm danh.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể lưu điểm danh");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="portal-section"><p className="text-body text-ink-muted">Đang tải điểm danh...</p></section>;
  if (!classRecord) return <section className="portal-section"><EmptyState icon={CalendarCheck} title="Không mở được lớp" description={status || "Lớp không nằm trong phạm vi phụ trách."} /></section>;

  return (
    <div className="space-y-5">
      <BackLink href={`/teacher/classes/${classId}`} />
      <ClassHeader classRecord={classRecord} eyebrow="Điểm danh" title="Điểm danh theo lớp" />
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoBlock label="Lớp" value={classRecord.name} />
        <InfoBlock label="Lịch học" value={classRecord.schedule_note || "Chưa có lịch học"} />
        <InfoBlock label="Có mặt" value={`${presentCount}/${session?.students.length || 0}`} />
      </div>
      <section className="portal-section">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <select className="portal-input min-w-[220px]" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} disabled={attendanceDates.length === 0}>
            {attendanceDates.map((classDate) => <option key={classDate} value={classDate}>{formatDate(classDate)}</option>)}
          </select>
          <button type="button" onClick={markAllPresent} className="portal-btn-secondary text-sm"><Check className="h-4 w-4" aria-hidden="true" />Tất cả có mặt</button>
        </div>
        {status ? <p className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-ink-muted">{status}</p> : null}
        {attendanceDates.length === 0 ? <EmptyState icon={CalendarCheck} title="Chưa có ngày điểm danh" description="Lớp đang chọn chưa có lịch điểm danh hợp lệ." /> : !session ? <p className="text-body text-ink-muted">Đang tải phiên điểm danh...</p> : session.students.length === 0 ? <EmptyState icon={Users} title="Chưa có học viên" description="Lớp này chưa có học viên nào." /> : (
          <div className="overflow-hidden rounded-xl border border-brand-100">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-muted text-ink-muted"><tr><th className="px-4 py-3 font-bold">Học viên</th><th className="px-4 py-3 font-bold">Trình độ</th><th className="w-32 px-4 py-3 text-center font-bold">Có mặt</th></tr></thead>
              <tbody>
                {session.students.map((student) => {
                  const isPresent = records[student.student_id] === "present";
                  return (
                    <tr key={student.student_id} className="border-t border-brand-100 transition-colors hover:bg-muted/50">
                      <td className="px-4 py-3 font-semibold">{student.full_name}</td>
                      <td className="px-4 py-3 text-ink-muted">{student.level}</td>
                      <td className="px-4 py-3"><button type="button" onClick={() => toggleStudent(student.student_id)} className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-all ${isPresent ? "border-brand bg-brand text-white shadow-sm" : "border-slate-300 bg-white text-transparent hover:border-brand-200"}`} aria-label={`Đánh dấu có mặt cho ${student.full_name}`}><Check className="h-5 w-5" aria-hidden="true" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {session ? <button type="button" onClick={saveAttendance} disabled={saving} className="portal-btn-primary mt-5"><Save className="h-4 w-4" aria-hidden="true" />{saving ? "Đang lưu..." : "Lưu điểm danh"}</button> : null}
      </section>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-soft"><p className="text-caption font-bold text-ink-muted">{label}</p><p className="mt-1 font-bold text-ink">{value}</p></div>;
}

export function TeacherClassAssessmentsPage({ classId }: { classId: string }) {
  const [classRecord, setClassRecord] = useState<ClassSummary | null>(null);
  const [assessments, setAssessments] = useState<AssessmentResponse[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(() => ({ title: "", description: "", assessment_date: todayInputValue(), duration_minutes: 45, lockdown_enabled: true, max_violation_count: 2 }));

  useEffect(() => {
    async function load() {
      const token = getAccessToken();
      if (!token) return;
      setLoading(true);
      try {
        const classData = await getTeacherClasses(token);
        const selected = classData.find((item) => item.id === classId) || null;
        if (!selected) {
          setMessage("Bạn không có quyền truy cập lớp này hoặc lớp không tồn tại.");
          return;
        }
        setClassRecord(selected);
        setAssessments(await getClassAssessments(classId, token));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Không thể tải bài kiểm tra");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [classId]);

  async function createAssessmentRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    try {
      await createAssessment({ class_id: classId, title: form.title, description: form.description || undefined, assessment_date: form.assessment_date || undefined, duration_minutes: form.duration_minutes || null, lockdown_enabled: form.lockdown_enabled, max_violation_count: form.lockdown_enabled ? form.max_violation_count : null }, token);
      setAssessments(await getClassAssessments(classId, token));
      setForm({ title: "", description: "", assessment_date: todayInputValue(), duration_minutes: 45, lockdown_enabled: true, max_violation_count: 2 });
      setMessage("Đã tạo bài kiểm tra");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo bài kiểm tra");
    }
  }

  async function handleDeleteAssessment(assessment: AssessmentResponse) {
    const token = getAccessToken();
    if (!token) return;
    if (!window.confirm(`Xoá bài kiểm tra "${assessment.title}"?`)) return;
    try {
      await deleteAssessment(assessment.id, token);
      setAssessments((current) => current.filter((item) => item.id !== assessment.id));
      setMessage("Đã xoá bài kiểm tra");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xoá bài kiểm tra");
    }
  }

  if (loading) return <section className="portal-section"><p className="text-body text-ink-muted">Đang tải bài kiểm tra...</p></section>;
  if (!classRecord) return <section className="portal-section"><EmptyState icon={ClipboardCheck} title="Không mở được lớp" description={message || "Lớp không nằm trong phạm vi phụ trách."} /></section>;

  return (
    <div className="space-y-5">
      <BackLink href={`/teacher/classes/${classId}`} />
      <ClassHeader classRecord={classRecord} eyebrow="Bài kiểm tra" title="Bài kiểm tra theo lớp" />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <section className="portal-section">
          <SectionHeader icon={ClipboardCheck} label="Kiểm tra" title="Danh sách bài kiểm tra" />
          {message ? <p className="my-4 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand">{message}</p> : null}
          {assessments.length === 0 ? <EmptyState icon={ClipboardCheck} title="Chưa có bài kiểm tra" description="Tạo bài kiểm tra mới ở panel bên phải" /> : (
            <div className="mt-5 space-y-3">
              {assessments.map((assessment) => {
                const submissionStats = assessment.submission_stats;
                const needsGrading = Boolean(
                  submissionStats && submissionStats.graded_students < submissionStats.submitted_students,
                );
                const needsInsight = Boolean(
                  submissionStats &&
                    submissionStats.submitted_students > 0 &&
                    submissionStats.graded_students === submissionStats.submitted_students &&
                    submissionStats.insight_students < submissionStats.submitted_students,
                );
                return (
                  <article key={assessment.id} className="portal-card">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold text-ink">{assessment.title}</p>
                      <p className="mt-1 text-body text-ink-muted">{assessment.description || "Không có mô tả"} · {assessment.assessment_date || "Chưa đặt ngày"}</p>
                      <p className="mt-2 text-caption font-semibold text-ink-muted">{assessment.duration_minutes ? `${assessment.duration_minutes} phút` : "Không giới hạn thời gian"} · {assessment.lockdown_enabled ? `Giám sát web, tối đa ${assessment.max_violation_count ?? 2} vi phạm` : "Không bật giám sát"}</p>
                      {submissionStats ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <AssessmentCardBadge label="Đã nộp" value={submissionStats.submitted_students} total={submissionStats.total_students} icon={UploadCloud} attention={needsGrading} />
                          <AssessmentCardBadge label="Đã chấm" value={submissionStats.graded_students} total={submissionStats.total_students} icon={CheckCircle2} attention={needsGrading} />
                          <AssessmentCardBadge label="Có Insight" value={submissionStats.insight_students} total={submissionStats.total_students} icon={Sparkles} attention={needsGrading || needsInsight} />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/teacher/classes/${classId}/assessments/${assessment.id}`} className="portal-btn-secondary text-sm">Quản lý</Link>
                      <button type="button" onClick={() => handleDeleteAssessment(assessment)} className="portal-btn border-coral-light text-coral hover:bg-coral-light/30 text-sm"><Trash2 className="h-4 w-4" aria-hidden="true" />Xoá</button>
                    </div>
                  </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <aside className="space-y-5">
          <section className="portal-section">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand"><RefreshCw className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-caption font-semibold text-ink-muted">Lớp đang chọn</p><p className="font-bold text-ink">{classRecord.name}</p></div></div>
            <p className="mt-3 text-body text-ink-muted">{classRecord.schedule_note || classRecord.location || "Chưa có thông tin lịch học"}</p>
          </section>
          <form onSubmit={createAssessmentRecord} className="portal-section space-y-4">
            <SectionHeader icon={Plus} label="Tạo mới" title="Bài kiểm tra" />
            <label className="block text-sm font-bold text-ink">Tiêu đề<input className="portal-input mt-2 w-full font-normal" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label>
            <label className="block text-sm font-bold text-ink">Mô tả<textarea className="portal-input mt-2 min-h-20 w-full font-normal" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label className="block text-sm font-bold text-ink">Ngày kiểm tra<input className="portal-input mt-2 w-full font-normal" type="date" value={form.assessment_date} onChange={(event) => setForm((current) => ({ ...current, assessment_date: event.target.value }))} /></label>
            <label className="block text-sm font-bold text-ink">Thời lượng làm bài (phút)<input className="portal-input mt-2 w-full font-normal" type="number" min={1} max={600} value={form.duration_minutes} onChange={(event) => setForm((current) => ({ ...current, duration_minutes: Number(event.target.value) }))} required /></label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white p-3 text-sm font-bold text-ink"><span>Bật chế độ giám sát khi làm bài</span><input type="checkbox" className="h-5 w-5 accent-brand" checked={form.lockdown_enabled} onChange={(event) => setForm((current) => ({ ...current, lockdown_enabled: event.target.checked }))} /></label>
            {form.lockdown_enabled ? <label className="block text-sm font-bold text-ink">Số vi phạm tối đa<input className="portal-input mt-2 w-full font-normal" type="number" min={1} max={10} value={form.max_violation_count} onChange={(event) => setForm((current) => ({ ...current, max_violation_count: Number(event.target.value) }))} /></label> : null}
            <button type="submit" className="portal-btn-primary w-full">Tạo bài kiểm tra</button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function AssessmentCardBadge({
  label,
  value,
  total,
  icon: Icon,
  attention,
}: {
  label: string;
  value: number;
  total: number;
  icon: typeof UploadCloud;
  attention: boolean;
}) {
  const complete = total > 0 && value === total;
  return (
    <span
      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold ${attention ? "attention-badge-pulse" : ""} ${
        complete
          ? "border-brand-200 bg-brand-50 text-brand"
          : "border-[#ead080] bg-[#fff7d6] text-[#875c00]"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}/{total}</strong>
    </span>
  );
}
