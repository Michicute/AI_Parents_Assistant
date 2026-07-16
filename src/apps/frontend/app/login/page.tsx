"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import logoPrimary from "@/images/logo_primary.png";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/dev-auth";
import { getMe, login, UserSummary } from "@/lib/api";

function dashboardForRole(user: UserSummary): string | null {
  if (user.role === "ADMIN") return "/admin/dashboard";
  if (user.role === "TEACHER") return "/teacher/dashboard";
  if (user.role === "STUDENT") return "/student/dashboard";
  if (user.role === "PARENT") return "/parent/dashboard";
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    void getMe(token)
      .then((user) => {
        const dashboard = dashboardForRole(user);
        if (dashboard) {
          router.replace(dashboard);
          return;
        }
        clearAccessToken();
      })
      .catch(() => clearAccessToken());
  }, [router]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
  }, [error]);

  function validateForm() {
    const trimmedEmail = email.trim();
    const nextErrors: { email?: string; password?: string } = {};

    if (!trimmedEmail) {
      nextErrors.email = "Vui lòng nhập email đã được trung tâm cấp.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = "Email chưa đúng định dạng.";
    }

    if (!password) {
      nextErrors.password = "Vui lòng nhập mật khẩu.";
    }

    setFieldErrors(nextErrors);

    if (nextErrors.email) {
      emailRef.current?.focus();
      return false;
    }

    if (nextErrors.password) {
      passwordRef.current?.focus();
      return false;
    }

    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!validateForm()) return;

    setBusy(true);

    try {
      const session = await login(email.trim(), password);
      const dashboard = dashboardForRole(session.user);
      if (!dashboard) {
        clearAccessToken();
        router.replace("/login");
        return;
      }
      setAccessToken(session.access_token);
      router.replace(dashboard);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thể đăng nhập");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-paper px-4 py-4 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex h-full w-full max-w-[1360px] flex-col justify-center">
        <section className="grid max-h-full overflow-hidden rounded-[24px] border border-[#d9e2d3] bg-white shadow-panel lg:grid-cols-[0.94fr_1.06fr]">
          <div className="min-h-0 overflow-hidden border-b border-[#d9e2d3] p-5 sm:p-6 lg:border-b-0 lg:border-r lg:p-8 xl:p-9">
            <BrandMark className="w-full max-w-[600px] lg:hidden [&_img]:w-full" />

            <div className="mt-8 max-w-[600px]">
              <h1 className="text-[2.55rem] font-extrabold leading-[1.02] tracking-[-0.05em] text-ink sm:text-[3rem]">Welcome Back</h1>
              <p className="mt-3 max-w-[480px] text-base leading-7 text-ink-soft">
                Please enter your credentials to access your academic pathway.
              </p>
            </div>

            <form onSubmit={onSubmit} noValidate className="mt-7 max-w-[600px] space-y-4" aria-describedby={error ? "login-form-error" : undefined}>
              <div>
                <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-ink">
                  Email or Phone No.
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
                  <input
                    ref={emailRef}
                    id="login-email"
                    className="portal-input min-h-[48px] w-full pl-12"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((current) => ({ ...current, email: undefined }));
                      }
                    }}
                    autoComplete="email"
                    placeholder="name@pts.edu.vn"
                    aria-invalid={fieldErrors.email ? "true" : "false"}
                    aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                    required
                    autoFocus
                  />
                </div>
                {fieldErrors.email ? (
                  <p id="login-email-error" className="mt-2 text-sm font-medium text-coral-dark">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-ink">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
                  <input
                    ref={passwordRef}
                    id="login-password"
                    className="portal-input min-h-[48px] w-full pl-12 pr-14"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors((current) => ({ ...current, password: undefined }));
                      }
                    }}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={fieldErrors.password || error ? "true" : "false"}
                    aria-describedby={fieldErrors.password ? "login-password-error" : error ? "login-form-error" : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-1.5 right-1.5 inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-100"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <p id="login-password-error" className="mt-2 text-sm font-medium text-coral-dark">
                    {fieldErrors.password}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-3 text-body text-ink-soft">
                  <input type="checkbox" className="h-5 w-5 rounded border border-[#d9e2d3] text-brand focus:ring-brand-100" />
                  Remember me
                </label>
                <button type="button" className="text-body font-semibold text-brand hover:text-brand-dark">
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-brand px-5 text-base font-bold text-white shadow-glow transition-all hover:bg-brand-500 focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                    Đang đăng nhập...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            {error ? (
              <div
                ref={errorRef}
                id="login-form-error"
                className="mt-4 flex max-w-[600px] items-start gap-3 rounded-[16px] border border-coral/30 bg-coral-light/70 p-3"
                role="alert"
                tabIndex={-1}
              >
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-coral-dark" aria-hidden="true" />
                <p className="text-sm font-semibold text-coral-dark">{error}</p>
              </div>
            ) : null}

          </div>

          <div className="relative hidden min-h-0 flex-col justify-between overflow-hidden bg-[linear-gradient(180deg,#1d7e2f,#0f5f22)] p-7 text-white lg:flex xl:p-9">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_36%)]" />
            <div className="relative flex items-center justify-end gap-4">
              <span className="hidden rounded-full border border-white/18 bg-white/8 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/82 sm:inline-flex">
                Academic Access
              </span>
            </div>

            <div className="relative mt-8 grid flex-1 place-items-center">
              <div className="absolute inset-x-8 bottom-4 h-24 rounded-full bg-emerald-950/25 blur-3xl" />
              <Image
                src={logoPrimary}
                alt="Pippo English learning mascot"
                className="relative w-full max-w-[440px] object-contain drop-shadow-2xl"
                priority
              />
            </div>

            <div className="relative mt-7 max-w-[520px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white/80">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                PTS English Center Portal
              </div>

              <h2 className="mt-5 text-[2.35rem] font-extrabold leading-[1.02] tracking-[-0.05em] text-white xl:text-[2.9rem]">
                Empowering Your Future
              </h2>
              <p className="mt-4 max-w-[520px] text-base leading-7 text-white/82">
                The PTS Portal is designed to streamline your educational journey, providing all the tools needed to bridge the gap between where you are and where you want to be.
              </p>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
