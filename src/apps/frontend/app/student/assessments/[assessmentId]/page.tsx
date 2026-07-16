"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Save, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  getStudentAssessmentDetail,
  logStudentAssessmentAttemptEvent,
  PublicAssessmentQuestionResponse,
  startStudentAssessmentAttempt,
  StudentAssessmentAttemptResponse,
  StudentAssessmentDetailResponse,
  submitOwnStudentAssessment,
} from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";

const violationEvents = new Set(["fullscreen_exit", "tab_hidden", "window_blur", "copy_attempt", "paste_attempt", "context_menu_attempt"]);
type LockdownPrompt = {
  eventType: "fullscreen_exit" | "tab_hidden" | "window_blur" | "copy_attempt" | "paste_attempt" | "context_menu_attempt";
  violationCount: number;
};

export default function StudentAssessmentPage() {
  const params = useParams<{ assessmentId: string }>();
  const router = useRouter();
  const assessmentId = params.assessmentId;
  const [detail, setDetail] = useState<StudentAssessmentDetailResponse | null>(null);
  const [attempt, setAttempt] = useState<StudentAssessmentAttemptResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [missingQuestions, setMissingQuestions] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [lockdownPrompt, setLockdownPrompt] = useState<LockdownPrompt | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [reviewedQuestions, setReviewedQuestions] = useState<Record<string, boolean>>({});
  const serverOffsetRef = useRef(0);
  const submitInFlightRef = useRef(false);
  const lastEventAtRef = useRef<Record<string, number>>({});
  const lastViolationAtRef = useRef(0);

  const draftKey = useMemo(() => (detail ? `student-assessment-draft:${detail.student.id}:${assessmentId}` : ""), [assessmentId, detail]);
  const isStarted = Boolean(attempt && ["in_progress", "expired", "locked"].includes(attempt.status));
  const maxViolations = detail?.assessment.max_violation_count ?? 2;
  const isLocked = attempt?.status === "locked";

  useEffect(() => {
    async function loadAssessment() {
      const token = getAccessToken();
      if (!token) return;
      try {
        const data = await getStudentAssessmentDetail(assessmentId, token);
        setDetail(data);
        setAttempt(data.attempt);
        serverOffsetRef.current = new Date(data.server_now).getTime() - Date.now();
        const submittedAnswers = Object.fromEntries(
          data.questions.map((question) => {
            const submittedAnswer = data.submitted_answers.find((answer) => answer.question_id === question.id);
            return [question.id, submittedAnswer?.answer_text ?? ""];
          }),
        );
        const key = `student-assessment-draft:${data.student.id}:${assessmentId}`;
        const draft = window.localStorage.getItem(key);
        const draftAnswers = draft ? safeParseAnswers(draft) : {};
        setAnswers(data.submitted ? submittedAnswers : { ...submittedAnswers, ...draftAnswers });
        setCurrentQuestionIndex(0);
        setReviewedQuestions({});
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Không thể tải bài kiểm tra");
      }
    }
    void loadAssessment();
  }, [assessmentId]);

  useEffect(() => {
    if (!draftKey || !detail || detail.submitted) return;
    window.localStorage.setItem(draftKey, JSON.stringify(answers));
  }, [answers, detail, draftKey]);

  useEffect(() => {
    if (!attempt?.expires_at || attempt.status !== "in_progress") {
      setRemainingMs(null);
      return;
    }
    const updateRemaining = () => {
      const now = Date.now() + serverOffsetRef.current;
      const nextRemaining = Math.max(0, new Date(attempt.expires_at || "").getTime() - now);
      setRemainingMs(nextRemaining);
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);

  const unansweredCount = useMemo(
    () => detail?.questions.filter((question) => !answers[question.id]?.trim()).length ?? 0,
    [answers, detail],
  );

  const activeQuestion = detail?.questions[currentQuestionIndex] ?? null;

  const submitAssessmentNow = useCallback(
    async (reason: "manual" | "expired" | "locked") => {
      const token = getAccessToken();
      if (!token || !detail || detail.submitted || submitInFlightRef.current) return;
      submitInFlightRef.current = true;
      setBusy(true);
      setMessage("");
      try {
        await submitOwnStudentAssessment(
          assessmentId,
          {
            student_id: detail.student.id,
            submitted_at: new Date().toISOString(),
            attempt_id: attempt?.id ?? null,
            answers: detail.questions.map((question) => ({
              question_id: question.id,
              answer_text: answers[question.id]?.trim() || "-",
            })),
          },
          token,
        );
        setDetail({ ...detail, submitted: true });
        setAttempt((current) => current ? { ...current, status: "submitted", submitted_at: new Date().toISOString() } : current);
        setConfirming(false);
        setMissingQuestions([]);
        if (draftKey) window.localStorage.removeItem(draftKey);
        await exitExamFullscreen();
        router.push("/student/dashboard");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Không thể nộp bài");
      } finally {
        submitInFlightRef.current = false;
        setBusy(false);
      }
    },
    [answers, assessmentId, attempt?.id, detail, draftKey, router],
  );

  useEffect(() => {
    if (remainingMs === 0 && attempt?.status === "in_progress" && !detail?.submitted) {
      void submitAssessmentNow("expired");
    }
  }, [attempt?.status, detail?.submitted, remainingMs, submitAssessmentNow]);

  useEffect(() => {
    if ((attempt?.status === "expired" || attempt?.status === "locked") && !detail?.submitted) {
      void submitAssessmentNow(attempt.status === "locked" ? "locked" : "expired");
    }
  }, [attempt?.status, detail?.submitted, submitAssessmentNow]);

  async function startAttempt() {
    const token = getAccessToken();
    if (!token || !detail) return;
    setBusy(true);
    setMessage("");
    try {
      const started = await startStudentAssessmentAttempt(assessmentId, token);
      setAttempt(started);
      if (detail.assessment.lockdown_enabled) {
        await requestExamFullscreen().catch(() => {
          setMessage("Trình duyệt chưa vào fullscreen. Hệ thống vẫn sẽ ghi nhận nếu bạn rời khỏi màn làm bài.");
        });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể bắt đầu bài kiểm tra");
    } finally {
      setBusy(false);
    }
  }

  const logEvent = useCallback(
    async (eventType: "fullscreen_exit" | "tab_hidden" | "window_blur" | "copy_attempt" | "paste_attempt" | "context_menu_attempt") => {
      const token = getAccessToken();
      if (!token || !detail?.assessment.lockdown_enabled || !attempt || attempt.status !== "in_progress") return;
      const now = Date.now();
      if (lockdownPrompt && violationEvents.has(eventType)) return;
      if (violationEvents.has(eventType) && now - lastViolationAtRef.current < 1500) return;
      if (now - (lastEventAtRef.current[eventType] ?? 0) < 1500) return;
      lastEventAtRef.current[eventType] = now;
      if (violationEvents.has(eventType)) lastViolationAtRef.current = now;
      try {
        const updated = await logStudentAssessmentAttemptEvent(
          assessmentId,
          {
            event_type: eventType,
            occurred_at: new Date().toISOString(),
            metadata: { user_agent: window.navigator.userAgent },
          },
          token,
        );
        setAttempt(updated);
        if (violationEvents.has(eventType)) {
          const remaining = Math.max(0, maxViolations - updated.violation_count);
          setMessage(updated.status === "locked" ? "Bạn đã vượt quá số lần vi phạm. Hệ thống đang tự nộp bài." : `Hệ thống đã ghi nhận ${updated.violation_count}/${maxViolations} lần vi phạm. Còn ${remaining} lần trước khi bài bị tự nộp.`);
          if (updated.status === "locked") {
            setLockdownPrompt(null);
            void submitAssessmentNow("locked");
          } else {
            setLockdownPrompt({ eventType, violationCount: updated.violation_count });
          }
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Không thể ghi nhận sự kiện giám sát");
      }
    },
    [assessmentId, attempt, detail?.assessment.lockdown_enabled, lockdownPrompt, maxViolations, submitAssessmentNow],
  );

  async function acknowledgeLockdownWarning() {
    setBusy(true);
    try {
      await requestExamFullscreen();
      setLockdownPrompt(null);
      setMessage("");
    } catch {
      setMessage("Trình duyệt chưa cho phép bật toàn màn hình. Vui lòng bấm xác nhận để quay lại chế độ toàn màn hình và tiếp tục làm bài.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!detail?.assessment.lockdown_enabled || !isStarted || detail.submitted) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void logEvent("tab_hidden");
    };
    const onBlur = () => void logEvent("window_blur");
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) void logEvent("fullscreen_exit");
    };
    const preventAndLog = (event: Event, eventType: "copy_attempt" | "paste_attempt" | "context_menu_attempt") => {
      event.preventDefault();
      void logEvent(eventType);
    };
    const onCopy = (event: Event) => preventAndLog(event, "copy_attempt");
    const onPaste = (event: Event) => preventAndLog(event, "paste_attempt");
    const onContextMenu = (event: Event) => preventAndLog(event, "context_menu_attempt");
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [detail?.assessment.lockdown_enabled, detail?.submitted, isStarted, logEvent]);

  async function submitAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || detail.submitted || !attempt) return;
    const missing = detail.questions
      .map((question, index) => (answers[question.id]?.trim() ? null : index + 1))
      .filter((item): item is number => item !== null);
    setMissingQuestions(missing);
    setConfirming(true);
    setMessage(
      missing.length
        ? `Bạn còn ${missing.length} câu chưa làm. Vui lòng kiểm tra trước khi xác nhận nộp bài.`
        : "Bạn đã trả lời tất cả câu hỏi. Vui lòng xác nhận để nộp bài.",
    );
  }

  function markSkippedQuestions(fromIndex: number, toIndex: number) {
    if (!detail || fromIndex === toIndex) return;
    const lower = Math.min(fromIndex, toIndex);
    const upper = Math.max(fromIndex, toIndex);
    setReviewedQuestions((current) => {
      const next = { ...current };
      for (let index = lower; index < upper; index += 1) {
        const question = detail.questions[index];
        if (!question) continue;
        if (!answers[question.id]?.trim()) {
          next[question.id] = true;
        }
      }
      return next;
    });
  }

  function navigateToQuestion(nextIndex: number) {
    if (!detail) return;
    const boundedIndex = Math.max(0, Math.min(nextIndex, detail.questions.length - 1));
    if (boundedIndex === currentQuestionIndex) return;
    markSkippedQuestions(currentQuestionIndex, boundedIndex);
    setCurrentQuestionIndex(boundedIndex);
    setConfirming(false);
  }

  return (
    <AppShell
      role="student"
      title={detail?.assessment.title ?? "Làm bài kiểm tra"}
      subtitle={detail ? `${detail.student.full_name} - ${detail.assessment.assessment_date || "Chưa đặt ngày"}` : "Đang tải bài kiểm tra"}
      immersive
      hidePageHeader={Boolean(detail && isStarted && !detail.submitted)}
    >
      {message ? <p className="mb-4 portal-card border-brand-200 bg-brand-50 text-body font-semibold text-ink">{message}</p> : null}
      {lockdownPrompt && detail && attempt?.status === "in_progress" ? (
        <LockdownWarningDialog
          prompt={lockdownPrompt}
          maxViolations={maxViolations}
          busy={busy}
          onAcknowledge={acknowledgeLockdownWarning}
        />
      ) : null}
      {!detail ? (
        <section className="portal-section animate-pulse-soft">
          <div className="h-6 w-64 rounded-lg bg-muted" />
          <div className="mt-4 space-y-4">
            <div className="h-32 rounded-4xl bg-muted" />
            <div className="h-32 rounded-4xl bg-muted" />
          </div>
        </section>
      ) : detail.submitted ? (
        <SubmittedView detail={detail} answers={answers} />
      ) : !isStarted ? (
        <StartAssessmentPanel detail={detail} busy={busy} onStart={startAttempt} />
      ) : (
        <form onSubmit={submitAssessment} className="space-y-5">
          <ExamStatusBar detail={detail} attempt={attempt} remainingMs={remainingMs} />
          <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <QuestionNavigator
              questions={detail.questions}
              answers={answers}
              reviewedQuestions={reviewedQuestions}
              currentQuestionIndex={currentQuestionIndex}
              onSelectQuestion={navigateToQuestion}
            />
            {activeQuestion ? (
              <section className="space-y-4">
                <QuestionAnswer
                  key={activeQuestion.id}
                  index={currentQuestionIndex}
                  question={activeQuestion}
                  value={answers[activeQuestion.id] || ""}
                  readOnly={busy || isLocked || Boolean(lockdownPrompt)}
                  onChange={(value) => {
                    setAnswers((current) => ({ ...current, [activeQuestion.id]: value }));
                    setReviewedQuestions((current) => ({ ...current, [activeQuestion.id]: false }));
                    setConfirming(false);
                    setMissingQuestions([]);
                  }}
                />
                <div className="flex flex-col gap-3 rounded-[24px] border border-brand-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium text-ink-muted">
                    Câu {currentQuestionIndex + 1}/{detail.questions.length}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => navigateToQuestion(currentQuestionIndex - 1)}
                      className="portal-btn-secondary"
                      disabled={currentQuestionIndex === 0 || busy}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      Câu trước
                    </button>
                    {currentQuestionIndex < detail.questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => navigateToQuestion(currentQuestionIndex + 1)}
                        className="portal-btn-primary"
                        disabled={busy}
                      >
                        Câu tiếp theo
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                    <button className="portal-btn-primary" disabled={busy || isLocked}>
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Kiểm tra và nộp bài
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
          {confirming ? (
            <section className="portal-card border-brand-200">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-brand" aria-hidden="true" />
                <div>
                  <h2 className="text-heading-3 text-ink">Xác nhận nộp bài</h2>
                  {missingQuestions.length ? (
                    <p className="mt-1 text-body text-ink-muted">Bạn còn {missingQuestions.length} câu chưa trả lời: {missingQuestions.join(", ")}. Nếu xác nhận, hệ thống sẽ lưu các câu này là chưa trả lời.</p>
                  ) : (
                    <p className="mt-1 text-body text-ink-muted">Sau khi nộp, bạn chỉ có thể xem lại câu trả lời và không thể sửa bài trên cổng học viên.</p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => submitAssessmentNow("manual")}
                  className="portal-btn-primary"
                  disabled={busy}
                >
                  {busy ? "Đang nộp..." : "Xác nhận nộp bài"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setMessage("");
                  }}
                  className="portal-btn-secondary"
                  disabled={busy}
                >
                  Kiểm tra lại
                </button>
              </div>
            </section>
          ) : null}
        </form>
      )}
    </AppShell>
  );
}

function QuestionNavigator({
  questions,
  answers,
  reviewedQuestions,
  currentQuestionIndex,
  onSelectQuestion,
}: {
  questions: PublicAssessmentQuestionResponse[];
  answers: Record<string, string>;
  reviewedQuestions: Record<string, boolean>;
  currentQuestionIndex: number;
  onSelectQuestion: (index: number) => void;
}) {
  return (
    <aside className="h-fit rounded-[28px] border border-brand-100 bg-white p-5 shadow-sm xl:sticky xl:top-24">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-black uppercase tracking-[0.08em] text-ink/70">Question Navigator</p>
          <p className="text-sm text-ink-muted">Chạm vào số câu để chuyển nhanh.</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-5 gap-3">
        {questions.map((question, index) => {
          const answered = Boolean(answers[question.id]?.trim());
          const reviewed = Boolean(reviewedQuestions[question.id]);
          const active = index === currentQuestionIndex;
          const toneClass = answered
            ? "border-[#9fdab2] bg-[#e7f7ec] text-[#1d6b35]"
            : reviewed
              ? "border-[#ecd28b] bg-[#fff5cf] text-[#8a6c0f]"
              : "border-brand-100 bg-white text-ink";

          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelectQuestion(index)}
              className={`grid h-12 w-12 place-items-center rounded-full border text-sm font-bold transition ${toneClass} ${active ? "ring-2 ring-brand ring-offset-2" : "hover:border-brand-200 hover:bg-brand-50/60"}`}
              aria-current={active ? "step" : undefined}
              aria-label={`Câu ${index + 1}`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-5 space-y-2 text-sm text-ink-muted">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#e7f7ec]" />
          Đã chọn đáp án
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#fff5cf]" />
          Đã xem nhưng chưa trả lời
        </div>
      </div>
    </aside>
  );
}

function LockdownWarningDialog({
  prompt,
  maxViolations,
  busy,
  onAcknowledge,
}: {
  prompt: LockdownPrompt;
  maxViolations: number;
  busy: boolean;
  onAcknowledge: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="lockdown-warning-title">
      <section className="w-full max-w-lg rounded-2xl border border-coral-light bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-coral-light text-coral">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="lockdown-warning-title" className="text-heading-3 text-ink">Cảnh báo chế độ làm bài</h2>
            <p className="mt-2 text-body text-ink-muted">
              Hệ thống đã ghi nhận: {lockdownEventLabel(prompt.eventType)}. Đây là lần vi phạm {prompt.violationCount}/{maxViolations}.
            </p>
            <p className="mt-2 text-body font-semibold text-ink">
              Bạn cần xác nhận để quay lại toàn màn hình trước khi tiếp tục làm bài.
            </p>
          </div>
        </div>
        <button type="button" onClick={onAcknowledge} className="portal-btn-primary mt-5 w-full" disabled={busy}>
          {busy ? "Đang bật toàn màn hình..." : "Tôi hiểu, quay lại toàn màn hình"}
        </button>
      </section>
    </div>
  );
}

function StartAssessmentPanel({ detail, busy, onStart }: { detail: StudentAssessmentDetailResponse; busy: boolean; onStart: () => void }) {
  return (
    <section className="portal-section">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-heading-3 text-ink">Sẵn sàng làm bài</h2>
          <p className="mt-2 text-body text-ink-muted">
            Thời lượng: {detail.assessment.duration_minutes ? `${detail.assessment.duration_minutes} phút` : "không giới hạn"}. {detail.assessment.lockdown_enabled ? `Bài này bật giám sát web và tự nộp khi vượt quá ${detail.assessment.max_violation_count ?? 2} lần vi phạm.` : "Bài này không bật giám sát web."}
          </p>
        </div>
      </div>
      <button type="button" onClick={onStart} className="portal-btn-primary mt-5" disabled={busy}>
        <Clock className="h-4 w-4" aria-hidden="true" />
        {busy ? "Đang bắt đầu..." : "Bắt đầu làm bài"}
      </button>
    </section>
  );
}

function ExamStatusBar({ detail, attempt, remainingMs }: { detail: StudentAssessmentDetailResponse; attempt: StudentAssessmentAttemptResponse | null; remainingMs: number | null }) {
  return (
    <section className="portal-card sticky top-3 z-10 border-brand-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-brand" aria-hidden="true" />
          <div>
            <p className="text-caption font-semibold text-ink-muted">Thời gian còn lại</p>
            <p className="text-heading-3 text-ink">{remainingMs === null ? "Không giới hạn" : formatRemaining(remainingMs)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="portal-badge">{attempt?.status === "locked" ? "Đã khóa" : "Đang làm bài"}</span>
          {detail.assessment.lockdown_enabled ? <span className="portal-badge">Vi phạm {attempt?.violation_count ?? 0}/{detail.assessment.max_violation_count ?? 2}</span> : null}
        </div>
      </div>
    </section>
  );
}

function SubmittedView({ detail, answers }: { detail: StudentAssessmentDetailResponse; answers: Record<string, string> }) {
  return (
    <section className="space-y-4">
      <div className="portal-card border-brand-200 bg-brand-50 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <p className="text-body font-semibold text-ink">Bạn đã nộp bài này. Bạn chỉ có thể xem lại câu trả lời đã lưu.</p>
      </div>
      {detail.questions.map((question, index) => (
        <QuestionAnswer
          key={question.id}
          index={index}
          question={question}
          value={answers[question.id] || ""}
          readOnly
        />
      ))}
    </section>
  );
}

function QuestionAnswer({
  index,
  question,
  value,
  onChange,
  readOnly = false,
}: {
  index: number;
  question: PublicAssessmentQuestionResponse;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <section className="portal-card">
      <div className="flex items-center gap-2">
        <span className="portal-badge">
          Câu {index + 1}
        </span>
        <span className="text-caption font-semibold text-ink-muted">{question.skill_tag} - {question.max_score} điểm</span>
      </div>
      <h2 className="mt-2 text-heading-3 text-ink">{question.question_text}</h2>
      {question.question_type === "multiple_choice" ? (
        <div className="mt-4 grid gap-2">
          {question.choices.map((choice) => (
            <label key={choice} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-body font-semibold transition-all ${value === choice ? "border-brand bg-brand-50 text-brand" : "border-brand-100 bg-white text-ink hover:border-brand-200 hover:bg-brand-50/50"} ${readOnly ? "cursor-default" : ""}`}>
              <input type="radio" name={question.id} value={choice} checked={value === choice} onChange={(event) => onChange?.(event.target.value)} disabled={readOnly} className="accent-brand" />
              {choice}
            </label>
          ))}
          {readOnly && !value ? <p className="text-body text-ink-muted">Chưa trả lời.</p> : null}
        </div>
      ) : (
        <textarea
          className="portal-input mt-4 min-h-32 w-full resize-y rounded-xl p-4"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          disabled={readOnly}
          placeholder={readOnly ? "Chưa trả lời." : "Nhập câu trả lời của bạn..."}
        />
      )}
    </section>
  );
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function requestExamFullscreen() {
  if (document.fullscreenElement) return Promise.resolve();
  return document.documentElement.requestFullscreen();
}

function exitExamFullscreen() {
  if (!document.fullscreenElement || !document.exitFullscreen) return Promise.resolve();
  return document.exitFullscreen().catch(() => undefined);
}

function lockdownEventLabel(eventType: LockdownPrompt["eventType"]) {
  const labels: Record<LockdownPrompt["eventType"], string> = {
    fullscreen_exit: "thoát chế độ toàn màn hình",
    tab_hidden: "chuyển tab hoặc ẩn trang làm bài",
    window_blur: "rời khỏi cửa sổ làm bài",
    copy_attempt: "thao tác sao chép",
    paste_attempt: "thao tác dán nội dung",
    context_menu_attempt: "mở menu chuột phải",
  };
  return labels[eventType];
}

function safeParseAnswers(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
