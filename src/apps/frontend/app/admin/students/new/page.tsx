"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminSession } from "@/components/admin/AdminSession";
import { ClassSummary, createStudent, getAdminClasses, getAdminUsers, StudentSummary, UserSummary } from "@/lib/api";

export default function NewStudentPage() {
  return (
    <AppShell role="admin" title="Tạo hồ sơ học viên" subtitle="Mỗi học viên phải được liên kết với phụ huynh khi tạo hồ sơ">
      <AdminSession>{(accessToken) => <StudentForm accessToken={accessToken} />}</AdminSession>
    </AppShell>
  );
}

function StudentForm({ accessToken }: { accessToken: string }) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [parents, setParents] = useState<UserSummary[]>([]);
  const [fullName, setFullName] = useState("");
  const [level, setLevel] = useState("A2");
  const [classId, setClassId] = useState("");
  const [parentUserId, setParentUserId] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("Password123!");
  const [created, setCreated] = useState<StudentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getAdminClasses(accessToken).then((classRecords) => {
      setClasses(classRecords);
      setClassId((currentClassId) => currentClassId || classRecords[0]?.id || "");
    });
    void getAdminUsers(accessToken).then((users) => {
      const parentUsers = users.filter((user) => user.role === "PARENT");
      setParents(parentUsers);
      setParentUserId((currentParentUserId) => currentParentUserId || parentUsers[0]?.id || "");
    });
  }, [accessToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setCreated(
        await createStudent(
          {
            full_name: fullName,
            level,
            class_id: classId || undefined,
            parent_user_id: parentUserId,
            student_email: studentEmail || undefined,
            student_password: studentEmail ? studentPassword : undefined,
          },
          accessToken,
        ),
      );
      setFullName("");
      setStudentEmail("");
      setStudentPassword("Password123!");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể tạo học viên");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
        <label className="text-sm font-semibold">
          Họ và tên
          <input
            className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </label>
        <label className="text-sm font-semibold">
          Trình độ tiếng Anh
          <input
            className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            required
          />
        </label>
        <label className="text-sm font-semibold">
          Lớp học
          <select
            className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
          >
            <option value="">Chưa xếp lớp</option>
            {classes.map((classRecord) => (
              <option key={classRecord.id} value={classRecord.id}>
                {classRecord.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Phụ huynh liên kết
          <select
            className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
            value={parentUserId}
            onChange={(event) => setParentUserId(event.target.value)}
            required
          >
            <option value="">Chọn phụ huynh</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.full_name} - {parent.email}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Email tài khoản học viên
          <input
            className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
            type="email"
            value={studentEmail}
            onChange={(event) => setStudentEmail(event.target.value)}
            placeholder="hocvien@englishcenter.test"
          />
        </label>
        <label className="text-sm font-semibold">
          Mật khẩu học viên
          <input
            className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
            type="text"
            value={studentPassword}
            onChange={(event) => setStudentPassword(event.target.value)}
            minLength={8}
            disabled={!studentEmail}
          />
        </label>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-brand px-4 font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-60" disabled={busy}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {busy ? "Đang tạo..." : "Tạo học viên"}
        </button>
        {error ? <p className="rounded border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
      </form>
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
        <h2 className="text-lg font-bold">Học viên vừa tạo</h2>
        {created ? (
          <div className="mt-3 space-y-2 text-sm">
            <p><span className="font-semibold">Họ tên:</span> {created.full_name}</p>
            <p><span className="font-semibold">Trình độ:</span> {created.level}</p>
            <p><span className="font-semibold">ID học viên:</span> {created.id}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink/60">Thông tin học viên mới sẽ hiển thị tại đây.</p>
        )}
      </section>
    </div>
  );
}
