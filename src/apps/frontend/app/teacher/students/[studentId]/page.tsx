"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StudentGradeTables } from "@/components/StudentGradeTables";
import { ClassSummary, getStudent, getStudentAssessmentSummary, getStudentScores, getTeacherClasses, getClassStudents, ScoreResponse, StudentAssessmentSummaryResponse, StudentSummary } from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";
import { summarizeSkillScores } from "@/lib/score-utils";

export default function TeacherStudentDetailPage() {
  return (
    <Suspense fallback={<TeacherStudentDetailFallback />}>
      <TeacherStudentDetailContent />
    </Suspense>
  );
}

function TeacherStudentDetailFallback() {
  return (
    <AppShell role="teacher" title="Thông tin học viên" subtitle="Đang tải thông tin học viên">
      <div className="portal-section"><p className="text-sm text-ink-muted">Đang tải thông tin học viên...</p></div>
    </AppShell>
  );
}

function TeacherStudentDetailContent() {
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();
  const studentId = params.studentId;
  const classId = searchParams.get("classId") || "";
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [classRecord, setClassRecord] = useState<ClassSummary | null>(null);
  const [scores, setScores] = useState<ScoreResponse[]>([]);
  const [assessmentSummary, setAssessmentSummary] = useState<StudentAssessmentSummaryResponse | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = getAccessToken();
      if (!token) return;
      setLoading(true);
      try {
        const [studentData, scoreData, summaryData, teacherClasses] = await Promise.all([
          getStudent(studentId, token),
          getStudentScores(studentId, token).catch(() => []),
          getStudentAssessmentSummary(studentId, token).catch(() => null),
          getTeacherClasses(token).catch(() => []),
        ]);
        const scopedClass = classId ? teacherClasses.find((item) => item.id === classId) ?? null : null;

        if (classId && !scopedClass) {
          throw new Error("Bạn không có quyền truy cập lớp học này.");
        }

        if (scopedClass) {
          const classStudents = await getClassStudents(scopedClass.id, token);
          if (!classStudents.some((item) => item.id === studentId)) {
            throw new Error("Học viên này không thuộc lớp đang chọn.");
          }
        }

        setStudent(studentData);
        setClassRecord(scopedClass);
        setScores(classId ? scoreData.filter((item) => item.class_id === classId) : scoreData);
        setAssessmentSummary(
          classId && summaryData
            ? {
                ...summaryData,
                assessments: summaryData.assessments.filter((assessment) => assessment.class_id === classId),
              }
            : summaryData,
        );
      } catch (error) {
        setStudent(null);
        setScores([]);
        setAssessmentSummary(null);
        setClassRecord(null);
        setStatus(error instanceof Error ? error.message : "Không thể tải thông tin học viên");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [studentId, classId]);

  const skillSummaries = useMemo(() => summarizeSkillScores(scores), [scores]);
  const averageScore = useMemo(() => {
    if (!skillSummaries.length) return null;
    return Math.round(skillSummaries.reduce((sum, score) => sum + score.average, 0) / skillSummaries.length);
  }, [skillSummaries]);

  return (
    <AppShell
      role="teacher"
      title={student ? `Thông tin ${student.full_name}` : "Thông tin học viên"}
      subtitle={student ? `${classRecord ? `${classRecord.name} · ` : ""}Trình độ hiện tại: ${student.level}` : "Dữ liệu được lấy theo phân quyền lớp học"}
      teacherClassId={classId || undefined}
    >
      {status ? <p className="mb-4 rounded-xl border border-coral-light bg-coral-light/50 p-3 text-sm font-semibold text-coral-dark">{status}</p> : null}
      {loading ? (
        <div className="portal-section"><p className="text-sm text-ink-muted">Đang tải thông tin học viên...</p></div>
      ) : (
        <div className="space-y-5">
          <div>
            <Link href={classId ? `/teacher/classes/${classId}/students` : "/teacher/classes"} className="portal-btn-secondary min-h-10 px-4 text-sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Quay lại danh sách lớp
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Trình độ" value={student?.level || "-"} />
            <Summary label="Điểm trung bình" value={averageScore === null ? "Chưa có" : `${averageScore}%`} />
            <Summary label="Bài kiểm tra" value={`${assessmentSummary?.assessments.length || 0}`} />
          </div>

          <StudentGradeTables
            studentName={student?.full_name}
            scores={scores}
            assessmentSummary={assessmentSummary}
            highlightLowSkills
          />
        </div>
      )}
    </AppShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <section className="portal-card">
      <p className="text-caption font-bold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </section>
  );
}
