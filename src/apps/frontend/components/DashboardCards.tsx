"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpen, CalendarCheck, CalendarDays, ChartNoAxesCombined, CircleHelp, ClipboardCheck, Clock3, MapPin, MessageSquareText, Moon, Send, Sparkles, Target } from "lucide-react";
import { ParentClassAction, ParentClassAlert, ParentUpcomingClass, StudentDashboardResponse } from "@/lib/api";

const skillLabels: Record<string, string> = {
  reading: "Đọc hiểu",
  listening: "Nghe hiểu",
  speaking: "Nói",
  writing: "Viết",
  grammar: "Ngữ pháp",
  vocabulary: "Từ vựng",
};

const homeSupportBySkill: Record<string, Array<{ title: string; detail: string; icon: typeof Clock3 }>> = {
  reading: [
    { title: "Duy trì thói quen", detail: "Cùng con dành 10 phút đọc tiếng Anh vào một khung giờ cố định mỗi ngày.", icon: Clock3 },
    { title: "Đọc chủ động", detail: "Sau mỗi đoạn ngắn, hỏi con hai câu để con diễn đạt lại bằng lời của mình.", icon: BookOpen },
    { title: "Không gian tập trung", detail: "Chuẩn bị góc đọc yên tĩnh, không có thiết bị gây xao nhãng.", icon: Moon },
  ],
  listening: [
    { title: "Nghe đều mỗi ngày", detail: "Cho con nghe một đoạn tiếng Anh ngắn vào cùng một khung giờ mỗi ngày.", icon: Clock3 },
    { title: "Nghe hai lượt", detail: "Lượt đầu nghe ý chính, lượt hai dừng lại để nhận biết các từ khóa.", icon: BookOpen },
    { title: "Kể lại nội dung", detail: "Khuyến khích con nói lại điều vừa nghe bằng một câu đầy đủ.", icon: MessageSquareText },
  ],
  speaking: [
    { title: "Luyện nói ngắn", detail: "Dành 5-10 phút mỗi ngày để trò chuyện với con bằng các câu tiếng Anh quen thuộc.", icon: Clock3 },
    { title: "Nói thành câu", detail: "Khuyến khích con trả lời bằng câu đầy đủ thay vì chỉ dùng từ đơn.", icon: MessageSquareText },
    { title: "Tạo sự tự tin", detail: "Khen nỗ lực trước, sau đó mới góp ý phát âm để con không ngại nói.", icon: Sparkles },
  ],
  writing: [
    { title: "Viết đều đặn", detail: "Cho con viết 3-4 câu ngắn về hoạt động trong ngày.", icon: Clock3 },
    { title: "Sắp xếp ý", detail: "Hướng dẫn con viết theo trình tự mở đầu, nội dung chính và kết thúc.", icon: BookOpen },
    { title: "Góp ý tích cực", detail: "Nhận xét ý tưởng trước rồi mới cùng con xem lại ngữ pháp.", icon: MessageSquareText },
  ],
  grammar: [
    { title: "Ôn theo tuần", detail: "Mỗi tuần ôn một điểm ngữ pháp bằng ví dụ trong sinh hoạt hằng ngày.", icon: Clock3 },
    { title: "Tự đặt câu", detail: "Yêu cầu con tự đặt hai câu mới với cấu trúc vừa học.", icon: BookOpen },
    { title: "Học trong ngữ cảnh", detail: "Ưu tiên câu chuyện và tình huống thực tế thay vì ghi nhớ công thức riêng lẻ.", icon: Sparkles },
  ],
  vocabulary: [
    { title: "Ôn từ mỗi ngày", detail: "Dành 5 phút nhắc lại các từ mới trong ngày cùng con.", icon: Clock3 },
    { title: "Học theo chủ đề", detail: "Nhóm từ mới theo chủ đề thay vì học từng từ rời rạc.", icon: BookOpen },
    { title: "Dùng từ trong câu", detail: "Khuyến khích con đặt câu ngắn với mỗi từ vừa học.", icon: MessageSquareText },
  ],
};

export function ParentDashboardCards({ dashboard }: { dashboard: StudentDashboardResponse }) {
  const { student, progress } = dashboard;
  const skillEntries = Object.entries(progress.skills).sort((a, b) => b[1].average - a[1].average);
  const displayedSkills = Object.keys(skillLabels).map((skill) => ({ skill, average: progress.skills[skill]?.average ?? null }));
  const weakest = [...skillEntries].sort((a, b) => a[1].average - b[1].average)[0];
  const attendancePercent = Math.round((progress.attendance_rate || 0) * 100);
  const attendanceScore = dashboard.attendance.length > 0 ? attendancePercent : null;
  const recentAverage = skillEntries.length > 0 ? Math.round(progress.recent_average) : null;
  const assignmentsIncomplete = dashboard.assignment_completion.completed < dashboard.assignment_completion.total;
  const supportItems = homeSupportBySkill[weakest?.[0] || "writing"] ?? homeSupportBySkill.writing;
  const nextSessionKeys = new Set(dashboard.upcoming_classes.map(sessionKey));
  const additionalAlerts = dashboard.class_alerts.filter((alert) => !nextSessionKeys.has(sessionKey(alert)));

  return (
    <div className="space-y-7">
      <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="overflow-hidden rounded-[28px] border border-brand-100 bg-white p-6 shadow-panel lg:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-sm font-black text-white">{initials(student.full_name)}</span>
              <div>
                <p className="text-sm font-bold uppercase text-brand">Hiệu suất học tập</p>
                <h2 className="mt-1 text-2xl font-black text-ink">{student.full_name} · {student.level}</h2>
              </div>
            </div>
            <Link href={`/parent/students/${student.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-100 px-4 text-base font-black text-brand hover:bg-brand-50">
              Xem chi tiết <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-black text-ink">Tổng quan 6 kỹ năng</h3>
              <span className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-bold text-brand">Dữ liệu mới nhất</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-6">
                {displayedSkills.map(({ skill, average }) => (
                  <SkillCircle key={skill} label={skillLabels[skill]} value={average === null ? null : Math.round(average)} />
                ))}
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              <SummaryMetric icon={CalendarCheck} label="Tỷ lệ chuyên cần" value={attendanceScore === null ? "--" : `${attendanceScore}%`} score={attendanceScore} animateScore />
              <SummaryMetric icon={ChartNoAxesCombined} label="Điểm trung bình gần đây" value={recentAverage === null ? "--" : `${recentAverage}%`} score={recentAverage} animateScore />
              <SummaryMetric
                icon={Target}
                label="Kỹ năng cần ưu tiên"
                value={weakest ? skillLabels[weakest[0]] || weakest[0] : "Đang cập nhật"}
              />
              <SummaryMetric
                icon={assignmentsIncomplete ? AlertTriangle : ClipboardCheck}
                label="Bài tập hoàn thành"
                value={`${dashboard.assignment_completion.completed}/${dashboard.assignment_completion.total}`}
                warning={assignmentsIncomplete}
              />
            </div>
          </div>
        </article>

        <article className="rounded-[28px] border border-brand-100 bg-white p-6 shadow-panel">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-sm font-bold uppercase text-brand">Lịch học</p><h2 className="text-xl font-black text-ink">Sắp tới</h2></div>
          </div>
          <div className="mt-5 max-h-[430px] space-y-3 overflow-y-auto pr-1">
            {additionalAlerts.map((alert) => <AlertSessionCard key={alert.id} alert={alert} />)}
            {dashboard.upcoming_classes.map((session) => <UpcomingSessionCard key={sessionKey(session)} session={session} />)}
            {!additionalAlerts.length && !dashboard.upcoming_classes.length ? (
              <div className="rounded-2xl border border-dashed border-ink/10 bg-muted p-5 text-sm font-semibold text-ink-muted">Chưa có lịch học sắp tới.</div>
            ) : null}
          </div>
        </article>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase text-brand">Đồng hành cùng con</p>
            <h2 className="mt-1 text-2xl font-black text-ink">Gợi ý hỗ trợ dành cho phụ huynh</h2>
          </div>
          <span className="rounded-full bg-muted px-3 py-1.5 text-sm font-bold text-ink-muted">Gợi ý trong tuần</span>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {supportItems.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-[24px] border border-brand-100 bg-white p-6 shadow-soft">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand"><Icon className="h-6 w-6" aria-hidden="true" /></span>
                <h3 className="mt-5 text-lg font-black text-ink">{item.title}</h3>
                <p className="mt-2 text-base leading-7 text-ink-muted">{item.detail}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <article className="relative overflow-hidden rounded-[32px] border border-[#dce9e6] bg-gradient-to-br from-[#f2f6ff] via-[#eef5f8] to-[#dff4ee] px-6 py-8 shadow-panel sm:px-9 lg:min-h-[360px] lg:px-12 lg:py-10">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/25 blur-2xl" aria-hidden="true" />
          <div className="relative z-10 grid items-center gap-9 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.55fr)] lg:gap-14">
            <div className="relative mx-auto h-[210px] w-full max-w-[340px] sm:h-[240px] lg:mx-0 lg:h-[270px]">
              <div className="absolute inset-x-5 bottom-1 top-5 rotate-[4deg] rounded-[28px] bg-[#dff2e9]" aria-hidden="true" />
              <div className="absolute inset-x-3 bottom-4 top-2 -rotate-[3deg] rounded-[28px] bg-white shadow-[0_18px_45px_rgba(20,73,52,0.09)]">
                <div className="grid h-full place-items-center">
                  <div className="relative text-[#075e43]">
                    <MessageSquareText className="h-24 w-24 stroke-[1.7] sm:h-28 sm:w-28" aria-hidden="true" />
                    <span className="absolute -bottom-2 -right-4 h-12 w-16 rounded-br-[4px] border-b-[11px] border-r-[11px] border-[#075e43]" aria-hidden="true" />
                  </div>
                </div>
              </div>
              <span className="absolute -right-1 top-0 grid h-14 w-14 place-items-center rounded-full border-2 border-white bg-[#a8edcf] text-[#075e43] shadow-soft sm:h-16 sm:w-16">
                <CircleHelp className="h-7 w-7" aria-hidden="true" />
              </span>
              <span className="absolute -bottom-1 -left-1 flex h-9 items-center gap-1.5 rounded-full border-2 border-white bg-white px-3 shadow-soft" aria-hidden="true">
                <i className="h-3 w-3 rounded-full bg-[#d8e4e1]" />
                <i className="h-3 w-12 rounded-full bg-[#c7d6d2]" />
              </span>
            </div>

            <div className="max-w-3xl text-[#123e31]">
              <h2 className="text-[2rem] font-black leading-[1.08] tracking-[-0.035em] sm:text-[2.5rem] lg:text-[3rem]">
                Kết nối khi phụ huynh<br className="hidden sm:block" /> cần hiểu rõ hơn
              </h2>
              <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-[#344b43] sm:text-lg sm:leading-8">
                Đặt câu hỏi về tiến bộ, nhận xét hoặc cách hỗ trợ <strong className="font-black text-[#075e43]">{student.full_name}</strong> tại nhà dựa trên dữ liệu được trung tâm phân quyền.
              </p>
              <Link
                href="/parent/chat"
                className="mt-7 inline-flex min-h-14 items-center justify-center gap-4 rounded-full bg-[#075e43] px-7 text-base font-black text-white shadow-[0_9px_18px_rgba(7,94,67,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#064d38] hover:shadow-[0_12px_24px_rgba(7,94,67,0.24)] sm:min-w-[300px] sm:text-lg"
              >
                Gửi câu hỏi cho Pippo <Send className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function SkillCircle({ label, value }: { label: string; value: number | null }) {
  const bounded = value === null ? 0 : Math.max(0, Math.min(100, value));
  const animated = useAnimatedValue(bounded);
  const circumference = 2 * Math.PI * 36;
  const appearance = value === null ? neutralAppearance : scoreAppearance(bounded);

  return (
    <div className="text-center">
      <div className="relative mx-auto grid h-[88px] w-[88px] place-items-center">
        <svg viewBox="0 0 88 88" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="44" cy="44" r="36" fill="none" stroke="#e4eae5" strokeWidth="9" />
          <circle
            cx="44"
            cy="44"
            r="36"
            fill="none"
            stroke={appearance.stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - animated / 100)}
          />
        </svg>
        <span className={`relative text-base font-black ${appearance.text}`}>{value === null ? "--" : `${animated}%`}</span>
      </div>
      <p className="mt-2 text-sm font-bold text-ink-muted">{label}</p>
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  score,
  animateScore = false,
  warning = false,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
  score?: number | null;
  animateScore?: boolean;
  warning?: boolean;
}) {
  const boundedScore = score == null ? null : Math.max(0, Math.min(100, Math.round(score)));
  const animatedScore = useAnimatedValue(animateScore && boundedScore !== null ? boundedScore : 0);
  const scoreColor = warning ? "text-[#9a6900]" : boundedScore === null ? "text-brand" : scoreAppearance(boundedScore).text;
  const displayedValue = animateScore && boundedScore !== null ? `${animatedScore}%` : value;

  return (
    <div className={`flex min-h-[82px] items-center gap-3 rounded-2xl border px-4 ${warning ? warningMetricAppearance.card : neutralMetricAppearance.card}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/90 ${warning ? "text-[#9a6900]" : "text-brand"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5 text-ink-muted">{label}</span>
        <strong className={`mt-1 block truncate text-base ${scoreColor}`}>{displayedValue}</strong>
      </span>
    </div>
  );
}

const neutralAppearance = { stroke: "#cfd8d1", text: "text-ink-muted" };
const neutralMetricAppearance = { card: "border-[#dce5ed] bg-[#eef4ff]" };
const warningMetricAppearance = { card: "border-[#ead99b] bg-[#fff9e8]" };

function scoreAppearance(value: number) {
  if (value >= 80) return { stroke: "#17853b", text: "text-[#126b31]" };
  if (value >= 50) return { stroke: "#d39a16", text: "text-[#9a6900]" };
  return { stroke: "#d4433b", text: "text-[#b4231d]" };
}

function useAnimatedValue(target: number, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const boundedTarget = Math.max(0, Math.min(100, Math.round(target)));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(boundedTarget);
      return;
    }

    setValue(0);
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(boundedTarget * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, target]);

  return value;
}

function UpcomingSessionCard({ session }: { session: ParentUpcomingClass }) {
  const primaryAction = preferredAction(session.actions);
  if (primaryAction) {
    return <ActionCard action={primaryAction} className={session.class_name} classDate={session.class_date} schedule={session.schedule_note} />;
  }
  return (
    <div className="rounded-2xl bg-[#eef4ff] p-4">
      <p className="text-xs font-bold uppercase text-brand">{formatClassDate(session.class_date)}</p>
      <p className="mt-2 font-black text-ink">{session.class_name}</p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{session.schedule_note || "Thời gian đang cập nhật"}</p>
      {session.location ? <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted"><MapPin className="h-3.5 w-3.5" />{session.location}</p> : null}
    </div>
  );
}

function AlertSessionCard({ alert }: { alert: ParentClassAlert }) {
  return <ActionCard action={alert} className={alert.class_name} classDate={alert.class_date} schedule={alert.schedule_note} />;
}

function ActionCard({ action, className, classDate, schedule }: { action: ParentClassAction; className: string; classDate: string; schedule: string | null }) {
  const urgent = action.action_type === "unexpected_absence_notice";
  return (
    <div className={`parent-schedule-alert-ringing rounded-2xl border p-4 ${
      urgent
        ? "border-coral/35 bg-coral-light/60"
        : "border-gold/30 bg-gold-light/70"
    }`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${urgent ? "text-coral" : "text-gold-dark"}`} aria-hidden="true" />
        <div>
          <p className={`text-xs font-black uppercase ${urgent ? "text-coral-dark" : "text-gold-dark"}`}>{urgent ? "Thông báo nghỉ đột xuất" : "Dặn dò từ giáo viên"}</p>
          <p className="mt-2 font-black text-ink">{className}</p>
          <p className="mt-1 text-xs font-semibold text-ink-muted">{formatClassDate(classDate)} · {schedule || "Thời gian đang cập nhật"}</p>
          <p className="mt-3 text-sm leading-6 text-ink-soft">{action.content}</p>
        </div>
      </div>
    </div>
  );
}

function preferredAction(actions: ParentClassAction[]) {
  return [...actions].sort((a, b) => {
    const bTimestamp = Date.parse(b.sent_at || b.created_at || "");
    const aTimestamp = Date.parse(a.sent_at || a.created_at || "");
    return (Number.isNaN(bTimestamp) ? 0 : bTimestamp) - (Number.isNaN(aTimestamp) ? 0 : aTimestamp);
  })[0];
}

function sessionKey(item: { class_id: string; class_date: string }) {
  return `${item.class_id}:${item.class_date}`;
}

function formatClassDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(`${value}T00:00:00`));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join("");
}
