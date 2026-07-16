"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, Megaphone, StickyNote, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  createTeacherClassActionDraft,
  getTeacherDashboardOverview,
  getTeacherClasses,
  sendTeacherClassActionDraft,
  TeacherClassActionDraft,
  TeacherDashboardOverviewResponse,
  TeachingScheduleClassItem,
} from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";

type ActionType = TeacherClassActionDraft["action_type"];
type SelectedScheduleClass = TeachingScheduleClassItem & { scheduledFor: string };
type PendingTask = {
  id: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  icon: typeof ClipboardCheck;
};
type SentClassActionState = {
  actionType: ActionType;
  content: string;
  draftId?: string;
};
const dismissedTaskStorageKey = "teacher-dashboard-dismissed-tasks";

export default function TeacherDashboardPage() {
  const weekOptions = useMemo(() => buildWeekOptions(new Date()), []);
  const [overview, setOverview] = useState<TeacherDashboardOverviewResponse | null>(null);
  const [classNamesById, setClassNamesById] = useState<Record<string, string>>({});
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => weekOptions[0]?.start ?? toLocalDateInputValue(new Date()));
  const [selectedClass, setSelectedClass] = useState<SelectedScheduleClass | null>(null);
  const [activeAction, setActiveAction] = useState<ActionType>("teacher_reminder");
  const [reasonContent, setReasonContent] = useState("");
  const [reminderContent, setReminderContent] = useState("");
  const [status, setStatus] = useState("");
  const [modalStatus, setModalStatus] = useState("");
  const [dismissedTaskIds, setDismissedTaskIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(dismissedTaskStorageKey);
      if (stored) setDismissedTaskIds(new Set(JSON.parse(stored)));
    } catch {
      setDismissedTaskIds(new Set());
    }
  }, []);

  const loadOverview = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const [overviewData, classes] = await Promise.all([
        getTeacherDashboardOverview(selectedWeekStart, 7, token),
        getTeacherClasses(token),
      ]);
      setOverview(overviewData);
      setClassNamesById(Object.fromEntries(classes.map((classRecord) => [classRecord.id, classRecord.name])));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể tải tổng quan giáo viên");
    } finally {
      setLoading(false);
    }
  }, [selectedWeekStart]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const classCount = useMemo(() => {
    const ids = new Set<string>();
    overview?.schedule_days.forEach((day) => day.classes.forEach((item) => ids.add(item.class_id)));
    return ids.size;
  }, [overview]);
  const pendingTasks = useMemo(
    () => buildPendingTasks(overview, classNamesById).filter((task) => !dismissedTaskIds.has(task.id)),
    [classNamesById, dismissedTaskIds, overview],
  );
  const studentAlerts = useMemo(() => uniqueAlertsByStudent(overview?.alerts ?? []), [overview]);

  function openClassModal(classItem: TeachingScheduleClassItem, scheduledFor: string) {
    setSelectedClass({ ...classItem, scheduledFor });
    setActiveAction("teacher_reminder");
    setReasonContent("");
    setReminderContent("");
    setModalStatus("");
  }

  function switchAction(actionType: ActionType) {
    setActiveAction(actionType);
    setModalStatus("");
  }

  async function saveActionDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    const content = activeAction === "unexpected_absence_notice" ? reasonContent.trim() : reminderContent.trim();
    if (!token || !selectedClass || !content) return;
    setSavingDraft(true);
    setModalStatus("");
    try {
      const draft = await createTeacherClassActionDraft(selectedClass.class_id, activeAction, content, selectedClass.scheduledFor, token);
      const result = await sendTeacherClassActionDraft(selectedClass.class_id, draft.id, token);
      updateScheduleClassAction(selectedClass.class_id, selectedClass.scheduledFor, {
        actionType: activeAction,
        content,
        draftId: draft.id,
      });
      setStatus(`Đã gửi ${activeAction === "unexpected_absence_notice" ? "thông báo nghỉ đột xuất" : "dặn dò"} ngày ${formatFullDate(selectedClass.scheduledFor)} tới ${result.notifications_created} phụ huynh. Zalo: ${result.zalo_sent} gửi, ${result.zalo_not_linked} chưa liên kết, ${result.zalo_failed} lỗi.`);
      setSelectedClass(null);
      window.setTimeout(() => setStatus(""), 30000);
    } catch (error) {
      setModalStatus(error instanceof Error ? error.message : "Không thể gửi thông báo");
    } finally {
      setSavingDraft(false);
    }
  }

  function updateScheduleClassAction(classId: string, scheduledFor: string, action: SentClassActionState) {
    setOverview((current) => {
      if (!current) return current;
      return {
        ...current,
        schedule_days: current.schedule_days.map((day) => {
          if (day.date !== scheduledFor) return day;
          return {
            ...day,
            classes: day.classes.map((classItem) => {
              if (classItem.class_id !== classId) return classItem;
              return {
                ...classItem,
                actions: [
                  {
                    id: action.draftId || `local-${classId}-${scheduledFor}-${action.actionType}`,
                    action_type: action.actionType,
                    content: action.content,
                    scheduled_for: scheduledFor,
                    status: "sent",
                    sent_at: new Date().toISOString(),
                  },
                  ...(classItem.actions || []),
                ],
              };
            }),
          };
        }),
      };
    });
  }

  function dismissTask(taskId: string) {
    setDismissedTaskIds((current) => {
      const next = new Set(current);
      next.add(taskId);
      window.localStorage.setItem(dismissedTaskStorageKey, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  return (
    <AppShell role="teacher" title="Tổng quan giáo viên" subtitle="Lịch dạy và cảnh báo học viên cần theo dõi">
      {status ? <ToastNotification message={status} onClose={() => setStatus("")} /> : null}

      {loading ? (
        <div className="space-y-5">
          <div className="skeleton h-80 rounded-4xl" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
            <div className="skeleton h-[420px] rounded-4xl" />
            <div className="skeleton h-[420px] rounded-4xl" />
          </div>
        </div>
      ) : !overview ? (
        <section className="portal-section">
          <p className="text-body text-ink-muted">Chưa có dữ liệu tổng quan.</p>
        </section>
      ) : (
        <div className="space-y-5">
          <section className="portal-section">
            <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-14 w-14 place-items-center rounded-3xl bg-brand-50 text-brand">
                    <CalendarDays className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-caption font-bold uppercase tracking-[0.12em] text-brand">Lịch dạy</p>
                    <h2 className="text-heading-2 text-ink">Lịch dạy</h2>
                    <p className="mt-1 text-sm font-semibold text-ink-muted">{classCount} lớp có lịch trong tuần này</p>
                  </div>
                </div>
              </div>
              <label className="flex min-w-64 flex-col gap-1 text-sm font-bold text-ink">
                Tuần hiển thị
                <select
                  className="portal-input min-h-11 font-normal"
                  value={selectedWeekStart}
                  onChange={(event) => setSelectedWeekStart(event.target.value)}
                >
                  {weekOptions.map((week) => (
                    <option key={week.start} value={week.start}>{week.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
              {overview.schedule_days.map((day) => {
                const isToday = day.date === toLocalDateInputValue(new Date());
                return (
                <article key={day.date} className={`min-h-56 rounded-3xl border p-4 shadow-soft ${isToday ? "border-brand bg-brand-50 ring-2 ring-brand/15" : "border-brand-100 bg-white"}`}>
                  <div className="mb-4">
                    <div>
                      <p className="text-sm font-bold uppercase text-ink-muted">{shortWeekdayLabel(day.weekday_label)}</p>
                      <p className="mt-1 text-xl font-black text-ink">{formatShortDate(day.date)}</p>
                      {isToday ? <span className="mt-2 inline-flex rounded-full bg-brand px-2.5 py-1 text-[11px] font-black text-white">Hôm nay</span> : null}
                    </div>
                    <span className={`mt-2 inline-flex rounded-lg px-2 py-1 text-xs font-black ${day.classes.length ? "bg-brand-50 text-brand" : "bg-slate-100 text-ink-muted"}`}>
                      {day.classes.length ? `${day.classes.length} lớp` : "Trống"}
                    </span>
                  </div>
                  {day.classes.length ? (
                    <div className="space-y-3">
                      {day.classes.map((classItem) => {
                        const sentAction = latestSentAction(classItem.actions || []);
                        const sentIsAbsence = sentAction?.actionType === "unexpected_absence_notice";
                        return (
                        <button
                          key={`${day.date}-${classItem.class_id}`}
                          type="button"
                          onClick={() => openClassModal(classItem, day.date)}
                          className={`w-full rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 ${sentAction ? sentIsAbsence ? "bg-coral-light/40 ring-1 ring-coral-light" : "bg-amber-50 ring-1 ring-amber-200" : "bg-brand-50 hover:bg-brand-100/70"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-base font-black text-brand">{classItem.class_name}</p>
                            {sentAction ? <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black text-white ${sentIsAbsence ? "bg-coral" : "bg-amber-500"}`}>{sentIsAbsence ? "Đã báo nghỉ" : "Đã dặn dò"}</span> : null}
                          </div>
                          <p className="mt-2 flex items-center gap-2 text-xs font-bold text-ink-muted">
                            <CalendarDays className="h-4 w-4" aria-hidden="true" />
                            {classItem.schedule_note || "Chưa có lịch"}
                          </p>
                          {sentAction ? (
                            <div className="mt-3 rounded-xl bg-white/75 p-3 text-xs font-semibold text-ink-muted">
                              <p><span className="font-black text-ink">{sentIsAbsence ? "Lý do" : "Dặn dò"}:</span> {sentAction.content}</p>
                            </div>
                          ) : null}
                          <p className="mt-3 rounded-full bg-white/70 px-3 py-1 text-right text-xs font-black text-brand">{classItem.student_count} HV</p>
                        </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed border-ink/10 bg-white/60 text-sm font-semibold text-ink-muted">
                      Nghỉ
                    </div>
                  )}
                </article>
                );
              })}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
            <section className="portal-section">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand">
                    <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h2 className="text-heading-2 text-ink">Công việc cần xử lý</h2>
                </div>
                <span className="rounded-full bg-brand px-4 py-2 text-sm font-black text-white">{pendingTasks.length} việc</span>
              </div>
              {pendingTasks.length ? (
                <div className="space-y-3">
                  {pendingTasks.map((task) => (
                    <TaskLink key={task.id} task={task} onDismiss={dismissTask} />
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-ink/10 bg-muted/50 p-6 text-sm font-semibold text-ink-muted">
                  Chưa có công việc cần xử lý trong dữ liệu hiện tại.
                </div>
              )}
            </section>

            <aside className="space-y-5">
              <section className="portal-section">
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-coral-light/60 text-coral">
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-caption font-bold uppercase tracking-[0.12em] text-coral">Alert</p>
                    <h2 className="text-heading-3 text-ink">Học viên cần theo dõi</h2>
                  </div>
                </div>
                {studentAlerts.length ? (
                  <div className="space-y-3">
                    {studentAlerts.slice(0, 4).map((alert) => (
                      <Link
                        key={alert.student_id}
                        href={`/teacher/students/${alert.student_id}?classId=${alert.class_id}`}
                        className="block rounded-2xl border border-coral-light bg-coral-light/20 p-4 transition-colors hover:border-coral hover:bg-coral-light/35"
                      >
                        <p className="font-black text-ink">{alert.student_name}</p>
                        <p className="mt-1 text-xs font-semibold text-ink-muted">{alert.class_name}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-ink/10 bg-muted/60 p-4 text-sm font-semibold text-ink-muted">
                    Chưa có học viên nào bị gắn flag.
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      )}

      {selectedClass ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 px-4 py-6">
          <section className="w-full max-w-xl rounded-4xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-caption font-bold uppercase tracking-[0.12em] text-brand">Thao tác lớp</p>
                <h2 className="mt-1 text-heading-3 text-ink">{selectedClass.class_name}</h2>
                <p className="mt-1 text-sm font-semibold text-ink-muted">{selectedClass.schedule_note || "Chưa có lịch học"}</p>
                <p className="mt-1 text-sm font-semibold text-brand">Ngày áp dụng: {formatFullDate(selectedClass.scheduledFor)}</p>
              </div>
              <button type="button" onClick={() => setSelectedClass(null)} className="grid h-10 w-10 place-items-center rounded-full border border-brand-100 text-ink-muted hover:bg-brand-50" aria-label="Đóng">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
              <button
                type="button"
                onClick={() => switchAction("unexpected_absence_notice")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold ${activeAction === "unexpected_absence_notice" ? "bg-white text-brand shadow-sm" : "text-ink-muted"}`}
              >
                <Megaphone className="h-4 w-4" aria-hidden="true" />
                Nghỉ đột xuất
              </button>
              <button
                type="button"
                onClick={() => switchAction("teacher_reminder")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold ${activeAction === "teacher_reminder" ? "bg-white text-brand shadow-sm" : "text-ink-muted"}`}
              >
                <StickyNote className="h-4 w-4" aria-hidden="true" />
                Dặn dò
              </button>
            </div>
            <form onSubmit={saveActionDraft} className="mt-4 space-y-3">
              {activeAction === "unexpected_absence_notice" ? (
                <label className="block text-sm font-bold text-ink">
                  Lý do nghỉ đột xuất <span className="text-coral">*</span>
                  <textarea
                    className="portal-input mt-2 min-h-32 w-full resize-y font-normal"
                    value={reasonContent}
                    onChange={(event) => setReasonContent(event.target.value)}
                    placeholder="Nhập lý do nghỉ để phụ huynh nắm rõ"
                    required
                  />
                </label>
              ) : (
                <label className="block text-sm font-bold text-ink">
                  Dặn dò <span className="text-coral">*</span>
                  <textarea
                    className="portal-input mt-2 min-h-32 w-full resize-y font-normal"
                    value={reminderContent}
                    onChange={(event) => setReminderContent(event.target.value)}
                    placeholder="Nhập dặn dò gửi tới phụ huynh"
                    required
                  />
                </label>
              )}
              {modalStatus ? <p className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand">{modalStatus}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setSelectedClass(null)} className="portal-btn-secondary text-sm">Đóng</button>
                <button type="submit" disabled={savingDraft || !(activeAction === "unexpected_absence_notice" ? reasonContent : reminderContent).trim()} className="portal-btn-primary text-sm">
                  {savingDraft ? "Đang gửi..." : "Gửi tới phụ huynh"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function classDateKey(classId: string, date: string) {
  return `${classId}:${date}`;
}

function TaskLink({ task, onDismiss }: { task: PendingTask; onDismiss: (taskId: string) => void }) {
  const Icon = task.icon;
  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-brand-100 bg-muted/40 p-4 transition-colors hover:border-brand-200 hover:bg-brand-50/40 sm:flex-row sm:items-center">
      <Link href={task.href} onClick={() => onDismiss(task.id)} className="flex min-w-0 flex-1 items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-black text-ink">{task.title}</span>
          <span className="mt-1 block text-sm font-semibold text-ink-muted">{task.detail}</span>
        </span>
        <span className="hidden text-sm font-black text-brand md:inline">{task.action}</span>
      </Link>
      <button
        type="button"
        onClick={() => onDismiss(task.id)}
        className="min-h-9 rounded-xl border border-ink/10 bg-white px-3 text-sm font-bold text-ink-muted transition-colors hover:border-coral-light hover:text-coral"
      >
        Bỏ qua
      </button>
    </article>
  );
}

function ToastNotification({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed right-4 top-4 z-[60] w-[min(420px,calc(100vw-2rem))] rounded-3xl border border-brand-100 bg-white p-4 shadow-2xl ring-1 ring-brand/10">
      <div className="flex gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-white">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-ink">Gửi thông báo thành công</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-ink-muted">{message}</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted" aria-label="Đóng thông báo">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-brand-50">
        <div className="h-full w-full rounded-full bg-brand" />
      </div>
    </div>
  );
}

function latestSentAction(actions: TeachingScheduleClassItem["actions"]): SentClassActionState | null {
  const sent = actions.filter((action) => action.status === "sent");
  if (!sent.length) return null;
  const latest = [...sent].sort((a, b) => Date.parse(b.sent_at || "") - Date.parse(a.sent_at || ""))[0];
  return { actionType: latest.action_type, content: latest.content, draftId: latest.id };
}

function buildPendingTasks(overview: TeacherDashboardOverviewResponse | null, classNamesById: Record<string, string>): PendingTask[] {
  if (!overview) return [];
  const today = toLocalDateInputValue(new Date());
  const assessmentTasks = overview.pending_assessment_reviews.map((assessment) => ({
    id: `assessment-review-${assessment.assessment_id}-${assessment.submitted_count}-${assessment.latest_submitted_at}`,
    title: `Chấm bài kiểm tra: ${assessment.title} (${assessment.class_name || classNamesById[assessment.class_id] || "Lớp học"})`,
    detail: `${assessment.submitted_count} bài nộp đang chờ chấm`,
    action: "Mở bài kiểm tra",
    href: `/teacher/classes/${assessment.class_id}/assessments/${assessment.assessment_id}`,
    icon: ClipboardCheck,
  }));
  const todayClasses = overview.schedule_days.find((day) => day.date === today)?.classes ?? [];
  const attendanceTasks = todayClasses.map((classItem) => ({
    id: `attendance-${classItem.class_id}-${today}`,
    title: `Xác nhận điểm danh lớp ${classItem.class_name}`,
    detail: classItem.schedule_note || "Buổi học hôm nay",
    action: "Xác nhận",
    href: `/teacher/classes/${classItem.class_id}/attendance`,
    icon: CheckCircle2,
  }));
  const alertTasks = uniqueAlertsByStudent(overview.alerts).slice(0, 3).map((alert) => ({
    id: `alert-${alert.student_id}-${alertSignature(overview.alerts, alert.student_id)}`,
    title: `Theo dõi ${alert.student_name}`,
    detail: alert.class_name,
    action: "Xem hồ sơ",
    href: `/teacher/students/${alert.student_id}?classId=${alert.class_id}`,
    icon: AlertTriangle,
  }));
  return [...assessmentTasks, ...attendanceTasks, ...alertTasks];
}

function uniqueAlertsByStudent(alerts: TeacherDashboardOverviewResponse["alerts"]) {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    if (seen.has(alert.student_id)) return false;
    seen.add(alert.student_id);
    return true;
  });
}

function alertSignature(alerts: TeacherDashboardOverviewResponse["alerts"], studentId: string) {
  return alerts
    .filter((alert) => alert.student_id === studentId)
    .map((alert) => `${alert.reason}:${alert.occurred_on || "unknown"}:${alert.metric_value ?? "unknown"}`)
    .sort()
    .join("|");
}

function buildWeekOptions(today: Date) {
  const start = startOfWeek(today);
  return Array.from({ length: 8 }, (_, index) => {
    const weekStart = addDays(start, index * 7);
    const weekEnd = addDays(weekStart, 6);
    return {
      start: toLocalDateInputValue(weekStart),
      label: `${formatShortDate(toLocalDateInputValue(weekStart))} - ${formatShortDate(toLocalDateInputValue(weekEnd))}`,
    };
  });
}

function startOfWeek(value: Date) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function toLocalDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatFullDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return date.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function shortWeekdayLabel(value: string) {
  return value === "Chủ nhật" ? "CN" : value.replace("Thứ ", "Thứ ");
}
