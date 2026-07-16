"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClassSummary, getClassStudents, getStudentAssessmentSummary, getStudentScores, getTeacherClasses, ScoreResponse, StudentAssessmentSummaryResponse, StudentSummary } from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";
import { StudentGradeTables } from "@/components/StudentGradeTables";

type StudentOption = StudentSummary & {
  classId: string;
  className: string;
};

export function GradeManager({ initialClassId }: { initialClassId?: string } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedClassId = initialClassId || searchParams.get("classId") || "";
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [scores, setScores] = useState<ScoreResponse[]>([]);
  const [assessmentSummary, setAssessmentSummary] = useState<StudentAssessmentSummaryResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadClasses() {
      const token = getAccessToken();
      if (!token) return;
      setLoading(true);
      try {
        const classData = await getTeacherClasses(token);
        const studentGroups = await Promise.all(
          classData.map(async (classRecord) => {
            const classStudents = await getClassStudents(classRecord.id, token);
            return classStudents.map((student) => ({
              ...student,
              classId: classRecord.id,
              className: classRecord.name,
            }));
          }),
        );
        const allStudents = studentGroups.flat();
        setClasses(classData);
        setStudents(allStudents);
        const nextClassId =
          requestedClassId && classData.some((classRecord) => classRecord.id === requestedClassId)
            ? requestedClassId
            : classData[0]?.id || "";
        setSelectedClassId((current) => (current && classData.some((classRecord) => classRecord.id === current) ? current : nextClassId));
        setSelectedStudentId((current) => {
          if (current && allStudents.some((student) => student.id === current && student.classId === nextClassId)) return current;
          return allStudents.find((student) => student.classId === nextClassId)?.id || "";
        });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Không thể tải dữ liệu điểm");
      } finally {
        setLoading(false);
      }
    }
    void loadClasses();
  }, [requestedClassId]);

  const visibleStudents = useMemo(
    () => students.filter((student) => !selectedClassId || student.classId === selectedClassId),
    [selectedClassId, students],
  );

  useEffect(() => {
    if (!visibleStudents.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(visibleStudents[0]?.id || "");
    }
  }, [selectedStudentId, visibleStudents]);

  useEffect(() => {
    async function loadScores() {
      const token = getAccessToken();
      if (!token || !selectedStudentId) {
        setScores([]);
        return;
      }
      try {
        const [scoreData, summaryData] = await Promise.all([
          getStudentScores(selectedStudentId, token),
          getStudentAssessmentSummary(selectedStudentId, token).catch(() => null),
        ]);
        setScores(selectedClassId ? scoreData.filter((score) => score.class_id === selectedClassId) : scoreData);
        setAssessmentSummary(
          selectedClassId && summaryData
            ? {
                ...summaryData,
                assessments: summaryData.assessments.filter((assessment) => assessment.class_id === selectedClassId),
              }
            : summaryData,
        );
      } catch (error) {
        setScores([]);
        setAssessmentSummary(null);
        setMessage(error instanceof Error ? error.message : "Không thể tải bảng điểm");
      }
    }
    void loadScores();
  }, [selectedClassId, selectedStudentId]);

  const selectedStudent = students.find((student) => student.id === selectedStudentId);

  if (loading) {
    return <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">Đang tải bảng điểm...</section>;
  }

  return (
    <div className="space-y-4">
      {message ? <p className="rounded border border-ink/10 bg-paper p-3 text-sm font-semibold">{message}</p> : null}
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-semibold">
            Lớp
            <select
              className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
              value={selectedClassId}
              onChange={(event) => {
                const nextClassId = event.target.value;
                setSelectedClassId(nextClassId);
                if (initialClassId) router.push(`/teacher/classes/${nextClassId}/grades`);
              }}
            >
              {classes.map((classRecord) => (
                <option key={classRecord.id} value={classRecord.id}>
                  {classRecord.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Học viên
            <select
              className="mt-1 min-h-11 w-full rounded border border-ink/15 px-3 font-normal outline-none focus:border-leaf"
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              {visibleStudents.map((student) => (
                <option key={`${student.classId}-${student.id}`} value={student.id}>
                  {student.full_name} - {student.level}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <StudentGradeTables
        studentName={selectedStudent?.full_name}
        scores={scores}
        assessmentSummary={assessmentSummary}
      />
    </div>
  );
}
