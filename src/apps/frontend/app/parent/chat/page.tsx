"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Home,
  Paperclip,
  Send,
  Star,
  UserRound,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { ChatbotHero } from "@/components/ChatbotHero";
import { ChatSource, getMyChildren, sendChat, StudentSummary } from "@/lib/api";
import { parentChatHistoryKey } from "@/lib/chat-history";
import { getAccessToken } from "@/lib/dev-auth";

const prompts = [
  `"Con cần cải thiện kỹ năng nào?"`,
  `"Kết quả bài kiểm tra gần nhất như thế nào?"`,
  `"Con đã học những chủ đề gì trong tháng này?"`,
  `"Có tài liệu nào để con ôn tập thêm không?"`,
];

const quickTopics = [
  { label: "Tiến độ học tập", icon: CheckCircle2, prompt: "Con đang tiến bộ thế nào trong tháng này?" },
  { label: "Kỹ năng", icon: Star, prompt: "Con cần cải thiện kỹ năng tiếng Anh nào nhất?" },
  { label: "Bài kiểm tra", icon: ClipboardCheck, prompt: "Tóm tắt kết quả bài kiểm tra gần nhất của con." },
  { label: "Lịch học", icon: CalendarDays, prompt: "Cho tôi xem lịch học sắp tới của con." },
  { label: "Học tại nhà", icon: Home, prompt: "Tôi nên hỗ trợ con học tiếng Anh tại nhà như thế nào?" },
];

type ChatTurn = {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
  intent?: string;
  intents?: string[];
  sources?: ChatSource[];
  retrievedContext?: string[];
  safetyNotes?: string[];
};

function normalizeIntents(intent: string | undefined, intents: unknown): string[] | undefined {
  if (Array.isArray(intents)) {
    const normalized = intents.filter((item): item is string => typeof item === "string");
    if (normalized.length) return normalized;
  }
  return intent ? [intent] : undefined;
}

function normalizeSources(sources: unknown): ChatSource[] | undefined {
  if (!Array.isArray(sources)) return undefined;
  const normalized = sources.filter((source): source is ChatSource => (
    typeof source === "object" && source !== null &&
    (source as ChatSource).kind !== undefined &&
    typeof (source as ChatSource).title === "string"
  ));
  return normalized.length ? normalized : undefined;
}

function parseSavedHistory(value: string | null): ChatTurn[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((turn): turn is Partial<ChatTurn> => typeof turn === "object" && turn !== null)
    .map((turn, index) => {
      const intent = typeof turn.intent === "string" ? turn.intent : undefined;
      return {
        id: typeof turn.id === "string" ? turn.id : `saved-${index}`,
        question: typeof turn.question === "string" ? turn.question : "",
        answer: typeof turn.answer === "string" ? turn.answer : "",
        createdAt: typeof turn.createdAt === "string" ? turn.createdAt : "",
        intent,
        intents: normalizeIntents(intent, turn.intents),
        sources: normalizeSources(turn.sources),
        retrievedContext: Array.isArray(turn.retrievedContext) ? turn.retrievedContext.filter((item): item is string => typeof item === "string") : undefined,
        safetyNotes: Array.isArray(turn.safetyNotes) ? turn.safetyNotes.filter((item): item is string => typeof item === "string") : undefined,
      };
    })
    .filter((turn) => turn.question || turn.answer);
}

function formatTime(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Bây giờ";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function splitAnswer(answer: string): string[] {
  const trimmed = answer.trim();
  if (!trimmed) return ["Pippo chưa có đủ thông tin để phản hồi. Phụ huynh vui lòng thử lại với câu hỏi cụ thể hơn."];
  const explicitParagraphs = trimmed.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (explicitParagraphs.length > 1) return explicitParagraphs;
  const lines = trimmed.split("\n").map((item) => item.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  const sentences = trimmed.match(/[^.!?。！？]+[.!?。！？]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [trimmed];
  if (sentences.length <= 2 || trimmed.length <= 220) return [trimmed];
  const groups: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    groups.push(sentences.slice(index, index + 2).join(" "));
  }
  return groups;
}

export default function ParentChatPage() {
  const [message, setMessage] = useState("Khang đang tiến bộ thế nào trong 6 tháng qua?");
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [children, setChildren] = useState<StudentSummary[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endOfChatRef = useRef<HTMLDivElement | null>(null);
  const skipNextHistorySaveRef = useRef(false);
  const selectedStudent = children.find((student) => student.id === selectedStudentId);
  const studentName = selectedStudent?.full_name ?? "học viên";

  useEffect(() => {
    async function loadChildren() {
      const token = getAccessToken();
      setAccessToken(token);
      if (!token) return;
      try {
        const items = await getMyChildren(token);
        setChildren(items);
        setSelectedStudentId(items[0]?.id ?? "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Không thể tải danh sách học viên.");
      }
    }
    void loadChildren();
  }, []);

  useEffect(() => {
    if (!selectedStudentId) {
      setHistory([]);
      return;
    }
    skipNextHistorySaveRef.current = true;
    try {
      const saved = window.localStorage.getItem(parentChatHistoryKey(selectedStudentId));
      setHistory(parseSavedHistory(saved));
    } catch {
      setHistory([]);
    }
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedStudentId) return;
    if (skipNextHistorySaveRef.current) {
      skipNextHistorySaveRef.current = false;
      return;
    }
    window.localStorage.setItem(parentChatHistoryKey(selectedStudentId), JSON.stringify(history));
  }, [history, selectedStudentId]);

  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, pendingQuestion, busy, error]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitQuestion(message);
  }

  async function submitQuestion(rawQuestion: string) {
    if (!accessToken) {
      setError("Chưa tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại.");
      return;
    }
    const question = rawQuestion.trim();
    if (!question || busy || !selectedStudentId) return;
    setBusy(true);
    setError("");
    setPendingQuestion(question);
    setMessage("");
    try {
      const response = await sendChat(question, selectedStudentId, accessToken);
      setHistory((currentHistory) => [
        ...currentHistory,
        {
          id: `${Date.now()}-${currentHistory.length}`,
          question,
          answer: response.answer,
          createdAt: new Date().toISOString(),
          intent: response.intent,
          intents: normalizeIntents(response.intent, response.intents),
          sources: normalizeSources(response.sources),
          retrievedContext: response.retrieved_context,
          safetyNotes: response.safety_notes,
        },
      ]);
      setPendingQuestion(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thể kết nối trợ lý AI.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      role="parent"
      title="Chat với Pippo"
      subtitle="Trợ lý học tập thông minh của Pippo luôn sẵn sàng hỗ trợ bạn 24/7"
      hidePageHeader
      mainClassName="flex h-[calc(100vh-72px)] flex-col overflow-hidden py-4 lg:py-4"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink-muted">Trợ lý học tập thông minh của Pippo luôn sẵn sàng hỗ trợ bạn 24/7</p>
          <StudentHeaderCard students={children} selectedStudentId={selectedStudentId} onStudentChange={setSelectedStudentId} />
        </div>

        <div className="flex flex-wrap gap-2">
          {quickTopics.map((topic, index) => {
            const Icon = topic.icon;
            return (
              <button
                key={topic.label}
                type="button"
                onClick={() => setMessage(topic.prompt)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-bold shadow-soft ${
                  index === 0 ? "border-brand bg-brand-50 text-brand" : "border-[#d9e2d3] bg-white text-ink-soft hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {topic.label}
              </button>
            );
          })}
        </div>

        <section className="portal-section flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="flex-1 overflow-y-auto bg-white px-4 py-5 sm:px-6">
              <div className="flex min-h-full flex-col gap-6">
                <div className="space-y-6">
                  <AssistantGreeting studentName={studentName} />

                  {history.map((turn) => (
                    <ChatTurnView key={turn.id} turn={turn} />
                  ))}

                  {pendingQuestion ? <UserBubble question={pendingQuestion} /> : null}

                  {busy ? (
                    <AssistantShell>
                      <div className="rounded-[18px] border border-[#d9e2d3] bg-[#fbfcf9] px-4 py-4 shadow-soft">
                        <div className="flex items-center gap-3 text-sm font-semibold text-ink-muted">
                          <span className="h-2.5 w-2.5 animate-pulse-soft rounded-full bg-brand" />
                          Pippo đã nhận câu hỏi và đang tổng hợp thông tin cho phụ huynh...
                        </div>
                      </div>
                    </AssistantShell>
                  ) : null}
                </div>

                <div ref={endOfChatRef} />
              </div>
            </div>

            {error ? <div className="border-t border-coral/20 bg-coral-light/40 px-6 py-3 text-sm font-semibold text-coral-dark">{error}</div> : null}

            <form onSubmit={onSubmit} className="border-t border-[#d9e2d3] bg-white px-4 py-3 sm:px-5">
              <InChatPromptSuggestions onPromptSubmit={submitQuestion} disabled={busy || !selectedStudentId} />
              <div className="flex min-h-[64px] items-center gap-3 rounded-[22px] border border-[#d9e2d3] bg-white px-4 py-2 shadow-soft focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-100">
                <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted" aria-label="Đính kèm tệp">
                  <Paperclip className="h-5 w-5" aria-hidden="true" />
                </button>
                <textarea
                  id="parent-chat-input"
                  rows={1}
                  className="max-h-28 min-h-[40px] flex-1 resize-none border-0 bg-transparent py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-faint"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitQuestion(message);
                    }
                  }}
                  placeholder="Nhập câu hỏi của bạn..."
                  aria-label="Hỏi trợ lý Pippo"
                />
                <button
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-glow hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy || !selectedStudentId || !message.trim()}
                  aria-label="Gửi câu hỏi"
                >
                  <Send className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-ink-faint">Pippo có thể mắc lỗi. Vui lòng kiểm tra lại thông tin quan trọng.</p>
            </form>
        </section>
      </div>
    </AppShell>
  );
}

function InChatPromptSuggestions({ onPromptSubmit, disabled }: { onPromptSubmit: (message: string) => Promise<void>; disabled: boolean }) {
  return (
    <section className="mb-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => void onPromptSubmit(prompt.replaceAll('"', ""))}
          disabled={disabled}
          className="min-h-[44px] rounded-[14px] border border-[#d9e2d3] bg-white px-3 py-2 text-left text-xs font-bold leading-5 text-ink-soft shadow-soft hover:bg-brand-50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </section>
  );
}

function StudentHeaderCard({
  students,
  selectedStudentId,
  onStudentChange,
}: {
  students: StudentSummary[];
  selectedStudentId: string;
  onStudentChange: (studentId: string) => void;
}) {
  const student = students.find((item) => item.id === selectedStudentId);
  return (
    <section className="portal-section p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#fde2d5] text-orange-700">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Thông tin học viên</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="font-display truncate text-[22px] leading-none tracking-[-0.02em] text-ink">{student?.full_name ?? "Chưa chọn học viên"}</h2>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand">{student?.level ?? "Đang cập nhật"}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[520px]">
          <div className="rounded-[16px] border border-[#d9e2d3] bg-[#fbfcf9] px-4 py-2.5">
            <p className="text-xs font-semibold text-ink-muted">Hồ sơ học tập</p>
            <p className="mt-1 text-sm font-bold text-ink">Đã liên kết với phụ huynh</p>
          </div>
          <label className="block rounded-[16px] border border-[#d9e2d3] bg-white px-4 py-2">
            <span className="block text-xs font-semibold text-ink-muted">Chọn học viên</span>
            <select
              className="mt-1 w-full bg-transparent text-sm font-bold text-ink outline-none"
              value={selectedStudentId}
              onChange={(event) => onStudentChange(event.target.value)}
              aria-label="Chọn học viên để trò chuyện với Pippo"
            >
              {students.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name} - {item.level}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}

function AssistantGreeting({ studentName }: { studentName: string }) {
  return (
    <AssistantShell time="10:30 AM">
      <div className="max-w-[520px] text-sm leading-6 text-ink">
        <p>Xin chào phụ huynh! Pippo rất vui được hỗ trợ hôm nay.</p>
        <p className="mt-1">Phụ huynh muốn tìm hiểu thông tin gì về quá trình học tiếng Anh của {studentName}?</p>
      </div>
    </AssistantShell>
  );
}

function ChatTurnView({ turn }: { turn: ChatTurn }) {
  return (
    <>
      <UserBubble question={turn.question} time={formatTime(turn.createdAt)} />
      <AssistantShell time={formatTime(turn.createdAt)}>
        <RichAnswer answer={turn.answer} />
        <TraceDetails turn={turn} />
      </AssistantShell>
    </>
  );
}

function UserBubble({ question, time = "Bây giờ" }: { question: string; time?: string }) {
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[78%] text-right">
        <div className="inline-block rounded-[18px] rounded-br-md border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-medium leading-6 text-ink shadow-soft">
          {question}
        </div>
        <p className="mt-1 text-xs text-ink-faint">{time} ✓✓</p>
      </div>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f3d7d2] text-sm font-bold text-coral-dark">
        <UserRound className="h-5 w-5" aria-hidden="true" />
      </div>
    </div>
  );
}

function AssistantShell({ children, time }: { children: ReactNode; time?: string }) {
  return (
    <div className="flex items-start gap-3">
      <ChatbotHero size="sm" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <p className="font-display text-base leading-none tracking-[-0.02em] text-brand">Pippo AI</p>
          {time ? <span className="text-xs text-ink-faint">{time}</span> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function RichAnswer({ answer }: { answer: string }) {
  const paragraphs = splitAnswer(answer);
  const intro = paragraphs[0];
  const rest = paragraphs.slice(1);
  return (
    <div className="max-w-[720px] space-y-3 text-sm leading-7 text-ink">
      <p>{intro}</p>

      {rest.map((paragraph, index) => (
        <p key={`${paragraph}-${index}`}>{paragraph}</p>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <ActionChip label="Gợi ý bài tập cho kỹ năng" />
        <ActionChip label="So sánh với bạn cùng lớp" />
        <ActionChip label="Xem báo cáo chi tiết" />
      </div>
    </div>
  );
}

function ActionChip({ label }: { label: string }) {
  return (
    <button type="button" className="rounded-[12px] border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-bold text-brand hover:bg-brand-100">
      {label}
    </button>
  );
}

function TraceDetails({ turn }: { turn: ChatTurn }) {
  const turnIntents = normalizeIntents(turn.intent, turn.intents);
  if (!turn.intent && !turnIntents && !turn.sources && !turn.safetyNotes) return null;
  return (
    <details className="mt-3 max-w-[720px] rounded-[14px] border border-[#d9e2d3] bg-muted p-3 text-xs text-ink-muted">
      <summary className="cursor-pointer font-semibold">Trace AI</summary>
      <div className="mt-3 space-y-2">
        <TraceLine label="Intent" value={turn.intent} />
        <TraceLine label="Intents" value={turnIntents?.join(", ")} />
        <TraceLine label="Nguồn" value={turn.sources?.map(formatSource).join(" | ")} />
        <TraceLine label="Safety notes" value={turn.safetyNotes?.join(" | ")} />
      </div>
    </details>
  );
}

function formatSource(source: ChatSource) {
  const detail = source.document_type ? ` · ${source.document_type}` : "";
  return `${source.title}${detail}`;
}

function TraceLine({ label, value }: { label: string; value?: string }) {
  return (
    <p>
      <span className="font-bold text-ink">{label}:</span> {value || "Không có dữ liệu."}
    </p>
  );
}
