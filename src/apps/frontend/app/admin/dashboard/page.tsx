"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bot, Building2, Database, FileText, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminSession } from "@/components/admin/AdminSession";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAdminClasses, getAdminStudents, getAdminUsers, ClassSummary, StudentSummary, UserSummary } from "@/lib/api";

export default function AdminDashboardPage() {
  return (
    <AppShell role="admin" title="Bảng quản trị" subtitle="Tổng quan vận hành hệ thống">
      <AdminSession>{(accessToken) => <AdminOverview accessToken={accessToken} />}</AdminSession>
    </AppShell>
  );
}

function AdminOverview({ accessToken }: { accessToken: string }) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [userData, classData, studentData] = await Promise.all([
          getAdminUsers(accessToken),
          getAdminClasses(accessToken),
          getAdminStudents(accessToken),
        ]);
        setUsers(userData);
        setClasses(classData);
        setStudents(studentData);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Không thể tải tổng quan quản trị");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [accessToken]);

  const roleCounts = useMemo(
    () =>
      users.reduce<Record<string, number>>((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {}),
    [users],
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {status ? <p className="rounded-xl border border-coral-light bg-coral-light/50 p-4 text-sm font-semibold text-coral-dark">{status}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Người dùng"
          value={String(users.length)}
          detail={`${roleCounts.ADMIN || 0} admin · ${roleCounts.TEACHER || 0} GV · ${roleCounts.PARENT || 0} PH`}
        />
        <MetricCard icon={GraduationCap} label="Học viên" value={String(students.length)} detail="Đang được quản lý" tone="good" />
        <MetricCard icon={Building2} label="Lớp học" value={String(classes.length)} detail="Lớp đã tạo" tone="warm" />
        <MetricCard icon={Database} label="Hệ thống" value="Online" detail="Sẵn sàng sử dụng" />
      </div>

      <section className="portal-section">
        <SectionHeader icon={ShieldCheck} label="Operations" title="Lớp học gần đây" />
        {classes.length === 0 ? (
          <EmptyState icon={Building2} title="Chưa có lớp học" description="Tạo lớp học đầu tiên trong mục Lớp học" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {classes.slice(0, 6).map((classRecord) => (
              <article key={classRecord.id} className="portal-card group">
                <p className="text-heading-3 text-ink">{classRecord.name}</p>
                <p className="mt-2 text-body text-ink-muted">{classRecord.schedule_note || classRecord.location || "Chưa có lịch"}</p>
              </article>
            ))}
          </div>
        )}
        {classes.length > 0 && (
          <div className="mt-4 flex justify-end">
            <Link href="/admin/classes" className="portal-btn-secondary text-sm">
              Xem tất cả lớp
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </section>

      <section className="portal-section">
        <SectionHeader icon={Database} label="Admin tools" title="Chức năng quản trị" />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AdminToolCard href="/admin/users" icon={Users} title="Người dùng" description="Tạo/xóa tài khoản giáo viên, phụ huynh, học viên." />
          <AdminToolCard href="/admin/classes" icon={Building2} title="Lớp học" description="Tạo lớp, xem học viên, phân công giáo viên." />
          <AdminToolCard href="/admin/documents" icon={FileText} title="Tài liệu RAG" description="Thêm chính sách, FAQ, handbook và ingest vector." />
          <AdminToolCard href="/admin/zalo-bot" icon={Bot} title="Zalo Bot" description="Đăng nhập bot, kiểm tra trạng thái và nhật ký chat." />
        </div>
      </section>
    </div>
  );
}

function AdminToolCard({ href, icon: Icon, title, description }: { href: string; icon: typeof Users; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-4 font-black text-ink">{title}</p>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
    </Link>
  );
}
