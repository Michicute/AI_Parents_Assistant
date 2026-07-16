"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Link2, QrCode, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminSession } from "@/components/admin/AdminSession";
import {
  createZaloLinkSession,
  getStudentChannelLinks,
  getZaloLinkSession,
  StudentSummary,
  ZaloChannelLinkResponse,
  ZaloLinkSessionResponse,
} from "@/lib/api";

type Props = {
  params: Promise<{ studentId: string }>;
};

export default function StudentZaloPage({ params }: Props) {
  const { studentId } = use(params);

  return (
    <AppShell role="admin" title="Liên kết Zalo học viên" subtitle="Tạo QR/link để gắn senderId với học viên">
      <AdminSession>{(accessToken) => <StudentZaloPanel studentId={studentId} accessToken={accessToken} />}</AdminSession>
    </AppShell>
  );
}

function StudentZaloPanel({ studentId, accessToken }: { studentId: string; accessToken: string }) {
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [session, setSession] = useState<ZaloLinkSessionResponse | null>(null);
  const [links, setLinks] = useState<ZaloChannelLinkResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sessionToken = session?.session_token ?? "";
  const connected = useMemo(() => session?.status === "connected" || links.some((link) => link.status === "active"), [links, session?.status]);

  useEffect(() => {
    void loadStudent();
    void (async () => {
      const existing = await loadLinks();
      const hasActive = existing.some((link) => link.status === "active");
      if (!hasActive) {
        await handleCreateSession();
      }
    })();
  }, [accessToken, studentId]);

  useEffect(() => {
    if (!sessionToken || connected || ["failed", "expired"].includes(session?.status ?? "")) {
      return;
    }
    const timer = setInterval(() => {
      void refreshSession();
    }, 3000);
    return () => clearInterval(timer);
  }, [connected, session?.status, sessionToken]);

  async function loadStudent() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"}/api/students/${studentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error("Không thể tải thông tin học viên");
      }
      setStudent(await response.json());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể tải thông tin học viên");
    } finally {
      setLoading(false);
    }
  }

  async function loadLinks() {
    try {
      const fetched = await getStudentChannelLinks(studentId, accessToken);
      setLinks(fetched);
      return fetched;
    } catch {
      setLinks([]);
      return [];
    }
  }

  async function refreshSession() {
    if (!sessionToken) return;
    try {
      setSession(await getZaloLinkSession(sessionToken, accessToken));
      await loadLinks();
    } catch {
      // ignore polling noise
    }
  }

  async function handleCreateSession() {
    setBusy(true);
    setError("");
    try {
      const created = await createZaloLinkSession(studentId, accessToken);
      setSession(created);
      await loadLinks();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể tạo phiên liên kết Zalo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
        <h2 className="text-lg font-bold">Thông tin học viên</h2>
        {loading ? <p className="mt-3 text-sm text-ink/60">Đang tải...</p> : null}
        {student ? (
          <div className="mt-3 space-y-2 text-sm">
            <p><span className="font-semibold">Họ tên:</span> {student.full_name}</p>
            <p><span className="font-semibold">Trình độ:</span> {student.level}</p>
            <p><span className="font-semibold">ID:</span> {student.id}</p>
          </div>
        ) : null}
        <button
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded bg-brand px-4 font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-60"
          onClick={handleCreateSession}
          disabled={busy}
        >
          <QrCode className="h-4 w-4" aria-hidden="true" />
          {busy ? "Đang tạo..." : "Tạo QR / link Zalo"}
        </button>
        {error ? <p className="mt-4 rounded border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Trạng thái liên kết</h2>
          <button className="inline-flex items-center gap-2 rounded border border-ink/15 px-3 py-2 text-sm" onClick={refreshSession}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Làm mới
          </button>
        </div>
        {session ? (
          <div className="mt-4 grid gap-4 md:grid-cols-[280px_1fr]">
            <div className="rounded border border-ink/10 bg-paper p-4">
              {session.qr_code_url ? (
                <img alt="QR liên kết Zalo" src={session.qr_code_url} className="mx-auto h-56 w-56 rounded bg-white object-contain p-3" />
              ) : (
                <div className="flex h-56 items-center justify-center rounded bg-white text-sm text-ink/60">Chưa có QR</div>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <p><span className="font-semibold">Trạng thái:</span> {session.status}</p>
              <p className="rounded border border-leaf/20 bg-leaf/10 p-3 text-ink/70">
                Phụ huynh quét QR, gửi bất kỳ tin nhắn nào trong Zalo, rồi trả lời CÓ khi bot hỏi xác nhận học viên.
              </p>
              <p><span className="font-semibold">Sender ID:</span> {session.sender_id ?? "Chưa có"}</p>
              <p><span className="font-semibold">Tên Zalo:</span> {session.zalo_display_name ?? "Chưa có"}</p>
              <p><span className="font-semibold">Deep link:</span></p>
              {session.deep_link_url ? (
                <a className="inline-flex items-center gap-2 text-leaf underline" href={session.deep_link_url} target="_blank" rel="noreferrer">
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  Mở Zalo
                </a>
              ) : (
                <span className="text-ink/60">Chưa có link</span>
              )}
              <p><span className="font-semibold">Hết hạn:</span> {new Date(session.expires_at).toLocaleString()}</p>
              {session.error_message ? <p className="text-coral">{session.error_message}</p> : null}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink/60">Chưa tạo phiên liên kết.</p>
        )}

        <div className="mt-6">
          <h3 className="text-base font-semibold">Liên kết hiện có</h3>
          <div className="mt-3 space-y-2">
            {links.length ? (
              links.map((link) => (
                <article key={link.id} className="rounded border border-ink/10 bg-paper p-3 text-sm">
                  <p><span className="font-semibold">Sender ID:</span> {link.sender_id}</p>
                  <p><span className="font-semibold">Tên:</span> {link.zalo_display_name ?? "Chưa có"}</p>
                  <p><span className="font-semibold">Trạng thái:</span> {link.status}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-ink/60">Chưa có liên kết nào.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
