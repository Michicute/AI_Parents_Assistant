"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpenCheck, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getMyChildren, StudentSummary } from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";

export default function ParentStudentsPage() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function loadStudents() {
      const token = getAccessToken();
      if (!token) return;
      try {
        setStudents(await getMyChildren(token));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Không thể tải danh sách học viên");
      }
    }

    void loadStudents();
  }, []);

  return (
    <AppShell role="parent" title="Học viên" subtitle="Danh sách học viên được liên kết với tài khoản phụ huynh">
      <div className="space-y-6">
        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="portal-section p-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">Student Directory</p>
            <h2 className="mt-3 text-heading-2 text-ink">Mỗi học viên liên kết là một hồ sơ học tập riêng để phụ huynh theo dõi tiến độ.</h2>
            <p className="mt-4 max-w-3xl text-body-lg text-ink-muted">
              Từ đây bạn có thể mở hồ sơ chi tiết, xem nhận xét giáo viên, kiểm tra chuyên cần và đặt câu hỏi cho Pippo theo từng học viên được liên kết.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-2 text-caption font-semibold text-brand">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Chỉ hiển thị dữ liệu đã được phân quyền
              </span>
            </div>
          </article>

          <div className="grid gap-5 sm:grid-cols-2">
            <SummaryTile icon={<Users className="h-6 w-6" />} label="Học viên hiện có" value={String(students.length)} detail="Tài khoản phụ huynh đang được liên kết" />
            <SummaryTile icon={<BookOpenCheck className="h-6 w-6" />} label="Mục tiêu sử dụng" value="Theo dõi" detail="Tiến độ, đánh giá và hỗ trợ tại nhà" />
          </div>
        </section>

        {status ? <p className="rounded-[16px] border border-coral/30 bg-coral-light p-4 text-body font-semibold text-coral-dark">{status}</p> : null}

        <section className="portal-section p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">Linked Students</p>
              <h3 className="mt-3 text-heading-2 text-ink">Học viên được phép xem</h3>
            </div>
          </div>

          {students.length === 0 ? (
            <div className="mt-6 rounded-[16px] bg-muted p-6 text-center">
              <h4 className="text-lg font-semibold text-ink">Chưa có học viên được liên kết</h4>
              <p className="mt-2 text-body text-ink-muted">Vui lòng liên hệ trung tâm để liên kết tài khoản phụ huynh với học viên phù hợp.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {students.map((student, index) => (
                <article key={student.id} className="portal-card flex h-full flex-col p-5 hover:shadow-card-hover">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">Học viên {index + 1}</p>
                      <h4 className="mt-3 text-heading-3 text-ink">{student.full_name}</h4>
                      <p className="mt-2 inline-flex rounded-full bg-brand-50 px-3 py-1 text-caption font-semibold text-brand">Trình độ {student.level}</p>
                    </div>
                    <div className="grid h-12 w-12 place-items-center rounded-[16px] bg-brand-50 text-brand">
                      <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
                    </div>
                  </div>

                  <div className="mt-5 space-y-2 text-body text-ink-muted">
                    <p>Xem hồ sơ để theo dõi tiến độ học tập, đánh giá và mức độ chuyên cần.</p>
                    <p>Dùng Pippo để nhận gợi ý hỗ trợ sát hơn theo từng học viên.</p>
                  </div>

                  <div className="mt-auto flex gap-3 pt-6">
                    <Link href={`/parent/students/${student.id}`} className="portal-btn-primary min-h-[48px] flex-1 text-sm">
                      Xem hồ sơ
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <Link href="/parent/chat" className="portal-btn-secondary min-h-[48px] px-4 text-sm">
                      Hỏi Pippo
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function SummaryTile({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="portal-section flex items-center gap-5 p-6">
      <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[18px] bg-brand-50 text-brand">{icon}</div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">{label}</p>
        <p className="mt-2 text-[2rem] font-extrabold leading-none tracking-[-0.03em] text-ink">{value}</p>
        <p className="mt-2 text-body text-ink-soft">{detail}</p>
      </div>
    </article>
  );
}
