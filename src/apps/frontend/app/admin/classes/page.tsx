"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Save, Trash2, Users, BookOpen } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminSession } from "@/components/admin/AdminSession";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  assignTeacherClass,
  ClassSummary,
  CourseSummary,
  createAdminClass,
  deleteAdminClass,
  getAdminClasses,
  getAdminCourses,
  getAdminUsers,
  getClassStudents,
  StudentSummary,
  UserSummary,
} from "@/lib/api";

const CLASS_SCHEDULE_OPTIONS = [
  { value: "2-4-6", label: "2-4-6" },
  { value: "3-5-7", label: "3-5-7" },
  { value: "thứ bảy-chủ nhật", label: "Thứ bảy - Chủ nhật" },
];

function getPeriod(startTime: string) {
  const hour = Number(startTime.split(":")[0]);
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

export default function AdminClassesPage() {
  return (
    <AppShell role="admin" title="Lớp học" subtitle="Phân công giáo viên vào lớp tại trung tâm Anh ngữ">
      <AdminSession>{(accessToken) => <ClassesManager accessToken={accessToken} />}</AdminSession>
    </AppShell>
  );
}

function ClassesManager({ accessToken }: { accessToken: string }) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [classStudents, setClassStudents] = useState<StudentSummary[]>([]);
  const [teachers, setTeachers] = useState<UserSummary[]>([]);
  const [teacherUserId, setTeacherUserId] = useState("");
  const [classId, setClassId] = useState("");
  const [selectedClassForStudents, setSelectedClassForStudents] = useState("");
  const [classForm, setClassForm] = useState({
    course_id: "",
    location: "",
    starts_on: "",
    ends_on: "",
    schedule_note: CLASS_SCHEDULE_OPTIONS[0].value,
    start_time: "13:00",
    end_time: "15:00",
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getAdminClasses(accessToken).then((items) => {
      setClasses(items);
      setClassId(items[0]?.id ?? "");
      setSelectedClassForStudents(items[0]?.id ?? "");
    });
    void getAdminCourses(accessToken)
      .then((items) => {
        setCourses(items);
        setClassForm((current) => ({ ...current, course_id: current.course_id || items[0]?.id || "" }));
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Không thể tải danh sách khóa học");
      });
    void getAdminUsers(accessToken).then((users) => {
      const teacherUsers = users.filter((user) => user.role === "TEACHER");
      setTeachers(teacherUsers);
      setTeacherUserId(teacherUsers[0]?.id ?? "");
    });
  }, [accessToken]);

  useEffect(() => {
    if (!selectedClassForStudents) {
      setClassStudents([]);
      return;
    }
    void getClassStudents(selectedClassForStudents, accessToken)
      .then(setClassStudents)
      .catch((error) => {
        setClassStudents([]);
        setStatus(error instanceof Error ? error.message : "Không thể tải học viên trong lớp");
      });
  }, [accessToken, selectedClassForStudents]);

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      await assignTeacherClass({ teacher_user_id: teacherUserId, class_id: classId }, accessToken);
      setClasses(await getAdminClasses(accessToken));
      setStatus("Đã phân công giáo viên vào lớp.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể phân công giáo viên");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const created = await createAdminClass(
        {
          course_id: classForm.course_id,
          location: classForm.location || undefined,
          starts_on: classForm.starts_on || undefined,
          ends_on: classForm.ends_on || undefined,
          schedule_note: classForm.schedule_note,
          start_time: classForm.start_time,
          end_time: classForm.end_time,
        },
        accessToken,
      );
      setClasses((current) => [created, ...current]);
      setClassId(created.id);
      setSelectedClassForStudents(created.id);
      setClassForm((current) => ({
        ...current,
        location: "",
        starts_on: "",
        ends_on: "",
        schedule_note: CLASS_SCHEDULE_OPTIONS[0].value,
        start_time: "13:00",
        end_time: "15:00",
      }));
      setStatus("Đã tạo lớp học mới.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể tạo lớp học");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteClass(targetClass: ClassSummary) {
    const confirmed = window.confirm(`Xoá lớp "${targetClass.name}"? Học viên sẽ không còn được ghi danh trong lớp này.`);
    if (!confirmed) return;
    setBusy(true);
    setStatus("");
    try {
      await deleteAdminClass(targetClass.id, accessToken);
      setClasses((current) => {
        const nextClasses = current.filter((item) => item.id !== targetClass.id);
        const nextSelectedClassId = nextClasses[0]?.id ?? "";
        if (classId === targetClass.id) {
          setClassId(nextSelectedClassId);
        }
        if (selectedClassForStudents === targetClass.id) {
          setSelectedClassForStudents(nextSelectedClassId);
        }
        return nextClasses;
      });
      setClassStudents([]);
      setStatus("Đã xoá lớp học.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể xoá lớp học");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[440px_1fr]">
      <div className="space-y-5">
        <form onSubmit={handleCreateClass} className="portal-section grid gap-4">
          <SectionHeader icon={Plus} label="Tạo mới" title="Tạo lớp học" />
          <label className="text-sm font-semibold text-ink">
            Tên khóa học
            <select
              className="portal-input mt-1.5 w-full"
              value={classForm.course_id}
              onChange={(event) => setClassForm((current) => ({ ...current, course_id: event.target.value }))}
              required
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.level} - {course.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm">
            <p className="font-semibold text-ink">Tên lớp (tự động)</p>
            <p className="mt-1 text-ink-muted">
              {(() => {
                const course = courses.find((item) => item.id === classForm.course_id);
                return course
                  ? `${`${course.level} ${course.name}`.replaceAll("-", " ")} ${classForm.schedule_note} ${getPeriod(classForm.start_time)}`
                  : "Chọn khóa học để xem tên lớp";
              })()}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-ink">
              Giờ bắt đầu
              <input
                className="portal-input mt-1.5 w-full"
                type="time"
                value={classForm.start_time}
                onChange={(event) => setClassForm((current) => ({ ...current, start_time: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              Giờ kết thúc
              <input
                className="portal-input mt-1.5 w-full"
                type="time"
                value={classForm.end_time}
                min={classForm.start_time}
                onChange={(event) => setClassForm((current) => ({ ...current, end_time: event.target.value }))}
                required
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-ink">
              Phòng học
              <input
                className="portal-input mt-1.5 w-full"
                value={classForm.location}
                onChange={(event) => setClassForm((current) => ({ ...current, location: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              Lịch học
              <select
                className="portal-input mt-1.5 w-full"
                value={classForm.schedule_note}
                onChange={(event) => setClassForm((current) => ({ ...current, schedule_note: event.target.value }))}
                required
              >
                {CLASS_SCHEDULE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-ink">
              Ngày bắt đầu
              <input
                className="portal-input mt-1.5 w-full"
                type="date"
                value={classForm.starts_on}
                onChange={(event) => setClassForm((current) => ({ ...current, starts_on: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              Ngày kết thúc
              <input
                className="portal-input mt-1.5 w-full"
                type="date"
                value={classForm.ends_on}
                onChange={(event) => setClassForm((current) => ({ ...current, ends_on: event.target.value }))}
              />
            </label>
          </div>
          <button className="portal-btn-primary min-h-12" disabled={busy || !classForm.course_id}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {busy ? "Đang lưu..." : "Tạo lớp học"}
          </button>
        </form>

        <form onSubmit={handleAssign} className="portal-section grid gap-4">
          <SectionHeader icon={Save} label="Phân công" title="Phân công giáo viên" />
          <label className="text-sm font-semibold text-ink">
            Giáo viên
            <select
              className="portal-input mt-1.5 w-full"
              value={teacherUserId}
              onChange={(event) => setTeacherUserId(event.target.value)}
              required
            >
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name} - {teacher.email}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            Lớp học
            <select
              className="portal-input mt-1.5 w-full"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              required
            >
              {classes.map((classRecord) => (
                <option key={classRecord.id} value={classRecord.id}>
                  {classRecord.name}
                </option>
              ))}
            </select>
          </label>
          <button className="portal-btn-primary min-h-12" disabled={busy}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {busy ? "Đang phân công..." : "Phân công giáo viên"}
          </button>
          {status ? <p className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm font-medium text-ink-muted">{status}</p> : null}
        </form>
      </div>

      <div className="space-y-5">
        <section className="portal-section">
          <SectionHeader icon={BookOpen} label="Lớp hiện tại" title="Danh sách lớp" />
          <div className="mt-4 grid gap-3">
            {classes.length === 0 ? (
              <EmptyState icon={BookOpen} title="Chưa có lớp học" description="Tạo lớp mới ở bên trái" />
            ) : (
              classes.map((classRecord) => {
                const active = selectedClassForStudents === classRecord.id;
                return (
                  <div
                    key={classRecord.id}
                    className={`rounded-xl border p-4 text-sm transition-all ${
                      active ? "border-brand bg-brand-50 shadow-sm" : "border-brand-100 bg-white hover:border-brand-200 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => setSelectedClassForStudents(classRecord.id)} className="min-w-0 flex-1 text-left">
                        <p className="font-bold text-ink">{classRecord.name}</p>
                        <p className="mt-1 text-ink-muted">{classRecord.schedule_note ?? "Chưa có lịch học"} · {classRecord.location ?? "Chưa có phòng"}</p>
                        {active ? (
                          <p className="mt-1 text-ink-muted">
                            Giáo viên: {classRecord.teacher_names.length > 0 ? classRecord.teacher_names.join(", ") : "Chưa phân công"}
                          </p>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteClass(classRecord)}
                        disabled={busy}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-coral hover:bg-coral-light disabled:opacity-50"
                        aria-label={`Xoá lớp ${classRecord.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="portal-section">
          <SectionHeader icon={Users} label="Học viên" title="Học viên" />
          <p className="mt-2 text-sm text-ink-muted">
            {classes.find((item) => item.id === selectedClassForStudents)?.name ?? "Chưa chọn lớp"}
          </p>
          {classStudents.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={Users} title="Chưa có học viên" description="Lớp này chưa có học viên nào được ghi danh" />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {classStudents.map((student) => (
                <div key={student.id} className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-sm">
                  <p className="font-bold text-ink">{student.full_name}</p>
                  <p className="mt-1 text-ink-muted">Trình độ: {student.level}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
