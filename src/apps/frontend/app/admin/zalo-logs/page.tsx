"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Link2Off, MessagesSquare, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminSession } from "@/components/admin/AdminSession";
import {
  listZaloChatThreads,
  listZaloThreadMessages,
  ZaloChatThreadResponse,
  ZaloMessageResponse,
} from "@/lib/api";

export default function AdminZaloLogsPage() {
  return (
    <AppShell
      role="admin"
      title="Nhật ký Zalo"
      subtitle="Xem lịch sử hội thoại giữa phụ huynh và chatbot Zalo"
    >
      <AdminSession>{(accessToken) => <ZaloLogsPanel accessToken={accessToken} />}</AdminSession>
    </AppShell>
  );
}

function threadKey(thread: ZaloChatThreadResponse): string {
  return `${thread.sender_id}::${thread.student_id ?? ""}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ZaloLogsPanel({ accessToken }: { accessToken: string }) {
  const [threads, setThreads] = useState<ZaloChatThreadResponse[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [messages, setMessages] = useState<ZaloMessageResponse[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");

  async function loadThreads(autoSelect: boolean) {
    setThreadsLoading(true);
    setThreadsError("");
    try {
      const data = await listZaloChatThreads(accessToken);
      setThreads(data);
      if (autoSelect && data.length > 0) {
        setSelectedKey(threadKey(data[0]));
      }
    } catch (err) {
      setThreadsError(err instanceof Error ? err.message : "Không thể tải danh sách hội thoại Zalo");
    } finally {
      setThreadsLoading(false);
    }
  }

  useEffect(() => {
    void loadThreads(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const selectedThread = threads.find((thread) => threadKey(thread) === selectedKey) ?? null;

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      return;
    }
    let mounted = true;
    setMessagesLoading(true);
    setMessagesError("");
    listZaloThreadMessages(selectedThread.sender_id, selectedThread.student_id, accessToken)
      .then((data) => {
        if (!mounted) return;
        setMessages(data);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setMessages([]);
        setMessagesError(err instanceof Error ? err.message : "Không thể tải tin nhắn");
      })
      .finally(() => {
        if (mounted) setMessagesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedKey, accessToken]);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className="flex max-h-[70vh] flex-col rounded-lg border border-ink/10 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-leaf" aria-hidden="true" />
            <h2 className="text-lg font-bold">Hội thoại</h2>
          </div>
          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded border border-ink/15 px-2.5 text-sm font-semibold"
            onClick={() => void loadThreads(false)}
            aria-label="Làm mới danh sách hội thoại"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Làm mới
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {threadsLoading ? (
            <p className="px-4 py-6 text-sm text-ink/60">Đang tải hội thoại...</p>
          ) : threadsError ? (
            <p className="m-4 rounded border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{threadsError}</p>
          ) : threads.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink/60">Chưa có hội thoại Zalo nào.</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {threads.map((thread) => {
                const key = threadKey(thread);
                const active = key === selectedKey;
                const name = thread.zalo_display_name || thread.sender_id;
                const linked = thread.student_id !== null;
                return (
                  <li key={key}>
                    <button
                      onClick={() => setSelectedKey(key)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
                        active ? "bg-brand-50" : "hover:bg-muted"
                      }`}
                      aria-current={active ? "true" : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-ink">{name}</span>
                        <span className="shrink-0 text-caption text-ink/50">{formatDateTime(thread.last_message_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {linked ? (
                          <span className="inline-flex items-center gap-1 rounded bg-leaf/10 px-1.5 py-0.5 text-caption font-semibold text-leaf">
                            <GraduationCap className="h-3 w-3" aria-hidden="true" />
                            {thread.student_name}
                            {thread.student_level ? ` · ${thread.student_level}` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-coral/10 px-1.5 py-0.5 text-caption font-semibold text-coral">
                            <Link2Off className="h-3 w-3" aria-hidden="true" />
                            Chưa liên kết
                          </span>
                        )}
                      </div>
                      {thread.last_message_preview ? (
                        <p className="truncate text-sm text-ink/60">
                          {thread.last_message_direction === "outbound" ? "Bot: " : ""}
                          {thread.last_message_preview}
                        </p>
                      ) : null}
                      <span className="text-caption text-ink/45">{thread.message_count} tin nhắn</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="flex max-h-[70vh] flex-col rounded-lg border border-ink/10 bg-white shadow-panel">
        {!selectedThread ? (
          <p className="px-4 py-6 text-sm text-ink/60">Chọn một hội thoại để xem chi tiết.</p>
        ) : (
          <>
            <div className="border-b border-ink/10 px-4 py-3">
              <h2 className="truncate text-lg font-bold">{selectedThread.zalo_display_name || selectedThread.sender_id}</h2>
              <p className="text-caption text-ink/55">
                {selectedThread.student_id
                  ? `Liên kết: ${selectedThread.student_name}${selectedThread.student_level ? ` · ${selectedThread.student_level}` : ""}`
                  : "Chưa liên kết học viên"}
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-paper px-4 py-4">
              {messagesLoading ? (
                <p className="text-sm text-ink/60">Đang tải tin nhắn...</p>
              ) : messagesError ? (
                <p className="rounded border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{messagesError}</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-ink/60">Chưa có tin nhắn trong hội thoại này.</p>
              ) : (
                messages.map((message) => {
                  const outbound = message.direction === "outbound";
                  return (
                    <div key={message.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-lg px-3 py-2 shadow-sm ${
                        outbound ? "bg-brand text-white" : "border border-ink/10 bg-white text-ink"
                      }`}>
                        <p className={`text-caption font-semibold ${outbound ? "text-white/80" : "text-ink/50"}`}>
                          {outbound ? "Bot" : selectedThread.zalo_display_name || "Phụ huynh"}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{message.content}</p>
                        <p className={`mt-1 text-caption ${outbound ? "text-white/70" : "text-ink/45"}`}>
                          {formatDateTime(message.sent_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
