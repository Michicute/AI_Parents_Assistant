"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GraduationCap, Plus, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminSession } from "@/components/admin/AdminSession";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { deleteAdminStudent, deleteAdminUser, getAdminStudents, getAdminUsers, StudentSummary, UserSummary } from "@/lib/api";

const roleBadge: Record<string, string> = {
  ADMIN: "bg-brand-100 text-brand-dark",
  TEACHER: "bg-blue-100 text-blue-700",
  PARENT: "bg-amber-100 text-amber-700",
  STUDENT: "bg-emerald-100 text-emerald-700",
};

export default function AdminUsersPage() {
  return (
    <AppShell role="admin" title="Người dùng" subtitle="Tài khoản nội bộ và hồ sơ học viên">
      <AdminSession>{(accessToken) => <UsersTable accessToken={accessToken} />}</AdminSession>
    </AppShell>
  );
}

function UsersTable({ accessToken }: { accessToken: string }) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    void getAdminUsers(accessToken).then(setUsers);
    void getAdminStudents(accessToken).then(setStudents);
  }, [accessToken]);

  async function handleDeleteUser(user: UserSummary) {
    if (!window.confirm(`Xoá người dùng ${user.full_name || user.email}?`)) return;
    setBusyId(user.id);
    setStatus("");
    try {
      await deleteAdminUser(user.id, accessToken);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setStatus("Đã xoá người dùng.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể xoá người dùng");
    } finally {
      setBusyId("");
    }
  }

  async function handleDeleteStudent(student: StudentSummary) {
    if (!window.confirm(`Xoá học viên ${student.full_name}?`)) return;
    setBusyId(student.id);
    setStatus("");
    try {
      await deleteAdminStudent(student.id, accessToken);
      setStudents((current) => current.filter((item) => item.id !== student.id));
      setStatus("Đã xoá học viên.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể xoá học viên");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-brand px-4 text-sm font-black text-white shadow-glow hover:bg-brand-500" href="/admin/teachers/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Giáo viên
        </Link>
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-brand-200 bg-white px-4 text-sm font-black text-brand shadow-sm hover:bg-brand-50" href="/admin/parents/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Phụ huynh
        </Link>
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-brand-200 bg-white px-4 text-sm font-black text-brand shadow-sm hover:bg-brand-50" href="/admin/students/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Học viên
        </Link>
      </div>
      {status ? <p className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-sm font-semibold text-slate-600">{status}</p> : null}
      <section className="overflow-hidden rounded-[2rem] border border-brand-100 bg-white shadow-soft">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-brand-50/70 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Họ tên</th>
              <th className="px-4 py-3 font-bold">Email</th>
              <th className="px-4 py-3 font-bold">Vai trò</th>
              <th className="px-4 py-3 font-bold">Hoạt động</th>
              <th className="px-4 py-3 font-bold">ID nội bộ</th>
              <th className="px-4 py-3 font-bold">Xoá</th>

            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-brand-100">
                <td className="px-4 py-3 font-bold text-ink">{user.full_name}</td>
                <td className="px-4 py-3 text-slate-600">{user.email}</td>
                <td className="px-4 py-3 text-slate-600">{user.role}</td>
                <td className="px-4 py-3 text-slate-600">{user.is_active ? "Có" : "Không"}</td>
                <td className="px-4 py-3 text-slate-400">{user.id}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDeleteUser(user)}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-coral/30 bg-white px-3 font-bold text-coral hover:bg-coral/10 disabled:opacity-50"
                    disabled={busyId === user.id || user.role === "ADMIN"}
                    title={user.role === "ADMIN" ? "Không xoá admin tại đây" : "Xoá người dùng"}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Xoá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-brand-100 bg-white shadow-soft">
        <div className="border-b border-brand-100 bg-brand-50/70 px-4 py-3">
          <h2 className="font-black text-ink">Học viên</h2>
        </div>
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-brand-50/70 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Họ tên</th>
              <th className="px-4 py-3 font-bold">Trình độ</th>
              <th className="px-4 py-3 font-bold">ID học viên</th>
              <th className="px-4 py-3 font-bold">Xoá</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-t border-brand-100">
                <td className="px-4 py-3 font-bold text-ink">{student.full_name}</td>
                <td className="px-4 py-3 text-slate-600">{student.level}</td>
                <td className="px-4 py-3 text-slate-400">{student.id}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDeleteStudent(student)}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-coral/30 bg-white px-3 font-bold text-coral hover:bg-coral/10 disabled:opacity-50"
                    disabled={busyId === student.id}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Xoá
                  </button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
