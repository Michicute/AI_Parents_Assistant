"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminAccountForm } from "@/components/admin/AdminAccountForm";
import { AdminSession } from "@/components/admin/AdminSession";
import { AdminCreateTeacherResponse, createTeacher } from "@/lib/api";

export default function NewTeacherPage() {
  const [created, setCreated] = useState<AdminCreateTeacherResponse | null>(null);

  return (
    <AppShell role="admin" title="Tạo tài khoản giáo viên" subtitle="Tạo tài khoản local auth, người dùng nội bộ và hồ sơ giáo viên">
      <AdminSession>
        {(accessToken) => (
          <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <AdminAccountForm
              submitLabel="Tạo giáo viên"
              onSubmit={(payload) => createTeacher(payload, accessToken)}
              onCreated={setCreated}
            />
            <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
              <h2 className="text-lg font-bold">Giáo viên vừa tạo</h2>
              {created ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="font-semibold">Họ tên:</span> {created.user.full_name}</p>
                  <p><span className="font-semibold">Email:</span> {created.user.email}</p>
                  <p><span className="font-semibold">Vai trò:</span> {created.user.role}</p>
                  <p><span className="font-semibold">ID người dùng nội bộ:</span> {created.user.id}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink/60">Thông tin giáo viên mới sẽ hiển thị tại đây.</p>
              )}
            </section>
          </div>
        )}
      </AdminSession>
    </AppShell>
  );
}
