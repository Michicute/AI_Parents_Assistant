"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpenCheck,
  Bot,
  FileText,
  ClipboardList,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  MessagesSquare,
  MessageSquareText,
  Shield,
  Users,
  X,
} from "lucide-react";

import {
  clearChatSession,
  getMe,
  getParentNotifications,
  getTeacherClasses,
  markParentNotificationRead,
  ClassSummary,
  ParentNotificationResponse,
  UserSummary,
} from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/dev-auth";
import { clearParentChatHistories } from "@/lib/chat-history";
import { BrandMark } from "@/components/BrandMark";
import { ChatbotHero } from "@/components/ChatbotHero";

type AppShellProps = {
  role: "parent" | "teacher" | "admin" | "student";
  title: string;
  subtitle?: string;
  sidebarWidget?: ReactNode;
  hidePageHeader?: boolean;
  immersive?: boolean;
  mainClassName?: string;
  teacherClassId?: string;
  children: ReactNode;
};

function dashboardForRole(user: UserSummary): string | null {
  if (user.role === "ADMIN") return "/admin/dashboard";
  if (user.role === "TEACHER") return "/teacher/dashboard";
  if (user.role === "STUDENT") return "/student/dashboard";
  if (user.role === "PARENT") return "/parent/dashboard";
  return null;
}

function expectedApiRole(role: AppShellProps["role"]) {
  if (role === "admin") return "ADMIN";
  if (role === "teacher") return "TEACHER";
  if (role === "student") return "STUDENT";
  return "PARENT";
}

const navItems = {
  parent: [
    { href: "/parent/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/parent/students", label: "Học viên", icon: BookOpenCheck },
    { href: "/parent/chat", label: "Pippo AI", icon: MessageSquareText },
  ],
  teacher: [
    { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/teacher/classes", label: "Lớp học", icon: LibraryBig },
  ],
  admin: [
    { href: "/admin/dashboard", label: "Dashboard", icon: Shield },
    { href: "/admin/users", label: "Người dùng", icon: Users },
    { href: "/admin/classes", label: "Lớp học", icon: ClipboardList },
    { href: "/admin/documents", label: "Tài liệu", icon: FileText },
    { href: "/admin/zalo-bot", label: "Chatbot Zalo", icon: Bot },
    { href: "/admin/zalo-logs", label: "Nhật ký Zalo", icon: MessagesSquare },
  ],
  student: [{ href: "/student/dashboard", label: "Bài kiểm tra", icon: ClipboardList }],
};

const roleLabels = {
  parent: "Phụ huynh",
  teacher: "Giáo viên",
  admin: "Quản trị viên",
  student: "Học viên",
};

const roleSubtitles = {
  parent: "Parent Support Hub",
  teacher: "Teaching Workspace",
  admin: "Management Hub",
  student: "Learning Workspace",
};

export function AppShell({ role, title, subtitle, sidebarWidget, hidePageHeader = false, immersive = false, mainClassName = "", teacherClassId, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserSummary | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<ParentNotificationResponse[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [newNotificationIds, setNewNotificationIds] = useState<Set<string>>(new Set());
  const [previewedNotification, setPreviewedNotification] = useState<ParentNotificationResponse | null>(null);
  const [teacherClassContext, setTeacherClassContext] = useState<ClassSummary | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const navigationItems = navItems[role];
  const isTeacher = role === "teacher";
  const classIdFromPath = role === "teacher" ? pathname.match(/^\/teacher\/classes\/([^/]+)/)?.[1] ?? "" : "";
  const activeTeacherClassId = teacherClassId || classIdFromPath;

  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationOpen(false);
    setNewNotificationIds(new Set());
    setPreviewedNotification(null);
  }, [pathname]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setAuthChecked(true);
      router.replace("/login");
      return;
    }

    let mounted = true;
    void getMe(token)
      .then((user) => {
        if (!mounted) return;
        const userDashboard = dashboardForRole(user);
        if (!userDashboard) {
          clearAccessToken();
          setAccessToken(null);
          setCurrentUser(null);
          setAuthChecked(true);
          router.replace("/login");
          return;
        }
        setAccessToken(token);
        setCurrentUser(user);
        setAuthChecked(true);
        if (user.role !== expectedApiRole(role)) {
          router.replace(userDashboard);
        }
      })
      .catch(() => {
        if (!mounted) return;
        clearAccessToken();
        setAccessToken(null);
        setCurrentUser(null);
        setAuthChecked(true);
        router.replace("/login");
      });

    return () => {
      mounted = false;
    };
  }, [role, router]);

  useEffect(() => {
    if (role !== "parent" || !accessToken || currentUser?.role !== "PARENT") {
      setNotifications([]);
      return;
    }

    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const items = await getParentNotifications(accessToken, 20);
        if (!cancelled) setNotifications(items);
      } catch {
        if (!cancelled) setNotifications([]);
      }
    };

    void loadNotifications();
    const timer = window.setInterval(loadNotifications, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, currentUser?.role, role]);

  useEffect(() => {
    if (role !== "teacher" || !accessToken || currentUser?.role !== "TEACHER" || !activeTeacherClassId) {
      setTeacherClassContext(null);
      return;
    }

    let cancelled = false;
    void getTeacherClasses(accessToken)
      .then((classes) => {
        if (!cancelled) setTeacherClassContext(classes.find((item) => item.id === activeTeacherClassId) ?? null);
      })
      .catch(() => {
        if (!cancelled) setTeacherClassContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeTeacherClassId, currentUser?.role, role]);

  useEffect(() => {
    const closeNotificationMenu = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
        setNewNotificationIds(new Set());
        setPreviewedNotification(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationOpen(false);
        setNewNotificationIds(new Set());
        setPreviewedNotification(null);
      }
    };
    window.addEventListener("mousedown", closeNotificationMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeNotificationMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const unreadNotificationCount = notifications.filter((item) => item.read_at === null).length;

  const toggleNotifications = useCallback(() => {
    const nextOpen = !notificationOpen;
    setNotificationOpen(nextOpen);
    if (!nextOpen) {
      setNewNotificationIds(new Set());
      setPreviewedNotification(null);
      return;
    }
    if (role !== "parent" || !accessToken) return;

    const unread = notifications.filter((item) => item.read_at === null);
    setNewNotificationIds(new Set(unread.map((item) => item.id)));
    if (!unread.length) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.read_at === null ? { ...item, read_at: readAt } : item));
    void Promise.allSettled(unread.map((item) => markParentNotificationRead(item.id, accessToken)));
  }, [accessToken, notificationOpen, notifications, role]);

  const signOut = useCallback(async () => {
    if (currentUser?.role === "PARENT" && accessToken) {
      clearParentChatHistories();
      await clearChatSession(accessToken).catch(() => undefined);
    }
    clearAccessToken();
    router.push("/login");
  }, [currentUser, accessToken, router]);

  if (!authChecked) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper text-ink">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand" />
          <p className="text-body font-medium text-ink-muted">Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </main>
    );
  }

  if (!accessToken || !currentUser || currentUser.role !== expectedApiRole(role)) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper text-ink">
        <p className="text-body text-ink-muted">Đang chuyển đến trang đăng nhập...</p>
      </main>
    );
  }

  if (immersive) {
    return (
      <div className={`${isTeacher ? "teacher-portal bg-portal-bg text-portal-ink" : "bg-paper text-ink"} min-h-screen`}>
        <main id="main-content" className={`mx-auto min-h-screen w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 ${mainClassName}`}>
          {hidePageHeader ? <h1 className="sr-only">{title}</h1> : (
            <div className="mb-6">
              <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.03em] text-portal-ink max-sm:text-[32px]">{title}</h1>
              {subtitle ? <p className="mt-3 max-w-3xl text-body-lg text-portal-muted">{subtitle}</p> : null}
            </div>
          )}
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className={`${isTeacher ? "teacher-portal bg-portal-bg text-portal-ink" : "bg-paper text-ink"} min-h-screen`}>
      <a href="#main-content" className="skip-link">
        Bỏ qua điều hướng
      </a>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
      ) : null}

      <aside
        role="navigation"
        aria-label="Menu chính"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-250 lg:translate-x-0 ${
          isTeacher ? "w-[258px] border-r border-portal-line bg-portal-bg px-4 py-4" : "sidebar-fixed-width border-r border-[#d9e2d3] bg-white py-6"
        } ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between px-2">
          <Link href={dashboardForRole(currentUser) || "/login"} className="rounded-xl px-1 py-1 focus-visible:outline-portal-green">
            <BrandMark />
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="grid h-10 w-10 place-items-center rounded-xl text-portal-muted hover:bg-white lg:hidden"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-7 px-3">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-portal-muted">{roleLabels[role]}</p>
          <p className="mt-2 text-sm font-semibold text-portal-ink">{roleSubtitles[role]}</p>
        </div>

        <nav className="mt-3 flex flex-1 flex-col gap-1.5" aria-label="Điều hướng chính">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = isTeacher
              ? pathname === item.href ||
                (item.href === "/teacher/classes" &&
                  pathname.startsWith("/teacher/classes") &&
                  !pathname.includes("/students") &&
                  !pathname.includes("/attendance") &&
                  !pathname.includes("/grades") &&
                  !pathname.includes("/assessments")) ||
                (item.href === "/teacher/students" && pathname.includes("/students")) ||
                (item.href === "/teacher/attendance" && pathname.includes("/attendance")) ||
                (item.href === "/teacher/grades" && pathname.includes("/grades")) ||
                (item.href === "/teacher/assessments" && pathname.includes("/assessments"))
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`portal-sidebar-item ${active ? "portal-sidebar-item-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {active ? <span aria-hidden="true" className="absolute left-0 h-7 w-1 rounded-full bg-portal-green" /> : null}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-portal-ink ring-1 ring-portal-line">
                  <Icon className={`h-4 w-4 ${active ? "text-portal-green" : "text-portal-muted"}`} aria-hidden="true" />
                </span>
                <span className="truncate text-[14px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3 px-1">
          {sidebarWidget ?? (
            <div className="portal-card bg-white p-4 text-portal-ink hover:shadow-card">
              <div className="flex items-start gap-3">
                <ChatbotHero size="sm" />
                <div className="min-w-0">
                  <p className="text-base font-bold text-portal-ink">Pippo AI Assistant</p>
                  <p className="mt-1 text-caption text-portal-muted">Gợi ý học tập và tóm tắt tiến độ theo dữ liệu.</p>
                </div>
              </div>
              {role === "parent" ? (
                <Link
                  href="/parent/chat"
                  className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-[14px] bg-brand px-4 text-sm font-bold text-white shadow-glow hover:bg-brand-500"
                >
                  Mở khu hỏi đáp
                </Link>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-white">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-sm font-bold text-portal-ink ring-1 ring-portal-line">
              {currentUser.email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-portal-ink">{currentUser.full_name || roleLabels[role]}</p>
              <p className="truncate text-caption text-portal-muted">{currentUser.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className={`${isTeacher ? "teacher-shell-with-sidebar" : "shell-with-sidebar"} min-w-0 flex-1`}>
        <header className="sticky top-0 z-20 border-b border-portal-line bg-portal-bg/95 backdrop-blur">
          <div className={`flex h-[72px] items-center gap-4 px-4 sm:px-6 ${isTeacher ? "lg:px-7" : "lg:px-8"}`}>
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl text-portal-muted hover:bg-white lg:hidden"
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link href={dashboardForRole(currentUser) || "/login"} className="lg:hidden">
              <BrandMark compact />
            </Link>

            <div className="min-w-0 flex-1 overflow-x-auto">
              {teacherClassContext ? (
                <nav className="flex min-w-max items-center gap-1" aria-label={`Điều hướng lớp ${teacherClassContext.name}`}>
                  <div
                    className="mr-2 inline-flex min-h-10 max-w-[280px] items-center gap-2 rounded-xl px-3 text-sm font-bold text-portal-ink"
                    title={teacherClassContext.name}
                  >
                    <LibraryBig className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{teacherClassContext.name}</span>
                  </div>
                  <TeacherClassTopLink
                    href={`/teacher/classes/${teacherClassContext.id}`}
                    label="Tổng quan"
                    active={pathname === `/teacher/classes/${teacherClassContext.id}`}
                  />
                  <TeacherClassTopLink
                    href={`/teacher/classes/${teacherClassContext.id}/students`}
                    label="Học viên"
                    active={pathname.includes("/students") || pathname.startsWith("/teacher/students/")}
                  />
                  <TeacherClassTopLink
                    href={`/teacher/classes/${teacherClassContext.id}/attendance`}
                    label="Điểm danh"
                    active={pathname.includes("/attendance")}
                  />
                  <TeacherClassTopLink
                    href={`/teacher/classes/${teacherClassContext.id}/assessments`}
                    label="Đánh giá"
                    active={pathname.includes("/assessments")}
                  />
                </nav>
              ) : null}
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div ref={notificationRef} className="relative">
                <button
                  type="button"
                  onClick={toggleNotifications}
                  className="relative grid h-11 w-11 place-items-center rounded-xl border border-portal-line bg-white text-portal-ink hover:bg-portal-mint"
                  aria-label={unreadNotificationCount > 0 ? `Thông báo, ${unreadNotificationCount} thông báo mới` : "Thông báo"}
                  aria-haspopup="dialog"
                  aria-expanded={notificationOpen}
                >
                  <Bell key={unreadNotificationCount} className={`h-5 w-5 ${unreadNotificationCount > 0 ? "notification-bell-ringing" : ""}`} aria-hidden="true" />
                  {unreadNotificationCount > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-portal-green px-1 text-[11px] font-bold leading-none text-white">
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </span>
                  ) : null}
                </button>

                {notificationOpen ? (
                  <section
                    role="dialog"
                    aria-label="Danh sách thông báo"
                    className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-[18px] border border-portal-line bg-white shadow-panel"
                  >
                    <div className="flex items-center justify-between border-b border-portal-line px-5 py-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Thông báo</p>
                        <h2 className="mt-1 text-lg font-bold text-ink">Cập nhật từ trung tâm</h2>
                      </div>
                      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand">{notifications.length}</span>
                    </div>

                    <div className="max-h-[min(520px,calc(100vh-130px))] overflow-y-auto p-2">
                      {notifications.length === 0 ? (
                        <p className="rounded-[14px] bg-muted px-4 py-6 text-center text-sm text-ink-muted">Chưa có thông báo mới.</p>
                      ) : (
                        notifications.map((notification) => {
                          const isNew = newNotificationIds.has(notification.id);
                          return (
                            <button
                              key={notification.id}
                              type="button"
                              onClick={() => setPreviewedNotification((current) => current?.id === notification.id ? null : notification)}
                              aria-expanded={previewedNotification?.id === notification.id}
                              className={`w-full rounded-[14px] border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                previewedNotification?.id === notification.id
                                  ? "border-brand bg-brand-50"
                                  : isNew
                                    ? "border-[#ead99b] bg-[#fff9e8]"
                                    : "border-transparent bg-white hover:bg-brand-50/70"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${isNew ? "bg-[#d39a16]" : "bg-[#d7dfd8]"}`} aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold leading-5 text-ink">{shortNotificationTitle(notification)}</p>
                                  <p className="mt-1 text-xs font-semibold text-ink-faint">{formatNotificationDate(notification.created_at)}</p>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </section>
                ) : null}

                {notificationOpen && previewedNotification ? (
                  <aside className="fixed inset-x-4 top-24 z-[60] max-h-[calc(100vh-7rem)] w-auto overflow-hidden rounded-[18px] border border-portal-line bg-white shadow-panel lg:absolute lg:inset-x-auto lg:right-[calc(420px+1rem)] lg:top-[calc(100%+0.75rem)] lg:w-[420px]">
                    <div className="flex items-start gap-4 border-b border-portal-line bg-brand-50/60 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Chi tiết thông báo</p>
                        <h3 className="mt-2 text-lg font-bold leading-6 text-ink">{shortNotificationTitle(previewedNotification)}</h3>
                        <p className="mt-1 text-xs font-semibold text-ink-faint">{formatNotificationDate(previewedNotification.created_at)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewedNotification(null)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-white"
                        aria-label="Đóng chi tiết thông báo"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="max-h-[min(430px,calc(100vh-150px))] overflow-y-auto px-5 py-4">
                      <p className="whitespace-pre-line text-sm leading-7 text-ink-muted">{previewedNotification.content}</p>
                    </div>
                  </aside>
                ) : null}
              </div>
              <span className="hidden rounded-full bg-white px-4 py-2 text-caption font-semibold text-portal-ink ring-1 ring-portal-line sm:inline-flex">{roleLabels[role]}</span>
              <button onClick={signOut} className="portal-btn-ghost min-h-10 rounded-xl px-3 text-sm">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
        </header>

        <main id="main-content" className={`w-full px-4 py-8 sm:px-6 ${isTeacher ? "lg:px-7" : "lg:px-8"} ${mainClassName}`}>
          {hidePageHeader ? <h1 className="sr-only">{title}</h1> : (
            <div className="mb-8">
              <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.03em] text-portal-ink max-sm:text-[32px]">{title}</h1>
              {subtitle ? <p className="mt-3 max-w-3xl text-body-lg text-portal-muted">{subtitle}</p> : null}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortNotificationTitle(notification: ParentNotificationResponse) {
  const studentLabel = notification.title.match(/^\[[^\]]+\]/)?.[0] ?? "[Học viên]";
  const searchable = `${notification.title}\n${notification.content}`.toLocaleLowerCase("vi");
  if (searchable.includes("nghỉ học đột xuất") || searchable.includes("lịch học có thay đổi")) {
    return `${studentLabel} Thông báo nghỉ học đột xuất`;
  }
  if (searchable.includes("dặn dò") || searchable.includes("thông báo từ giáo viên")) {
    return `${studentLabel} Dặn dò quan trọng từ giáo viên`;
  }
  return notification.title;
}

function TeacherClassTopLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold transition-colors ${
        active ? "bg-portal-green text-white" : "text-portal-muted hover:bg-white hover:text-portal-ink"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}
