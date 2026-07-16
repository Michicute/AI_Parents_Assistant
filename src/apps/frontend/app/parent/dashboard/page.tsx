"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ParentDashboardCards } from "@/components/DashboardCards";
import { ZaloQrSection } from "@/components/ZaloQrSection";
import { getMyChildren, getStudentDashboard, StudentDashboardResponse, StudentSummary } from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";

export default function ParentDashboardPage() {
  const accessToken = getAccessToken();
  const [children, setChildren] = useState<StudentSummary[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [dashboard, setDashboard] = useState<StudentDashboardResponse | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [studentMenuOpen, setStudentMenuOpen] = useState(false);
  const studentMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!studentMenuRef.current) return;
      if (!studentMenuRef.current.contains(event.target as Node)) {
        setStudentMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setStudentMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadChildren() {
      setChildrenLoading(true);
      setStatus("");
      const token = getAccessToken();
      if (!token) {
        setChildrenLoading(false);
        return;
      }
      try {
        const childData = await getMyChildren(token);
        if (cancelled) return;
        setChildren(childData);
        setDashboard(null);
        setSelectedStudentId((current) => {
          if (current && childData.some((student) => student.id === current)) return current;
          return childData[0]?.id || "";
        });
      } catch (error) {
        if (cancelled) return;
        setChildren([]);
        setSelectedStudentId("");
        setDashboard(null);
        setStatus(error instanceof Error ? error.message : "Không thể tải danh sách học viên");
      } finally {
        if (!cancelled) setChildrenLoading(false);
      }
    }

    void loadChildren();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      const token = getAccessToken();
      if (!token || !selectedStudentId) {
        setDashboard(null);
        setDashboardLoading(false);
        return;
      }
      setDashboardLoading(true);
      setDashboard(null);
      setStatus("");
      try {
        const data = await getStudentDashboard(selectedStudentId, token);
        if (!cancelled) setDashboard(data);
      } catch (error) {
        if (cancelled) return;
        setDashboard(null);
        setStatus(error instanceof Error ? error.message : "Không thể tải tổng quan học viên");
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [selectedStudentId]);

  const selectedStudent = children.find((student) => student.id === selectedStudentId);

  return (
    <AppShell
      role="parent"
      title="Tổng quan học tập"
      sidebarWidget={selectedStudentId ? <ZaloQrSection studentId={selectedStudentId} accessToken={accessToken} compact /> : undefined}
    >
      <section className="mb-6 border-b border-[#d9e2d3] pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">Trang dành cho phụ huynh</p>
            <h2 className="mt-3 text-heading-2 text-ink">Theo dõi hành trình học tập của con.</h2>
          </div>

          <div className="w-full max-w-[380px]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">Học viên liên kết</p>
            {children.length > 0 ? (
              <div ref={studentMenuRef} className="relative mt-2 w-full">
                <button
                  type="button"
                  className="portal-input flex w-full items-center justify-between text-left text-base font-semibold"
                  aria-haspopup="listbox"
                  aria-expanded={studentMenuOpen}
                  onClick={() => setStudentMenuOpen((current) => !current)}
                >
                  <span className="truncate">{selectedStudent ? `${selectedStudent.full_name} - ${selectedStudent.level}` : "Chọn học viên"}</span>
                  <ArrowRight className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${studentMenuOpen ? "rotate-90" : ""}`} aria-hidden="true" />
                </button>

                {studentMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-full overflow-hidden rounded-[14px] border border-[#d9e2d3] bg-white p-2 shadow-panel">
                    <div role="listbox" aria-label="Chọn học viên" className="space-y-1">
                      {children.map((student) => {
                        const selected = student.id === selectedStudentId;

                        return (
                          <button
                            key={student.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-left text-sm transition-colors ${
                              selected ? "bg-brand text-white" : "text-ink hover:bg-brand-50"
                            }`}
                            onClick={() => {
                              setSelectedStudentId(student.id);
                              setStudentMenuOpen(false);
                            }}
                          >
                            <span>
                              <span className="block font-semibold">{student.full_name}</span>
                              <span className={`block text-xs ${selected ? "text-white/75" : "text-ink-muted"}`}>{student.level}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
      {status ? <p className="mb-4 rounded-xl border border-coral/30 bg-coral-light p-4 text-body font-semibold text-coral-dark">{status}</p> : null}
      {childrenLoading ? (
        <section className="space-y-4 animate-pulse-soft">
          <div className="skeleton h-40 rounded-[2rem]" />
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="skeleton h-[420px] rounded-[2rem]" />
            <div className="skeleton h-[420px] rounded-[2rem]" />
          </div>
        </section>
      ) : children.length === 0 ? (
        <section className="portal-section text-center">
          <h3 className="text-heading-3 text-ink">Chưa có học viên được liên kết</h3>
          <p className="mt-2 text-body text-ink-muted">Vui lòng liên hệ trung tâm để liên kết tài khoản phụ huynh với học viên.</p>
        </section>
      ) : dashboardLoading ? (
        <section className="space-y-4 animate-pulse-soft">
          <div className="skeleton h-[320px] rounded-[2rem]" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="skeleton h-36 rounded-[2rem]" />
            <div className="skeleton h-36 rounded-[2rem]" />
            <div className="skeleton h-36 rounded-[2rem]" />
            <div className="skeleton h-36 rounded-[2rem]" />
          </div>
        </section>
      ) : dashboard ? (
        <ParentDashboardCards dashboard={dashboard} />
      ) : (
        <section className="portal-section text-center text-body text-ink-muted">Chưa có dữ liệu tổng quan cho học viên này.</section>
      )}
    </AppShell>
  );
}
