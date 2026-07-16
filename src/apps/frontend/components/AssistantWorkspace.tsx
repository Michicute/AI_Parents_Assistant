"use client";

import { FormEvent, useState } from "react";
import { BookOpenCheck, LogOut, MessageSquareText, Send, ShieldCheck } from "lucide-react";
import { sendChat, UserSummary } from "@/lib/api";
import { StatusPill } from "./StatusPill";

type AssistantWorkspaceProps = {
  accessToken: string;
  currentUser: UserSummary;
  onLogout: () => void;
  logoutDisabled: boolean;
};

export function AssistantWorkspace({ accessToken, currentUser, onLogout, logoutDisabled }: AssistantWorkspaceProps) {
  const [message, setMessage] = useState("Minh đang tiến bộ như thế nào ở kỹ năng viết?");
  const [chatAnswer, setChatAnswer] = useState("");
  const [busy, setBusy] = useState<"chat" | null>(null);
  const [error, setError] = useState("");

  async function onChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("chat");
    setError("");
    try {
      const response = await sendChat(message, "student-a", accessToken);
      setChatAnswer(response.answer);
    } catch {

      setError("Chưa thể kết nối trợ lý. Vui lòng thử lại sau.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-leaf">Trợ lý AI cho phụ huynh</p>
            <h1 className="text-2xl font-bold text-ink">Bảng theo dõi học tiếng Anh của Minh Nguyen</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink/70">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-leaf" aria-hidden="true" />
              {currentUser.role}: {currentUser.email}
            </span>
            <button
              onClick={onLogout}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-ink/15 px-3 font-semibold text-ink disabled:opacity-60"
              disabled={logoutDisabled}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[280px_1fr_320px]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink/60">Trình độ hiện tại</p>
                <h2 className="text-xl font-bold">Nền tảng A2</h2>
              </div>
              <StatusPill label="Đang học" tone="good" />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink/55">Điểm TB</dt>
                <dd className="text-lg font-bold">82%</dd>
              </div>
              <div>
                <dt className="text-ink/55">Chuyên cần</dt>
                <dd className="text-lg font-bold">94%</dd>
              </div>
              <div>
                <dt className="text-ink/55">Khóa học</dt>
                <dd className="font-semibold">A2 English</dd>
              </div>
              <div>
                <dt className="text-ink/55">Giáo viên</dt>
                <dd className="font-semibold">Cô Lan</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <BookOpenCheck className="h-4 w-4 text-leaf" aria-hidden="true" />
              Tín hiệu kỹ năng
            </h2>
            <div className="space-y-3 text-sm">
              {[
                ["Đọc", "Ổn định", "good"],
                ["Nghe", "Đang tiến bộ", "good"],
                ["Nói", "Cần luyện tự tin", "watch"],
                ["Viết", "Cấu trúc câu", "watch"],
              ].map(([skill, label, tone]) => (
                <div className="flex items-center justify-between gap-3" key={skill}>
                  <span>{skill}</span>
                  <StatusPill label={label} tone={tone as "good" | "watch"} />
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="space-y-4">
          <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
              <MessageSquareText className="h-5 w-5 text-leaf" aria-hidden="true" />
              Trợ lý cho phụ huynh
            </h2>
            <form onSubmit={onChat} className="flex flex-col gap-3 sm:flex-row">
              <input
                className="min-h-11 flex-1 rounded border border-ink/15 px-3 outline-none focus:border-leaf"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                aria-label="Hỏi trợ lý"
              />
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-brand px-4 font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-60"
                disabled={busy === "chat"}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Hỏi
              </button>
            </form>
            <div className="mt-4 min-h-28 rounded border border-ink/10 bg-skyline/60 p-4 text-sm leading-6">
              {chatAnswer || "Hỏi về tiến độ, bài tập, chính sách trung tâm, nhận xét giáo viên hoặc cách hỗ trợ con tại nhà."}
            </div>
          </div>

          {error ? <p className="rounded border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
            <h2 className="mb-3 text-base font-bold">Kế hoạch hỗ trợ tại nhà</h2>
            <ul className="space-y-3 text-sm leading-6">
              {[
                "Mỗi ngày hỏi Minh một câu và khuyến khích con trả lời bằng câu đầy đủ.",
                "Đọc cùng con một đoạn ngắn phù hợp trình độ hai lần mỗi tuần.",
                "Khen ý tưởng rõ ràng trước khi góp ý về ngữ pháp.",
              ].map((item) => (
                <li className="border-l-4 border-leaf bg-leaf/5 px-3 py-2" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
            <h2 className="mb-3 text-base font-bold">Việc học sắp tới</h2>
            <div className="space-y-3 text-sm">
              <Task title="Ôn tập từ vựng" meta="Hạn thứ Sáu" />
              <Task title="Kiểm tra nói ngắn" meta="Buổi học tiếp theo" />
              <Task title="Rubric viết A2" meta="Đang chờ nhận xét giáo viên" />
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Task({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded border border-ink/10 p-3">
      <p className="font-semibold">{title}</p>
      <p className="text-ink/60">{meta}</p>
    </div>
  );
}
