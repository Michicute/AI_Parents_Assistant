"use client";

import { FormEvent, useState } from "react";
import { Save } from "lucide-react";

type AdminAccountFormProps<T> = {
  submitLabel: string;
  onSubmit: (payload: { email: string; password: string; full_name: string; preferred_language?: string }) => Promise<T>;
  onCreated: (created: T) => void;
  showPreferredLanguage?: boolean;
};

export function AdminAccountForm<T>({ submitLabel, onSubmit, onCreated, showPreferredLanguage = false }: AdminAccountFormProps<T>) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("vi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await onSubmit({
        email,
        password,
        full_name: fullName,
        ...(showPreferredLanguage ? { preferred_language: preferredLanguage } : {}),
      });
      onCreated(created);
      setEmail("");
      setPassword("");
      setFullName("");
      setPreferredLanguage("vi");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể tạo tài khoản");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-[2rem] border border-brand-100 bg-white p-5 shadow-soft sm:p-6">
      <label className="text-sm font-bold text-ink">
        Họ và tên
        <input
          className="portal-input mt-2 w-full font-normal"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
        />
      </label>
      <label className="text-sm font-bold text-ink">
        Email
        <input
          className="portal-input mt-2 w-full font-normal"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="text-sm font-bold text-ink">
        Mật khẩu tạm thời
        <input
          className="portal-input mt-2 w-full font-normal"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
      </label>
      {showPreferredLanguage ? (
        <label className="text-sm font-semibold">
          Ngôn ngữ AI Insight
          <select
            className="mt-1 min-h-11 w-full rounded border border-ink/15 bg-white px-3 font-normal outline-none focus:border-leaf"
            value={preferredLanguage}
            onChange={(event) => setPreferredLanguage(event.target.value)}
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
      ) : null}
      <button
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-5 font-black text-white shadow-glow hover:bg-brand-500 disabled:opacity-60"
        disabled={busy}
      >
        <Save className="h-4 w-4" aria-hidden="true" />
        {busy ? "Đang tạo..." : submitLabel}
      </button>
      {error ? <p className="rounded-2xl border border-coral/30 bg-coral/10 p-4 text-sm font-semibold text-coral">{error}</p> : null}
    </form>
  );
}
