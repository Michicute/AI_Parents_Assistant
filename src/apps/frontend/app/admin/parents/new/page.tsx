"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminAccountForm } from "@/components/admin/AdminAccountForm";
import { AdminSession } from "@/components/admin/AdminSession";
import { AdminCreateParentResponse, createParent } from "@/lib/api";

export default function NewParentPage() {
  const [created, setCreated] = useState<AdminCreateParentResponse | null>(null);

  return (

    <AppShell role="admin" title="Tạo tài khoản phụ huynh" subtitle="Tạo tài khoản local auth, người dùng nội bộ và hồ sơ phụ huynh">
      <AdminSession>
        {(accessToken) => (
          <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <AdminAccountForm
              submitLabel="Tạo phụ huynh"
              onSubmit={(payload) => createParent(payload, accessToken)}
              onCreated={setCreated}
              showPreferredLanguage
            />
            <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
              <h2 className="text-lg font-bold">Phụ huynh vừa tạo</h2>
              {created ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="font-semibold">Họ tên:</span> {created.user.full_name}</p>
                  <p><span className="font-semibold">Email:</span> {created.user.email}</p>
                  <p><span className="font-semibold">Vai trò:</span> {created.user.role}</p>
                  <p><span className="font-semibold">Ngôn ngữ AI Insight:</span> {created.parent.preferred_language === "en" ? "English" : "Tiếng Việt"}</p>
                  <p><span className="font-semibold">ID người dùng nội bộ:</span> {created.user.id}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink/60">Thông tin phụ huynh mới sẽ hiển thị tại đây.</p>
              )}
            </section>
          </div>
        )}
      </AdminSession>
    </AppShell>
  );
}
