"use client";

import { FormEvent, useEffect, useState } from "react";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/dev-auth";

import { LogIn, ShieldCheck } from "lucide-react";
import { clearChatSession, getMe, login, UserSummary } from "@/lib/api";
import { clearParentChatHistories } from "@/lib/chat-history";
import { AssistantWorkspace } from "./AssistantWorkspace";

type AuthGateState = {
  accessToken: string | null;
  user: UserSummary | null;
};

export function AuthGate() {

  const [state, setState] = useState<AuthGateState>({ accessToken: null, user: null });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setBusy(false);
      return;
    }


    let mounted = true;
    void getMe(token)
      .then((user) => {
        if (!mounted) return;
        setState({ accessToken: token, user });
      })
      .catch(() => {
        if (!mounted) return;
        clearAccessToken();
        setState({ accessToken: null, user: null });
      })
      .finally(() => {
        if (mounted) setBusy(false);
      });

    return () => {
      mounted = false;
    };
  }, []);


  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await login(email, password);

      setAccessToken(session.access_token);
      setState({ accessToken: session.access_token, user: session.user });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể đăng nhập");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    if (state.user?.role === "PARENT" && state.accessToken) {
      clearParentChatHistories();
      await clearChatSession(state.accessToken).catch(() => undefined);
    }
    clearAccessToken();
    clearAccessToken();
    setState({ accessToken: null, user: null });
    setBusy(false);
  }

  if (busy && !state.accessToken) {
    return <main className="grid min-h-screen place-items-center bg-paper text-ink">Đang tải phiên đăng nhập...</main>;
  }

  if (!state.accessToken || !state.user) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4">
        <section className="w-full max-w-sm rounded-lg border border-ink/10 bg-white p-5 shadow-panel">
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-leaf" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-leaf">Trung tâm Anh ngữ</p>
              <h1 className="text-xl font-bold text-ink">Đăng nhập trợ lý phụ huynh</h1>
            </div>
          </div>
          <form onSubmit={onLogin} className="space-y-3">
            <label className="block text-sm font-semibold text-ink">
              Email
              <input
                className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Mật khẩu
              <input
                className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded bg-brand px-4 font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-60"
              disabled={busy}
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Đăng nhập
            </button>
          </form>
          {error ? <p className="mt-3 rounded border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
        </section>
      </main>
    );
  }


  return <AssistantWorkspace accessToken={state.accessToken} currentUser={state.user} onLogout={onLogout} logoutDisabled={busy} />;
}
