"use client";

import { useEffect, useState } from "react";
import { Link2, QrCode } from "lucide-react";
import { getStudentZaloQr, StudentZaloQrResponse } from "@/lib/api";

export function ZaloQrSection({ studentId, accessToken, compact = false }: { studentId: string; accessToken: string | null; compact?: boolean }) {
  const [qrData, setQrData] = useState<StudentZaloQrResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadQr() {
      if (!accessToken) {
        setLoading(false);
        return;
      }
      try {
        setQrData(await getStudentZaloQr(studentId, accessToken));
      } catch {
        setQrData(null);
      } finally {
        setLoading(false);
      }
    }
    void loadQr();
  }, [studentId, accessToken]);

  useEffect(() => {
    if (!qrData || qrData.connected || !qrData.session_token) return;
    if (!accessToken) return;
    const timer = setInterval(async () => {
      try {
        const updated = await getStudentZaloQr(studentId, accessToken);
        setQrData(updated);
        if (updated.connected) {
          clearInterval(timer);
          return;
        }
        if (updated.status === "failed" || updated.status === "expired") {
          clearInterval(timer);
          const refreshed = await getStudentZaloQr(studentId, accessToken);
          setQrData(refreshed);
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [studentId, accessToken, qrData?.connected, qrData?.session_token]);

  const shellClass = compact
    ? "rounded-[2rem] border border-brand-100 bg-white p-5 shadow-soft sm:p-6"
    : "rounded-lg border border-ink/10 bg-white p-4 shadow-panel";

  if (loading) {
    return (
      <section className={shellClass}>
        <p className="text-sm text-slate-500">Đang tải QR Zalo...</p>
      </section>
    );
  }

  if (!qrData) {
    return (
      <section className={shellClass}>
        <p className="text-sm text-coral">Không thể tải mã QR Zalo.</p>
      </section>
    );
  }

  if (qrData.connected) {
    return (
      <section className={shellClass}>
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-leaf" aria-hidden="true" />
          <h3 className="text-sm font-black">Liên kết Zalo</h3>
        </div>
        <div className="mt-3 space-y-1 text-sm">
          <p className="font-semibold text-leaf">Đã liên kết</p>
          {qrData.zalo_display_name ? <p className="text-slate-600">{qrData.zalo_display_name}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className={shellClass}>
      <div className="flex items-center gap-2">
        <QrCode className="h-4 w-4 text-leaf" aria-hidden="true" />
        <h3 className="text-sm font-black">Liên kết Zalo</h3>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Quét QR để mở chat Zalo với {qrData.bot_display_name || "bot trung tâm"}, gửi Xin chào, rồi nhập mã OTP đang hiển thị dưới đây. Bot sẽ hiện thông tin học viên để phụ huynh xác nhận trước khi liên kết.
      </p>
      {qrData.qr_code_url ? (
        <img
          alt="QR mở chat Zalo Bot"
          src={qrData.qr_code_url}
          className={`mx-auto mt-3 rounded bg-brand-50 object-contain p-2 ${compact ? "h-56 w-56" : "h-48 w-48"}`}
        />
      ) : (
        <div className={`mx-auto mt-3 flex items-center justify-center rounded bg-brand-50 p-4 text-center text-xs leading-5 text-coral ${compact ? "h-56 w-56" : "h-48 w-48"}`}>
          {qrData.error_message || "Bot Zalo chưa sẵn sàng. Admin cần đăng nhập Zalo bot trước."}
        </div>
      )}
      {qrData.error_message ? (
        <p className="mt-2 rounded-2xl border border-coral/20 bg-coral/10 p-3 text-xs leading-5 text-coral">
          {qrData.error_message}
        </p>
      ) : null}
      {qrData.otp_code ? (
        <div className="mt-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand/70">OTP lien ket</p>
          <p className="mt-2 text-3xl font-black tracking-[0.3em] text-brand">{qrData.otp_code}</p>
          {qrData.otp_expires_at ? <p className="mt-2 text-xs text-slate-500">Hieu luc den {new Date(qrData.otp_expires_at).toLocaleString()}</p> : null}
        </div>
      ) : null}
      {qrData.deep_link_url ? (
        <a
          href={qrData.deep_link_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-2 text-sm font-black text-brand"
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          Mở Zalo
        </a>
      ) : null}
      {!qrData.connected && qrData.session_token ? (
        <p className="mt-3 text-center text-xs text-slate-500">Dang cho phu huynh gui Xin chao, nhap OTP va xac nhan trong Zalo...</p>
      ) : null}
    </section>
  );
}
