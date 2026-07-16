"use client";

import { useEffect, useState } from "react";
import { Bot, LogOut, QrCode, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminSession } from "@/components/admin/AdminSession";

type BotStatus = {
  status: string;
  qr_image_base64: string | null;
  display_name: string | null;
  avatar: string | null;
  error: string | null;
};

type QrLoginResponse = {
  status: string;
  qr_image_base64: string | null;
  display_name: string | null;
  avatar: string | null;
  error: string | null;
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export default function AdminZaloBotPage() {
  return (
    <AppShell role="admin" title="Quản lý Zalo Bot" subtitle="Đăng nhập và theo dõi trạng thái bot Zalo">
      <AdminSession>{(accessToken) => <ZaloBotPanel accessToken={accessToken} />}</AdminSession>
    </AppShell>
  );
}

function ZaloBotPanel({ accessToken }: { accessToken: string }) {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [qrData, setQrData] = useState<QrLoginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadStatus();
  }, [accessToken]);

  useEffect(() => {
    if (!qrData || qrData.status === "connected") return;
    if (qrData.status === "failed" || qrData.status === "expired") return;
    const timer = setInterval(() => void loadStatus(), 2000);
    return () => clearInterval(timer);
  }, [qrData?.status]);

  useEffect(() => {
    if (botStatus?.status === "connected" && qrData) {
      setQrData(null);
    }
  }, [botStatus?.status]);

  async function loadStatus() {
    try {
      const response = await fetch(`${backendUrl}/api/admin/zalo-bot/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Không thể tải trạng thái bot");
      const data: BotStatus = await response.json();
      setBotStatus(data);
      if (data.qr_image_base64 || data.status === "scanned" || data.status === "waiting_scan") {
        setQrData({
          status: data.status,
          qr_image_base64: data.qr_image_base64,
          display_name: data.display_name,
          avatar: data.avatar,
          error: data.error,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoginQR() {
    setLoginBusy(true);
    setError("");
    setQrData(null);
    try {
      const response = await fetch(`${backendUrl}/api/admin/zalo-bot/login-qr`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Không thể khởi tạo đăng nhập QR");
      const data: QrLoginResponse = await response.json();
      setQrData(data);
      if (data.status === "connected") {
        await loadStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi đăng nhập QR");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    if (!window.confirm("Thoát tài khoản Zalo bot hiện tại để quét tài khoản mới?")) return;
    setLogoutBusy(true);
    setError("");
    try {
      const response = await fetch(`${backendUrl}/api/admin/zalo-bot/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Không thể thoát tài khoản Zalo bot");
      const data: QrLoginResponse = await response.json();
      setBotStatus(data);
      setQrData(null);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi thoát tài khoản Zalo bot");
    } finally {
      setLogoutBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-ink/60">Đang tải trạng thái bot...</p>;
  }

  const isConnected = botStatus?.status === "connected";
  const needsQR = !isConnected;

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-leaf" aria-hidden="true" />
          <h2 className="text-lg font-bold">Trạng thái Bot</h2>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${isConnected ? "bg-leaf" : "bg-coral"}`} />
            <span className="font-semibold">{statusLabel(botStatus?.status)}</span>
          </div>
          {botStatus?.display_name ? (
            <p><span className="text-ink/55">Tên:</span> {botStatus.display_name}</p>
          ) : null}
          {botStatus?.error ? (
            <p className="text-coral">{botStatus.error}</p>
          ) : null}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-ink/15 px-3 text-sm font-semibold"
            onClick={() => void loadStatus()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Làm mới
          </button>
          {needsQR ? (
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-brand px-4 text-sm font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-60"
              onClick={handleLoginQR}
              disabled={loginBusy}
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              {loginBusy ? "Đang tạo QR..." : "Đăng nhập QR"}
            </button>
          ) : (
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-coral/40 px-3 text-sm font-semibold text-coral hover:bg-coral/10 disabled:opacity-60"
              onClick={handleLogout}
              disabled={logoutBusy}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {logoutBusy ? "Đang thoát..." : "Thoát tài khoản"}
            </button>
          )}
        </div>
        {error ? <p className="mt-3 rounded border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
        <h2 className="text-lg font-bold">Đăng nhập bằng QR</h2>
        {isConnected ? (
          <div className="mt-4 rounded border border-leaf/30 bg-leaf/10 p-4 text-sm">
            <p className="font-semibold text-leaf">Bot đã kết nối thành công</p>
            <p className="mt-1 text-ink/70">Bot đang lắng nghe tin nhắn Zalo. Phụ huynh có thể quét QR liên kết học viên.</p>
          </div>
        ) : qrData?.qr_image_base64 ? (
          <div className="mt-4">
            <p className="mb-3 text-sm text-ink/60">Mở ứng dụng Zalo trên điện thoại → Quét mã QR bên dưới để đăng nhập bot:</p>
            <img
              alt="QR đăng nhập Zalo Bot"
              src={`data:image/png;base64,${qrData.qr_image_base64}`}
              className="mx-auto h-64 w-64 rounded border border-ink/10 bg-white p-2"
            />
            {qrData.status === "scanned" ? (
              <p className="mt-3 text-center text-sm font-semibold text-leaf">Đã quét! Đang xác nhận...</p>
            ) : null}
          </div>
        ) : qrData?.status === "failed" || qrData?.status === "expired" ? (
          <div className="mt-4">
            <p className="text-sm text-coral">{qrData.error || "QR đã hết hạn hoặc bị từ chối"}</p>
            <button
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded bg-brand px-4 text-sm font-semibold text-white shadow-glow hover:bg-brand-500"
              onClick={handleLoginQR}
            >
              Thử lại
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink/60">
            {needsQR ? "Bấm \"Đăng nhập QR\" để bắt đầu." : "Bot đang hoạt động."}
          </p>
        )}

        <div className="mt-6 rounded border border-ink/10 bg-paper p-4">
          <h3 className="text-sm font-bold">Hướng dẫn</h3>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-ink/70">
            <li>Bấm nút &quot;Đăng nhập QR&quot;</li>
            <li>Mở Zalo trên điện thoại (tài khoản sẽ dùng làm bot)</li>
            <li>Vào Cài đặt → Quét mã QR → Quét mã hiển thị trên màn hình</li>
            <li>Xác nhận đăng nhập trên điện thoại</li>
            <li>Bot sẽ tự kết nối và lưu session. Lần sau khởi động lại không cần quét.</li>
          </ol>
        </div>
      </section>
    </div>
  );
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "connected": return "Đã kết nối";
    case "needs_qr": return "Cần quét QR";
    case "waiting_scan": return "Đang chờ quét QR";
    case "scanned": return "Đã quét, đang xác nhận";
    case "failed": return "Lỗi kết nối";
    case "disconnected": return "Mất kết nối";
    case "unavailable": return "Service không khả dụng";
    default: return "Không rõ";
  }
}
