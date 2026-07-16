"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { BarChart3, CheckCircle2, Clock3, ExternalLink, FileQuestion, ListChecks, LoaderCircle, Pencil, Plus, Printer, Save, Sparkles, Trash2, UploadCloud, Users, XCircle } from "lucide-react";
import {
  AssessmentImportDraftResponse,
  AssessmentImportQuestionDraft,
  AssessmentQuestionResponse,
  AssessmentResponse,
  AiInsightDraft,
  AiInsightResponse,
  approveStudentAiInsight,
  createAssessmentQuestion,
  createAssessmentQuestionImportDraft,
  createOcrDraft,
  deleteAllAssessmentQuestions,
  deleteAssessmentQuestion,
  getAssessment,
  getAssessmentQuestions,
  getClassStudents,
  getStudentAiInsights,
  getStudentAssessmentSummary,
  ScoreResponse,
  StudentAssessmentSummaryResponse,
  StudentSummary,
  submitStudentAssessment,
  updateAssessmentQuestion,
} from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";

const skills: ScoreResponse["skill"][] = ["reading", "listening", "speaking", "writing", "grammar", "vocabulary"];
const folderInputProps = { webkitdirectory: "", directory: "" } as Record<string, string>;

type ReviewDraft = {
  answer_text: string;
  has_answer: boolean;
  score_awarded: number;
  teacher_feedback: string;
};

type StudentSubmissionStatus = {
  submitted: boolean;
  graded: boolean;
  hasInsight: boolean;
};

type QuestionEditDraft = {
  question_text: string;
  question_type: AssessmentQuestionResponse["question_type"];
  choices: string;
  expected_answer: string;
  skill_tag: ScoreResponse["skill"];
  max_score: number;
  rubric: string;
};

type InsightContent = {
  summary?: string;
  new_strengths?: string[];
  new_weaknesses?: string[];
  improved_weaknesses?: string[];
  persistent_weaknesses?: string[];
  teacher_actions?: string[];
  parent_actions?: string[];
  [key: string]: unknown;
};

function filesFromList(fileList?: FileList | null) {
  return Array.from(fileList ?? []);
}

function selectedFilesLabel(files: File[], emptyLabel: string) {
  if (!files.length) return emptyLabel;
  if (files.length === 1) return files[0].webkitRelativePath || files[0].name;
  return `${files.length} file đã chọn`;
}

function questionAnchorId(index: number) {
  return `submission-question-${index + 1}`;
}

export function AssessmentManager({
  assessmentId,
  initialClassId,
  initialStudentId,
  rosterOnly = false,
  submissionOnly = false,
}: {
  assessmentId: string;
  initialClassId?: string;
  initialStudentId?: string;
  rosterOnly?: boolean;
  submissionOnly?: boolean;
}) {
  const workspaceView: "design" | "submissions" = rosterOnly || submissionOnly ? "submissions" : "design";
  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestionResponse[]>([]);
  const [questionImportDraft, setQuestionImportDraft] = useState<AssessmentImportDraftResponse | null>(null);
  const [questionImportFiles, setQuestionImportFiles] = useState<File[]>([]);
  const [scanningQuestionImport, setScanningQuestionImport] = useState(false);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId ?? "");
  const [summary, setSummary] = useState<StudentAssessmentSummaryResponse | null>(null);
  const [latestInsight, setLatestInsight] = useState<AiInsightResponse | null>(null);
  const [pendingInsightDraft, setPendingInsightDraft] = useState<AiInsightDraft | null>(null);
  const [editableInsightContent, setEditableInsightContent] = useState("");
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [ocrMessage, setOcrMessage] = useState("");
  const [paperAnswerFiles, setPaperAnswerFiles] = useState<File[]>([]);
  const [scanningPaperAnswer, setScanningPaperAnswer] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingSubmission, setSavingSubmission] = useState(false);
  const [studentStatuses, setStudentStatuses] = useState<Record<string, StudentSubmissionStatus>>({});
  const [studentStatusesLoading, setStudentStatusesLoading] = useState(false);
  const [questionEditDrafts, setQuestionEditDrafts] = useState<Record<string, QuestionEditDraft>>({});
  const [editingQuestionIds, setEditingQuestionIds] = useState<Set<string>>(new Set());
  const [editingAllQuestions, setEditingAllQuestions] = useState(false);
  const [savingQuestionEdits, setSavingQuestionEdits] = useState(false);
  const [savingQuestionIds, setSavingQuestionIds] = useState<Set<string>>(new Set());
  const [questionForm, setQuestionForm] = useState({
    question_text: "",
    question_type: "essay" as AssessmentQuestionResponse["question_type"],
    choices: "",
    expected_answer: "",
    skill_tag: "reading" as ScoreResponse["skill"],
    max_score: 10,
    rubric: "",
  });

  useEffect(() => {
    async function load() {
      const token = getAccessToken();
      if (!token) return;
      setLoading(true);
      try {
        const assessmentData = await getAssessment(assessmentId, token);
        const [questionData, studentData] = await Promise.all([
          getAssessmentQuestions(assessmentId, token),
          getClassStudents(assessmentData.class_id, token),
        ]);
        setAssessment(assessmentData);
        setQuestions(questionData);
        setStudents(studentData);
        setSelectedStudentId((current) => studentData.some((student) => student.id === current) ? current : "");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Không thể tải bài kiểm tra");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [assessmentId]);

  useEffect(() => {
    async function loadSummary() {
      const token = getAccessToken();
      if (!token || !selectedStudentId) {
        setSummary(null);
        return;
      }
      try {
        const [summaryData, insights] = await Promise.all([
          getStudentAssessmentSummary(selectedStudentId, token, assessmentId),
          getStudentAiInsights(selectedStudentId, token).catch(() => []),
        ]);
        setSummary(summaryData);
        setLatestInsight(insights.find((item) => item.assessment_id === assessmentId && !item.is_stale) ?? null);
        setPendingInsightDraft(null);
      } catch {
        setSummary(null);
        setLatestInsight(null);
        setPendingInsightDraft(null);
      }
    }
    void loadSummary();
  }, [assessmentId, selectedStudentId]);

  useEffect(() => {
    if (submissionOnly || !students.length) return;
    const token = getAccessToken();
    if (!token) return;
    let active = true;
    setStudentStatusesLoading(true);
    void Promise.all(
      students.map(async (student) => {
        const [studentSummary, insights] = await Promise.all([
          getStudentAssessmentSummary(student.id, token, assessmentId).catch(() => null),
          getStudentAiInsights(student.id, token).catch(() => []),
        ]);
        const assessmentSummary = studentSummary?.assessments.find((item) => item.id === assessmentId);
        return [
          student.id,
          {
            submitted: Boolean(assessmentSummary),
            graded: Boolean(
              assessmentSummary?.is_finalized ||
                (assessmentSummary?.total_score !== null && assessmentSummary?.total_score !== undefined),
            ),
            hasInsight: insights.some((item) => item.assessment_id === assessmentId && !item.is_stale),
          },
        ] as const;
      }),
    )
      .then((entries) => {
        if (active) setStudentStatuses(Object.fromEntries(entries));
      })
      .finally(() => {
        if (active) setStudentStatusesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assessmentId, students, submissionOnly, workspaceView]);

  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const selectedAssessmentSummary = summary?.assessments.find((item) => item.id === assessmentId);
  const resultRows = useMemo(() => buildResultRows(questions, selectedAssessmentSummary), [questions, selectedAssessmentSummary]);
  const effectiveClassId = assessment?.class_id || initialClassId || "";
  const sortedStudents = useMemo(
    () => students
      .map((student, index) => ({ student, index }))
      .sort((a, b) => {
        const rankDifference = submissionPriority(studentStatuses[a.student.id]) - submissionPriority(studentStatuses[b.student.id]);
        return rankDifference || a.index - b.index;
      })
      .map(({ student }) => student),
    [studentStatuses, students],
  );
  const submissionStats = useMemo(() => ({
    submitted: students.filter((student) => studentStatuses[student.id]?.submitted).length,
    graded: students.filter((student) => studentStatuses[student.id]?.graded).length,
    insight: students.filter((student) => studentStatuses[student.id]?.hasInsight).length,
    total: students.length,
  }), [studentStatuses, students]);
  const pendingGradingCount = Math.max(0, submissionStats.submitted - submissionStats.graded);

  useEffect(() => {
    setEditableInsightContent(pendingInsightDraft?.content ?? "");
  }, [pendingInsightDraft]);

  useEffect(() => {
    setReviewDrafts(
      Object.fromEntries(
        resultRows.map((row) => [
          row.question.id,
          {
            answer_text: row.answer_text,
            has_answer: row.has_answer,
            score_awarded: row.score_awarded,
            teacher_feedback: row.teacher_feedback,
          },
        ]),
      ),
    );
  }, [resultRows]);
  const total = useMemo(
    () => resultRows.reduce((sum, item) => sum + Number(reviewDrafts[item.question.id]?.score_awarded ?? item.score_awarded), 0),
    [resultRows, reviewDrafts],
  );
  const maxScore = questions.reduce((sum, question) => sum + question.max_score, 0);
  const canSaveSubmission = Boolean(selectedStudentId && questions.length);

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    try {
      const question = await createAssessmentQuestion(
        assessmentId,
        {
          question_text: questionForm.question_text,
          question_type: questionForm.question_type,
          choices: questionForm.question_type === "multiple_choice" ? splitChoices(questionForm.choices) : [],
          expected_answer: questionForm.expected_answer || undefined,
          skill_tag: questionForm.skill_tag,
          max_score: Number(questionForm.max_score),
          rubric_criteria: questionForm.rubric ? { criteria: questionForm.rubric } : {},
          score_range: `[0,${questionForm.max_score}]`,
        },
        token,
      );
      setQuestions((current) => [...current, question]);
      setQuestionForm({
        question_text: "",
        question_type: "essay",
        choices: "",
        expected_answer: "",
        skill_tag: "reading",
        max_score: 10,
        rubric: "",
      });
      setMessage("Đã lưu câu hỏi");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu câu hỏi");
    }
  }

  async function createQuestionImportDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token || !questionImportFiles.length || scanningQuestionImport) return;
    setScanningQuestionImport(true);
    setMessage("Đang scan bài kiểm tra...");
    try {
      const draft = await createAssessmentQuestionImportDraft(assessmentId, questionImportFiles, token);
      setQuestionImportDraft(draft);
      setMessage(`Đã quét file ${draft.filename} bằng ${extractionMethodLabel(draft.extraction_method)}. Giáo viên kiểm tra câu hỏi trước khi lưu vào bài kiểm tra.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể quét file bài kiểm tra");
    } finally {
      setScanningQuestionImport(false);
    }
  }

  async function saveQuestionImportDraft() {
    const token = getAccessToken();
    if (!token || !questionImportDraft) return;
    try {
      const createdQuestions: AssessmentQuestionResponse[] = [];
      for (const question of questionImportDraft.questions) {
        const created = await createAssessmentQuestion(
          assessmentId,
          {
            question_text: question.question_text,
            question_type: question.question_type,
            choices: question.question_type === "multiple_choice" ? question.choices : [],
            expected_answer: question.expected_answer || undefined,
            skill_tag: question.skill_tag,
            max_score: Number(question.max_score),
            rubric_criteria: question.rubric_criteria,
            score_range: question.score_range,
          },
          token,
        );
        createdQuestions.push(created);
      }
      setQuestions((current) => [...current, ...createdQuestions]);
      setQuestionImportDraft(null);
      setQuestionImportFiles([]);
      setMessage("Đã lưu câu hỏi từ file vào bài kiểm tra");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu câu hỏi từ file");
    }
  }

  function updateQuestionImportDraft(index: number, patch: Partial<AssessmentImportQuestionDraft>) {
    setQuestionImportDraft((current) =>
      current
        ? {
            ...current,
            questions: current.questions.map((question, questionIndex) => (questionIndex === index ? { ...question, ...patch } : question)),
          }
        : current,
    );
  }

  async function saveSubmission(event?: FormEvent<HTMLFormElement>, options?: { scrollToInsight?: boolean }) {
    event?.preventDefault();
    const token = getAccessToken();
    if (!token || !selectedStudentId || !canSaveSubmission || savingSubmission) return;
    setSavingSubmission(true);
    setMessage("AI đang sinh Insight từ bài làm vừa lưu...");
    try {
      const result = await submitStudentAssessment(
        assessmentId,
        {
          student_id: selectedStudentId,
          submitted_at: new Date().toISOString(),
          answers: resultRows.map((row) => ({
            question_id: row.question.id,
            answer_text: reviewDrafts[row.question.id]?.answer_text?.trim() || "-",
            score_awarded: Number(reviewDrafts[row.question.id]?.score_awarded ?? row.score_awarded),
            teacher_feedback: reviewDrafts[row.question.id]?.teacher_feedback || undefined,
          })),
        },
        token,
      );
      setPendingInsightDraft(result.ai_insight_draft ?? null);
      setSummary(await getStudentAssessmentSummary(selectedStudentId, token, assessmentId));
      setStudentStatuses((current) => ({
        ...current,
        [selectedStudentId]: { submitted: true, graded: true, hasInsight: current[selectedStudentId]?.hasInsight ?? false },
      }));
      const alertMessage = result.alert_status
        ? ` Cảnh báo: đã kiểm tra ${result.alert_status.alerts_checked}, tạo ${result.alert_status.notifications_created} thông báo.`
        : "";
      setMessage(
        result.ai_insight_status === "failed"
          ? `Đã lưu điểm bài kiểm tra, nhưng chưa tạo được AI Insight.${alertMessage}`
          : `Đã lưu điểm bài kiểm tra. AI Insight đang chờ giáo viên duyệt.${alertMessage}`,
      );
      if (options?.scrollToInsight) {
        window.requestAnimationFrame(() => {
          document.getElementById("ai-insight-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu điểm bài kiểm tra");
    } finally {
      setSavingSubmission(false);
    }
  }

  async function createPaperAnswerDraft() {
    const token = getAccessToken();
    if (!token || !selectedStudentId || !paperAnswerFiles.length || scanningPaperAnswer) return;
    setScanningPaperAnswer(true);
    setOcrMessage("Đang scan bài làm của học viên...");
    try {
      const draft = await createOcrDraft(assessmentId, selectedStudentId, paperAnswerFiles, token);
      setReviewDrafts((current) => {
        const next = { ...current };
        for (const answer of draft.answers) {
          const row = resultRows.find((item) => item.question.id === answer.question_id);
          if (!row) continue;
          const autoScore = answer.answer_text.trim() ? autoScoreAnswer(row.question, answer.answer_text) : null;
          next[answer.question_id] = {
            answer_text: answer.answer_text,
            has_answer: Boolean(answer.answer_text.trim()),
            score_awarded: autoScore ?? current[answer.question_id]?.score_awarded ?? row.score_awarded,
            teacher_feedback: current[answer.question_id]?.teacher_feedback ?? row.teacher_feedback,
          };
        }
        return next;
      });
      setOcrMessage(draft.warning || draft.warnings?.join(" ") || `Đã tạo draft từ ${draft.filename} bằng ${extractionMethodLabel(draft.extraction_method)}. Giáo viên cần kiểm tra trước khi lưu.`);
    } catch (error) {
      setOcrMessage(error instanceof Error ? error.message : "Không thể đọc ảnh bài làm");
    } finally {
      setScanningPaperAnswer(false);
    }
  }

  async function approvePendingInsight() {
    const token = getAccessToken();
    if (!token || !pendingInsightDraft) return;
    try {
      const approved = await approveStudentAiInsight(pendingInsightDraft.student_id, pendingInsightDraft, token, editableInsightContent);
      setLatestInsight(approved);
      setPendingInsightDraft(null);
      setEditableInsightContent("");
      setStudentStatuses((current) => ({
        ...current,
        [selectedStudentId]: { submitted: true, graded: true, hasInsight: true },
      }));
      setMessage("Đã duyệt và lưu AI Insight");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể duyệt AI Insight");
    }
  }

  function beginQuestionEdit(question: AssessmentQuestionResponse) {
    setQuestionEditDrafts((current) => ({ ...current, [question.id]: questionToEditDraft(question) }));
    setEditingQuestionIds((current) => new Set(current).add(question.id));
  }

  function cancelQuestionEdit(questionId: string) {
    setEditingQuestionIds((current) => {
      const next = new Set(current);
      next.delete(questionId);
      return next;
    });
    setQuestionEditDrafts((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  }

  function beginEditAllQuestions() {
    setQuestionEditDrafts(Object.fromEntries(questions.map((question) => [question.id, questionToEditDraft(question)])));
    setEditingQuestionIds(new Set(questions.map((question) => question.id)));
    setEditingAllQuestions(true);
  }

  function cancelAllQuestionEdits() {
    setQuestionEditDrafts({});
    setEditingQuestionIds(new Set());
    setEditingAllQuestions(false);
  }

  function updateQuestionEditDraft(questionId: string, patch: Partial<QuestionEditDraft>) {
    setQuestionEditDrafts((current) => ({
      ...current,
      [questionId]: { ...current[questionId], ...patch },
    }));
  }

  async function persistQuestionEdit(questionId: string) {
    const token = getAccessToken();
    const draft = questionEditDrafts[questionId];
    if (!token) throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    if (!draft) throw new Error("Không tìm thấy nội dung chỉnh sửa của câu hỏi.");
    validateQuestionEditDraft(draft);
    const updated = await updateAssessmentQuestion(questionId, questionEditPayload(draft), token);
    setQuestions((current) => current.map((question) => question.id === questionId ? updated : question));
    cancelQuestionEdit(questionId);
    return updated;
  }

  async function saveSingleQuestionEdit(questionId: string) {
    setSavingQuestionIds((current) => new Set(current).add(questionId));
    try {
      await persistQuestionEdit(questionId);
      setMessage("Đã cập nhật câu hỏi");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật câu hỏi");
    } finally {
      setSavingQuestionIds((current) => {
        const next = new Set(current);
        next.delete(questionId);
        return next;
      });
    }
  }

  async function saveAllQuestionEdits() {
    setSavingQuestionEdits(true);
    try {
      const token = getAccessToken();
      if (!token) throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      Object.values(questionEditDrafts).forEach(validateQuestionEditDraft);
      const updates = await Promise.all(
        questions.map((question) => {
          const draft = questionEditDrafts[question.id];
          return draft ? updateAssessmentQuestion(question.id, questionEditPayload(draft), token) : Promise.resolve(question);
        }),
      );
      setQuestions(updates);
      cancelAllQuestionEdits();
      setMessage("Đã cập nhật toàn bộ đề bài kiểm tra");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật toàn bộ đề");
    } finally {
      setSavingQuestionEdits(false);
    }
  }

  async function handleClearAssessmentQuestions() {
    const token = getAccessToken();
    if (!token || !questions.length || !window.confirm(`Xoá toàn bộ ${questions.length} câu hỏi trong đề "${assessment?.title || ""}"? Bài kiểm tra vẫn được giữ lại.`)) return;
    try {
      await deleteAllAssessmentQuestions(assessmentId, token);
      setQuestions([]);
      setQuestionImportDraft(null);
      cancelAllQuestionEdits();
      setMessage("Đã xoá toàn bộ câu hỏi. Bài kiểm tra vẫn được giữ lại.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xoá toàn bộ câu hỏi");
    }
  }

  async function handleDeleteQuestion(question: AssessmentQuestionResponse) {
    const token = getAccessToken();
    if (!token) return;
    if (!window.confirm(`Xoá câu hỏi "${question.question_text.slice(0, 80)}"?`)) return;
    try {
      await deleteAssessmentQuestion(question.id, token);
      setQuestions((current) => current.filter((item) => item.id !== question.id));
      setMessage("Đã xoá câu hỏi");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xoá câu hỏi");
    }
  }

  if (loading) {
    return <section className="border-b border-ink/10 py-8 text-sm font-semibold text-ink/60">Đang tải bài kiểm tra...</section>;
  }

  return (
    <div className="space-y-8 pb-10">
      {message ? <div className="border-l-4 border-leaf bg-leaf/10 px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <div>
        <Link
          href={submissionOnly
            ? effectiveClassId ? `/teacher/classes/${effectiveClassId}/assessments/${assessmentId}/submissions` : `/teacher/assessments/${assessmentId}/submissions`
            : rosterOnly
              ? effectiveClassId ? `/teacher/classes/${effectiveClassId}/assessments/${assessmentId}` : `/teacher/assessments/${assessmentId}`
            : effectiveClassId ? `/teacher/classes/${effectiveClassId}/assessments` : "/teacher/assessments"}
          className="portal-btn-secondary min-h-10 px-4 text-sm"
        >
          {submissionOnly ? "Quay lại danh sách bài làm" : rosterOnly ? "Quay lại thiết kế đề" : "Quay lại bài kiểm tra theo lớp"}
        </Link>
      </div>
      <section className="border-b border-ink/10 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-leaf">{submissionOnly ? "Kết quả bài làm học viên" : workspaceView === "design" ? "Không gian thiết kế bài kiểm tra" : "Chấm bài và quản lý Insight"}</p>
            <h2 className="text-2xl font-bold sm:text-3xl">{submissionOnly && selectedStudent ? selectedStudent.full_name : assessment?.title || "Bài kiểm tra"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
              {submissionOnly
                ? `${assessment?.title || "Bài kiểm tra"} - ${selectedStudent?.level || ""}`
                : workspaceView === "design"
                ? "Giáo viên có thể in đề, cho học viên làm online, hoặc tạo draft câu hỏi từ file."
                : "Chọn học viên để xem bài làm, OCR bài giấy, chấm điểm và duyệt AI Insight."}
            </p>
          </div>
          {!submissionOnly ? <div className="flex flex-wrap gap-2">
            <Link
              href={workspaceView === "submissions"
                ? effectiveClassId ? `/teacher/classes/${effectiveClassId}/assessments/${assessmentId}` : `/teacher/assessments/${assessmentId}`
                : effectiveClassId ? `/teacher/classes/${effectiveClassId}/assessments/${assessmentId}/submissions` : `/teacher/assessments/${assessmentId}/submissions`}
              className={`relative inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ${
                workspaceView === "submissions" ? "bg-ink text-white" : "border border-brand-200 bg-white text-brand hover:bg-brand-50"
              }`}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              {workspaceView === "submissions" ? "Thiết kế đề" : "Bài làm của học viên"}
              {workspaceView === "design" && pendingGradingCount > 0 ? (
                <span
                  className="urgent-count-badge assessment-pending-badge-ringing absolute -right-2.5 -top-2.5 grid min-h-6 min-w-6 place-items-center rounded-full border-2 border-white px-1.5 text-xs font-black leading-none text-white"
                  aria-label={`${pendingGradingCount} bài làm đang chờ chấm`}
                >
                  {pendingGradingCount > 99 ? "99+" : pendingGradingCount}
                </span>
              ) : null}
            </Link>
            <Link
              href={effectiveClassId ? `/teacher/classes/${effectiveClassId}/assessments/${assessmentId}/print` : `/teacher/assessments/${assessmentId}/print`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-glow hover:bg-brand-500"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              In đề / PDF
            </Link>
            <span className="inline-flex min-h-10 items-center justify-center gap-2 px-2 text-sm font-semibold text-ink/65">
              <ExternalLink className="h-4 w-4 text-leaf" aria-hidden="true" />
              Học viên làm tại /student/dashboard
            </span>
          </div> : null}
        </div>
      </section>
      <div className={workspaceView === "design" ? "grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]" : "grid gap-8"}>
        <section className="min-w-0 space-y-10">
          {workspaceView === "design" ? (
          <section>
            <form onSubmit={createQuestionImportDraft} className="mb-8">
              <div
                className={`relative grid min-h-60 place-items-center rounded-2xl border border-dashed border-brand-200 bg-[#eef5ff] px-6 py-10 text-center transition-colors ${scanningQuestionImport ? "cursor-not-allowed opacity-70" : "hover:border-leaf"}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (scanningQuestionImport) return;
                  setQuestionImportFiles(filesFromList(event.dataTransfer.files));
                }}
              >
                <input
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  type="file"
                  name="assessment_file"
                  multiple
                  disabled={scanningQuestionImport}
                  onChange={(event) => setQuestionImportFiles(filesFromList(event.target.files))}
                />
                <div className="pointer-events-none max-w-xl">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-leaf shadow-sm">
                    {scanningQuestionImport ? <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" /> : <UploadCloud className="h-6 w-6" aria-hidden="true" />}
                  </span>
                  <p className="mt-4 text-lg font-bold text-ink">Tạo draft câu hỏi từ file</p>
                  <p className="mt-2 text-sm leading-6 text-ink/55">{selectedFilesLabel(questionImportFiles, "Chọn hoặc kéo thả file .docx, .pdf hay ảnh vào đây")}</p>
                  <p className="mt-1 text-xs font-semibold text-ink/45">File chỉ tạo draft để giáo viên review, chưa lưu ngay vào bài kiểm tra.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-leaf px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={!questionImportFiles.length || scanningQuestionImport}>
                  <FileQuestion className="h-4 w-4" aria-hidden="true" />
                  {scanningQuestionImport ? "Đang scan bài kiểm tra..." : "Quét file và tạo draft"}
                </button>
                <label className={`inline-flex min-h-10 items-center justify-center rounded-xl border border-ink/15 bg-white px-4 text-sm font-bold text-ink ${scanningQuestionImport ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-leaf"}`}>
                  Chọn folder
                  <input className="sr-only" type="file" multiple disabled={scanningQuestionImport} onChange={(event) => setQuestionImportFiles(filesFromList(event.target.files))} {...folderInputProps} />
                </label>
              </div>
            </form>
            {questionImportDraft ? (
              <div className="mb-4 space-y-3 rounded-xl border border-leaf/20 bg-leaf/10 p-3">
                <p className="text-sm font-bold">Draft câu hỏi từ file</p>
                <p className="text-xs font-semibold text-ink/60">Cách đọc file: {extractionMethodLabel(questionImportDraft.extraction_method)}</p>
                {questionImportDraft.warnings.length ? <p className="text-xs font-semibold text-coral">{questionImportDraft.warnings.join(" ")}</p> : null}
                {questionImportDraft.questions.map((question, index) => (
                  <article key={index} className="rounded-xl border border-ink/10 bg-white p-3">
                    <p className="mb-2 text-sm font-bold">Câu {index + 1}</p>
                    <textarea
                      className="min-h-20 w-full rounded-xl border border-ink/15 p-3 text-sm outline-none focus:border-leaf"
                      value={question.question_text}
                      onChange={(event) => updateQuestionImportDraft(index, { question_text: event.target.value })}
                    />
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <select
                        className="min-h-10 rounded-xl border border-ink/15 px-2 text-sm"
                        value={question.question_type}
                        onChange={(event) => updateQuestionImportDraft(index, { question_type: event.target.value as AssessmentImportQuestionDraft["question_type"] })}
                      >
                        <option value="essay">Tự luận</option>
                        <option value="multiple_choice">Trắc nghiệm</option>
                      </select>
                      <select
                        className="min-h-10 rounded-xl border border-ink/15 px-2 text-sm"
                        value={question.skill_tag}
                        onChange={(event) => updateQuestionImportDraft(index, { skill_tag: event.target.value as ScoreResponse["skill"] })}
                      >
                        {skills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
                      </select>
                      <label className="flex min-h-10 items-center rounded-xl border border-ink/15 bg-white px-2 text-sm">
                        <span className="mr-1 shrink-0 font-semibold text-ink/60">Điểm:</span>
                        <input
                          className="min-w-0 flex-1 bg-transparent outline-none"
                          type="number"
                          min={0.5}
                          max={100}
                          value={question.max_score}
                          onChange={(event) => updateQuestionImportDraft(index, { max_score: Number(event.target.value), score_range: `[0,${event.target.value}]` })}
                        />
                      </label>
                    </div>
                    <textarea
                      className="mt-2 min-h-16 w-full rounded-xl border border-ink/15 p-2 text-sm outline-none focus:border-leaf"
                      value={question.choices.join("\n")}
                      onChange={(event) => updateQuestionImportDraft(index, { choices: splitChoices(event.target.value) })}
                      placeholder="Lựa chọn trắc nghiệm, mỗi dòng một đáp án"
                    />
                    <input
                      className="mt-2 min-h-10 w-full rounded-xl border border-ink/15 px-2 text-sm"
                      value={question.expected_answer ?? ""}
                      onChange={(event) => updateQuestionImportDraft(index, { expected_answer: event.target.value || null })}
                      placeholder="Đáp án/tiêu chí mong đợi"
                    />
                  </article>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-ink/15 bg-white px-4 text-sm font-semibold" onClick={() => setQuestionImportDraft(null)}>
                    Hủy draft
                  </button>
                  <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-glow hover:bg-brand-500" onClick={saveQuestionImportDraft}>
                    Lưu câu hỏi vào bài kiểm tra
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mb-4 flex items-center justify-between gap-4 border-b border-ink/10 pb-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-leaf" aria-hidden="true" />
                <h2 className="text-lg font-bold">Danh sách câu hỏi</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <p className="mr-1 text-xs font-semibold text-ink/55">Tổng cộng: {questions.length} câu hỏi</p>
                {editingAllQuestions ? (
                  <>
                    <button type="button" onClick={saveAllQuestionEdits} disabled={savingQuestionEdits} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-white disabled:opacity-60">
                      {savingQuestionEdits ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                      Lưu toàn bộ
                    </button>
                    <button type="button" onClick={cancelAllQuestionEdits} disabled={savingQuestionEdits} className="min-h-9 rounded-xl border border-ink/15 bg-white px-3 text-sm font-semibold disabled:opacity-60">Hủy</button>
                  </>
                ) : (
                  <button type="button" onClick={beginEditAllQuestions} disabled={!questions.length} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-3 text-sm font-semibold text-brand hover:bg-brand-50 disabled:opacity-50">
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Chỉnh sửa đề
                  </button>
                )}
                <button type="button" onClick={handleClearAssessmentQuestions} disabled={!questions.length} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-coral/30 bg-white px-3 text-sm font-semibold text-coral hover:bg-coral/10 disabled:cursor-not-allowed disabled:opacity-50">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Xoá bài
                </button>
              </div>
            </div>
            <div className="divide-y divide-ink/10">
              {questions.length === 0 ? (
                <p className="rounded-xl border border-ink/10 bg-paper p-3 text-sm text-ink/60">Chưa có câu hỏi.</p>
              ) : (
                questions.map((question, index) => (
                  <article
                    key={question.id}
                    className="border-l-2 border-l-transparent bg-white px-5 py-6 transition-colors hover:border-l-leaf"
                    onDoubleClick={() => {
                      if (!editingQuestionIds.has(question.id)) beginQuestionEdit(question);
                    }}
                    title={editingQuestionIds.has(question.id) ? undefined : "Double click để chỉnh sửa câu hỏi"}
                  >
                    {editingQuestionIds.has(question.id) && questionEditDrafts[question.id] ? (
                      <QuestionEditFields
                        index={index}
                        draft={questionEditDrafts[question.id]}
                        onChange={(patch) => updateQuestionEditDraft(question.id, patch)}
                        onSave={() => saveSingleQuestionEdit(question.id)}
                        onCancel={() => cancelQuestionEdit(question.id)}
                        hideActions={editingAllQuestions}
                        saving={savingQuestionIds.has(question.id)}
                      />
                    ) : (
                    <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-leaf">
                          Câu {index + 1} - {question.skill_tag} - {question.question_type === "multiple_choice" ? "Trắc nghiệm" : "Tự luận"}
                        </p>
                        <h3 className="mt-3 text-base font-semibold leading-7">{question.question_text}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="px-2 py-1 text-xs font-bold uppercase text-ink/60">{question.max_score} điểm</p>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(question)}
                          className="inline-flex h-8 w-8 items-center justify-center text-coral hover:bg-coral/10"
                          title="Xoá câu hỏi"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {question.choices.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {question.choices.map((choice) => (
                          <span key={choice} className="rounded-xl bg-[#edf3fb] px-3 py-2 text-sm">
                            {choice}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {question.expected_answer ? <p className="mt-3 text-sm text-ink/65">Đáp án/tiêu chí: {question.expected_answer}</p> : null}
                    </>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
          ) : !submissionOnly ? (
            <section>
              <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Bài làm của học viên</h2>
                  <p className="mt-1 text-sm text-ink/55">Chọn một học viên để mở bài làm và tiếp tục quy trình chấm điểm.</p>
                </div>
                <div className="flex flex-wrap gap-2" aria-label={`${students.length} học viên trong lớp`}>
                  <RosterStatBadge label="Đã nộp" value={submissionStats.submitted} total={submissionStats.total} icon={UploadCloud} />
                  <RosterStatBadge label="Đã chấm" value={submissionStats.graded} total={submissionStats.total} icon={CheckCircle2} />
                  <RosterStatBadge label="Có Insight" value={submissionStats.insight} total={submissionStats.total} icon={Sparkles} />
                </div>
              </div>
              {studentStatusesLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {students.map((student) => <div key={student.id} className="h-32 animate-pulse rounded-2xl bg-ink/5" />)}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {sortedStudents.map((student) => {
                    const status = studentStatuses[student.id] ?? { submitted: false, graded: false, hasInsight: false };
                    return (
                      <Link
                        key={student.id}
                        href={effectiveClassId
                          ? `/teacher/classes/${effectiveClassId}/assessments/${assessmentId}/submissions/${student.id}`
                          : `/teacher/assessments/${assessmentId}/submissions/${student.id}`}
                        className="min-h-32 rounded-2xl border border-ink/10 bg-white p-4 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                      >
                        <p className="font-bold text-ink">{student.full_name}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${gradingBadgeClass(status)}`}>
                            {status.graded ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                            {status.graded ? "Đã chấm" : status.submitted ? "Chờ chấm" : "Chưa có bài"}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${insightBadgeClass(status)}`}>
                            <Sparkles className="h-3.5 w-3.5" />
                            {status.hasInsight ? "Đã có Insight" : "Chưa có Insight"}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {workspaceView === "submissions" && selectedStudent && submissionOnly ? (
          <>
          <form onSubmit={(event) => saveSubmission(event)} className="border-t border-ink/10 pt-8">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-leaf" aria-hidden="true" />
                <h2 className="text-lg font-bold">Kết quả bài làm học viên</h2>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink/65">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand">
                  {selectedStudent.full_name.split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase()}
                </span>
                {selectedStudent.full_name} - {selectedStudent.level}
              </div>
            </div>
            <p className={`mb-4 rounded-xl border p-3 text-sm font-semibold ${selectedAssessmentSummary ? "border-leaf/20 bg-leaf/10" : "border-ink/10 bg-paper text-ink/60"}`}>
              {selectedAssessmentSummary
                ? `Đã tìm thấy bài làm của ${selectedStudent?.full_name || "học viên"}. Giáo viên không chỉnh sửa câu trả lời, chỉ chấm điểm và lưu để tạo AI Insight.`
                : "Chưa có bài làm online. Giáo viên có thể upload ảnh/PDF bài làm giấy hoặc nhập câu trả lời thủ công rồi lưu."}
            </p>
            <div className="mb-8 rounded-3xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
              <p className="mb-2 text-sm font-bold">Nhập bài làm giấy từ ảnh/PDF</p>
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <div
                  className={`relative min-h-16 rounded-2xl border-2 border-dashed border-ink/20 bg-paper px-4 py-3 text-sm font-semibold transition-colors ${
                    scanningPaperAnswer ? "cursor-not-allowed text-ink/55 opacity-70" : selectedStudentId ? "text-ink hover:border-leaf" : "text-ink/40"
                  }`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (selectedStudentId && !scanningPaperAnswer) setPaperAnswerFiles(filesFromList(event.dataTransfer.files));
                  }}
                >
                  <input
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    type="file"
                    name="answer_file"
                    multiple
                    disabled={!selectedStudentId || scanningPaperAnswer}
                    onChange={(event) => setPaperAnswerFiles(filesFromList(event.target.files))}
                  />
                  <span className="flex min-h-10 items-center gap-3">
                    {scanningPaperAnswer ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-leaf" aria-hidden="true" /> : <UploadCloud className="h-5 w-5 shrink-0 text-leaf" aria-hidden="true" />}
                    {selectedFilesLabel(paperAnswerFiles, "Bấm vào box này để chọn một/nhiều ảnh/PDF bài làm")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={createPaperAnswerDraft}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-leaf px-5 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={!selectedStudentId || !paperAnswerFiles.length || scanningPaperAnswer}
                >
                  {scanningPaperAnswer ? "Đang scan bài làm..." : "Tạo draft"}
                </button>
              </div>
              <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-2xl border border-ink/15 bg-white px-4 text-xs font-bold text-ink transition-colors hover:border-leaf hover:bg-leaf/5">
                Chọn folder bài làm
                <input
                  className="sr-only"
                  type="file"
                  multiple
                  disabled={!selectedStudentId}
                  onChange={(event) => setPaperAnswerFiles(filesFromList(event.target.files))}
                  {...folderInputProps}
                />
              </label>
              <p className="mt-2 text-xs font-semibold text-ink/55">Hỗ trợ: nhiều ảnh, PDF, DOCX, TXT hoặc folder. PDF scan có thể mất lâu hơn; hệ thống sẽ báo lỗi nếu file không đúng định dạng.</p>
              {ocrMessage ? <p className="mt-2 text-sm font-semibold text-ink/70">{ocrMessage}</p> : null}
            </div>

            {resultRows.length ? (
              <QuestionNavigator
                rows={resultRows}
                reviewDrafts={reviewDrafts}
                onSave={() => saveSubmission(undefined, { scrollToInsight: true })}
                saving={savingSubmission}
                disabled={!canSaveSubmission}
              />
            ) : null}

            <div className="divide-y divide-ink/10 border-t border-ink/10">
              {resultRows.map((row, index) => {
                const draft = reviewDrafts[row.question.id];
                const answerText = draft?.answer_text ?? row.answer_text;
                const hasAnswer = draft?.has_answer ?? row.has_answer;
                const score = Number(draft?.score_awarded ?? row.score_awarded);
                const isCorrect = hasAnswer && score >= row.question.max_score;
                const isIncorrect = hasAnswer && !isCorrect;
                const answerTone = isCorrect
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950 focus:border-emerald-500"
                  : isIncorrect
                    ? "border-red-300 bg-red-50 text-red-950 focus:border-red-500"
                    : "border-ink/15 bg-white text-ink focus:border-leaf";

                return (
                  <article
                    id={questionAnchorId(index)}
                    key={row.question.id}
                    className={`scroll-mt-6 border-l-4 py-6 pl-4 sm:pl-5 ${isCorrect ? "border-emerald-600" : isIncorrect ? "border-red-500" : "border-ink/15"}`}
                  >
                    <p className="mb-3 text-sm font-bold">Câu {index + 1}: {row.question.question_text}</p>
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_132px]">
                      <FormField label="Câu trả lời của học viên">
                        <textarea
                          className={`min-h-24 w-full rounded-2xl border p-4 font-semibold outline-none transition-colors ${answerTone}`}
                          value={answerText}
                          onChange={(event) =>
                            setReviewDrafts((current) => ({
                              ...current,
                              [row.question.id]: {
                                answer_text: event.target.value,
                                has_answer: Boolean(event.target.value.trim()),
                                score_awarded: current[row.question.id]?.score_awarded ?? row.score_awarded,
                                teacher_feedback: current[row.question.id]?.teacher_feedback ?? row.teacher_feedback,
                              },
                            }))
                          }
                        />
                      </FormField>
                      <div className={`self-start rounded-2xl border p-3 ${isCorrect ? "border-emerald-200 bg-emerald-50" : isIncorrect ? "border-red-200 bg-red-50" : "border-ink/10 bg-white"}`}>
                        <p className="text-center text-xs font-semibold text-ink/55">Điểm / {row.question.max_score}</p>
                        <div className="mt-2 flex items-center justify-center gap-2">
                          <input
                            className={`h-10 w-16 border-b-2 bg-transparent px-1 text-center text-xl font-bold outline-none ${isCorrect ? "border-emerald-700 text-emerald-800" : isIncorrect ? "border-red-600 text-red-700" : "border-ink/30 text-ink focus:border-leaf"}`}
                            type="number"
                            min={0}
                            max={row.question.max_score}
                            aria-label={`Điểm câu ${index + 1}`}
                            value={score}
                            onChange={(event) =>
                              setReviewDrafts((current) => ({
                                ...current,
                                [row.question.id]: {
                                  answer_text: current[row.question.id]?.answer_text ?? row.answer_text,
                                  has_answer: current[row.question.id]?.has_answer ?? row.has_answer,
                                  score_awarded: Number(event.target.value),
                                  teacher_feedback: current[row.question.id]?.teacher_feedback ?? row.teacher_feedback,
                                },
                              }))
                            }
                            disabled={!canSaveSubmission}
                          />
                          {isCorrect ? <CheckCircle2 className="h-5 w-5 text-emerald-700" aria-label="Đúng" /> : null}
                          {isIncorrect ? <XCircle className="h-5 w-5 text-red-600" aria-label="Sai" /> : null}
                        </div>
                      </div>
                    </div>
                    <FormField label="Nhận xét giáo viên">
                      <textarea
                        className="min-h-24 w-full rounded-2xl border border-ink/15 bg-white p-4 outline-none transition-colors focus:border-leaf"
                        placeholder="Nhập nhận xét cho câu trả lời này..."
                        value={draft?.teacher_feedback ?? row.teacher_feedback}
                        onChange={(event) =>
                          setReviewDrafts((current) => ({
                            ...current,
                            [row.question.id]: {
                              answer_text: current[row.question.id]?.answer_text ?? row.answer_text,
                              has_answer: current[row.question.id]?.has_answer ?? row.has_answer,
                              score_awarded: current[row.question.id]?.score_awarded ?? row.score_awarded,
                              teacher_feedback: event.target.value,
                            },
                          }))
                        }
                        disabled={!selectedAssessmentSummary}
                      />
                    </FormField>
                  </article>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold">
                Tổng điểm: {total}/{maxScore}
              </p>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-60"
                disabled={!canSaveSubmission || savingSubmission}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {savingSubmission ? "AI đang sinh Insight" : "Lưu bài làm"}
              </button>
            </div>
          </form>

          <AssessmentSummaryPanel summary={summary} assessmentId={assessmentId} studentName={selectedStudent?.full_name} />
          <AiInsightPanel
            insight={latestInsight}
            draft={pendingInsightDraft}
            editableContent={editableInsightContent}
            onEditableContentChange={setEditableInsightContent}
            onApprove={approvePendingInsight}
          />
          </>
          ) : null}
        </section>

        {workspaceView === "design" ? (
        <aside className="xl:border-l xl:border-ink/10 xl:pl-7">
          <form onSubmit={createQuestion} className="sticky top-6">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5 text-leaf" aria-hidden="true" />
              <h2 className="text-lg font-bold">Tạo câu hỏi</h2>
            </div>
            <FormField label="Nội dung câu hỏi">
              <textarea
                className="min-h-24 w-full rounded-xl border border-ink/15 p-3 outline-none focus:border-leaf"
                value={questionForm.question_text}
                onChange={(event) => setQuestionForm((current) => ({ ...current, question_text: event.target.value }))}
                required
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Loại câu hỏi">
                <select
                  className="min-h-11 w-full rounded-xl border border-ink/15 px-3 outline-none focus:border-leaf"
                  value={questionForm.question_type}
                  onChange={(event) =>
                    setQuestionForm((current) => ({ ...current, question_type: event.target.value as AssessmentQuestionResponse["question_type"] }))
                  }
                >
                  <option value="essay">Tự luận</option>
                  <option value="multiple_choice">Trắc nghiệm</option>
                </select>
              </FormField>
              <FormField label="Kỹ năng">
                <select
                  className="min-h-11 w-full rounded-xl border border-ink/15 px-3 outline-none focus:border-leaf"
                  value={questionForm.skill_tag}
                  onChange={(event) => setQuestionForm((current) => ({ ...current, skill_tag: event.target.value as ScoreResponse["skill"] }))}
                >
                  {skills.map((skill) => (
                    <option key={skill} value={skill}>
                      {skill}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            {questionForm.question_type === "multiple_choice" ? (
              <FormField label="Lựa chọn, mỗi dòng một đáp án">
                <textarea
                  className="min-h-20 w-full rounded-xl border border-ink/15 p-3 outline-none focus:border-leaf"
                  value={questionForm.choices}
                  onChange={(event) => setQuestionForm((current) => ({ ...current, choices: event.target.value }))}
                  required
                />
              </FormField>
            ) : null}
            <FormField label="Đáp án/tiêu chí mong đợi">
              <textarea
                className="min-h-20 w-full rounded-xl border border-ink/15 p-3 outline-none focus:border-leaf"
                value={questionForm.expected_answer}
                onChange={(event) => setQuestionForm((current) => ({ ...current, expected_answer: event.target.value }))}
              />
            </FormField>
            <FormField label="Rubric">
              <textarea
                className="min-h-20 w-full rounded-xl border border-ink/15 p-3 outline-none focus:border-leaf"
                value={questionForm.rubric}
                onChange={(event) => setQuestionForm((current) => ({ ...current, rubric: event.target.value }))}
              />
            </FormField>
            <FormField label="Điểm tối đa">
              <input
                className="min-h-11 w-full rounded-xl border border-ink/15 px-3 outline-none focus:border-leaf"
                type="number"
                min={1}
                max={100}
                value={questionForm.max_score}
                onChange={(event) => setQuestionForm((current) => ({ ...current, max_score: Number(event.target.value) }))}
              />
            </FormField>
            <button className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-leaf px-4 font-semibold text-white">
              <Save className="h-4 w-4" aria-hidden="true" />
              Lưu câu hỏi
            </button>
          </form>
        </aside>
        ) : null}
      </div>
    </div>
  );
}

function QuestionNavigator({
  rows,
  reviewDrafts,
  onSave,
  saving,
  disabled,
}: {
  rows: ReturnType<typeof buildResultRows>;
  reviewDrafts: Record<string, ReviewDraft>;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}) {
  return (
    <section className="mb-8 rounded-3xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="text-sm font-black uppercase tracking-[0.08em] text-ink/70">Question Navigator</p>
            <span className="hidden h-8 w-px bg-ink/15 sm:block" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold uppercase text-ink/60">
              <NavigatorLegend colorClass="bg-emerald-700" label="Correct" />
              <NavigatorLegend colorClass="bg-red-600" label="Incorrect" />
              <NavigatorLegend colorClass="bg-slate-200" label="Ungraded" />
            </div>
          </div>
          <div className="grid max-w-[34rem] grid-cols-5 gap-2 sm:grid-cols-10">
            {rows.map((row, index) => {
              const draft = reviewDrafts[row.question.id];
              const hasAnswer = draft?.has_answer ?? row.has_answer;
              const score = Number(draft?.score_awarded ?? row.score_awarded);
              const isCorrect = hasAnswer && score >= row.question.max_score;
              const isIncorrect = hasAnswer && !isCorrect;
              const tone = isCorrect
                ? "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800"
                : isIncorrect
                  ? "bg-red-600 text-white shadow-sm hover:bg-red-700"
                  : "bg-slate-200 text-ink/65 hover:bg-slate-300";

              return (
                <button
                  key={row.question.id}
                  type="button"
                  onClick={() => document.getElementById(questionAnchorId(index))?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className={`grid h-11 w-11 place-items-center rounded-full text-sm font-black transition-colors sm:h-12 sm:w-12 ${tone}`}
                  aria-label={`Đi tới câu ${index + 1}`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 xl:w-56">
          <button
            type="button"
            onClick={onSave}
            disabled={disabled || saving}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-sm font-bold text-white shadow-glow transition-colors hover:bg-brand-500 disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "AI đang sinh Insight" : "Lưu bài làm"}
          </button>
          {saving ? <p className="text-center text-xs font-semibold text-leaf">AI đang sinh Insight...</p> : null}
        </div>
      </div>
    </section>
  );
}

function NavigatorLegend({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${colorClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function AssessmentSummaryPanel({
  summary,
  assessmentId,
  studentName,
}: {
  summary: StudentAssessmentSummaryResponse | null;
  assessmentId: string;
  studentName?: string;
}) {
  const item = summary?.assessments.find((assessment) => assessment.id === assessmentId);
  return (
    <section className="border-t border-ink/10 pt-8">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-leaf" aria-hidden="true" />
        <h2 className="text-lg font-bold">Phân tích điểm mạnh/yếu{studentName ? ` - ${studentName}` : ""}</h2>
      </div>
      {!summary || !item ? (
        <p className="border-l-2 border-ink/15 py-2 pl-4 text-sm text-ink/60">Chưa có kết quả bài kiểm tra cho học viên này.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid divide-y divide-ink/10 border-y border-ink/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <SummaryCard label="Tổng điểm" value={item.total_score === null ? "Chưa lưu" : `${item.total_score}/${item.max_score}`} />
            <SummaryCard label="Điểm mạnh" value={summary.strengths.length ? summary.strengths.join(", ") : "Chưa rõ"} />
            <SummaryCard label="Cần hỗ trợ" value={summary.weaknesses.length ? summary.weaknesses.join(", ") : "Chưa rõ"} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="text-ink/55">
                <tr>
                  <th className="px-3 py-2">Kỹ năng</th>
                  <th className="px-3 py-2">Điểm</th>
                  <th className="px-3 py-2">Tỷ lệ</th>
                  <th className="px-3 py-2">Số câu</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.skill_summary).map(([skill, data]) => (
                  <tr key={skill} className="border-t border-ink/10">
                    <td className="px-3 py-3 font-bold">{skill}</td>
                    <td className="px-3 py-3">{data.score}/{data.max_score}</td>
                    <td className="px-3 py-3">{data.percent ?? "-"}%</td>
                    <td className="px-3 py-3">{data.answered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function AiInsightPanel({
  insight,
  draft,
  editableContent,
  onEditableContentChange,
  onApprove,
}: {
  insight: AiInsightResponse | null;
  draft: AiInsightDraft | null;
  editableContent: string;
  onEditableContentChange: (content: string) => void;
  onApprove: () => void;
}) {
  const visibleContent = draft ? editableContent : insight?.content;
  const parsed = parseInsightContent(visibleContent);
  const canApprove = !draft || editableContent.trim().length > 0;
  return (
    <section id="ai-insight-section" className="scroll-mt-6 border-t border-ink/10 pt-8">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-leaf" aria-hidden="true" />
        <h2 className="text-lg font-bold">{draft ? "AI Insight chờ duyệt" : "AI Insight mới nhất"}</h2>
      </div>
      {!draft && !insight ? (
        <p className="border-l-2 border-ink/15 py-2 pl-4 text-sm text-ink/60">Chưa có AI Insight cho bài kiểm tra đã chấm.</p>
      ) : parsed ? (
        <div className="space-y-3 text-sm">
          {draft ? <p className="border-l-2 border-leaf bg-leaf/10 px-4 py-3 font-semibold">Insight này mới được sinh ra và chưa hiển thị cho phụ huynh. Giáo viên cần duyệt trước khi lưu.</p> : null}
          {draft ? (
            <StructuredInsightEditor content={parsed} onChange={(next) => onEditableContentChange(JSON.stringify(next, null, 2))} />
          ) : (
            <InsightPreview parsed={parsed} />
          )}
          {draft ? (
            <button
              type="button"
              onClick={onApprove}
              disabled={!canApprove}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Duyệt và lưu insight
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {draft ? <RawInsightEditor value={editableContent} onChange={onEditableContentChange} /> : null}
          <p className="whitespace-pre-wrap border-l-2 border-ink/15 py-2 pl-4 text-sm text-ink/70">{visibleContent}</p>
          {draft ? (
            <button
              type="button"
              onClick={onApprove}
              disabled={!canApprove}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-glow hover:bg-brand-500 disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Duyệt và lưu insight
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function InsightPreview({ parsed }: { parsed: InsightContent }) {
  return (
    <>
      <p className="border-l-2 border-leaf bg-leaf/5 px-4 py-3 font-semibold">{parsed.summary || "Đã tạo insight cho bài kiểm tra mới."}</p>
      <InsightList title="Điểm mạnh mới" items={parsed.new_strengths} />
      <InsightList title="Điểm yếu mới/cần hỗ trợ" items={parsed.new_weaknesses} />
      <InsightList title="Điểm yếu đã cải thiện" items={parsed.improved_weaknesses} />
      <InsightList title="Điểm yếu còn lặp lại" items={parsed.persistent_weaknesses} />
      <InsightList title="Gợi ý cho giáo viên" items={parsed.teacher_actions} />
      <InsightList title="Gợi ý cho phụ huynh" items={parsed.parent_actions} />
    </>
  );
}

function StructuredInsightEditor({ content, onChange }: { content: InsightContent; onChange: (content: InsightContent) => void }) {
  const updateField = (field: keyof InsightContent, value: string | string[]) => {
    onChange({ ...content, [field]: value });
  };

  return (
    <div className="space-y-4 rounded-xl border border-ink/10 bg-paper p-3">
      <EditableInsightText
        label="Tóm tắt gửi phụ huynh"
        value={typeof content.summary === "string" ? content.summary : ""}
        onChange={(value) => updateField("summary", value)}
      />
      <EditableInsightList title="Điểm mạnh mới" items={content.new_strengths} onChange={(items) => updateField("new_strengths", items)} />
      <EditableInsightList title="Điểm yếu mới/cần hỗ trợ" items={content.new_weaknesses} onChange={(items) => updateField("new_weaknesses", items)} />
      <EditableInsightList title="Điểm yếu đã cải thiện" items={content.improved_weaknesses} onChange={(items) => updateField("improved_weaknesses", items)} />
      <EditableInsightList title="Điểm yếu còn lặp lại" items={content.persistent_weaknesses} onChange={(items) => updateField("persistent_weaknesses", items)} />
      <EditableInsightList title="Gợi ý cho giáo viên" items={content.teacher_actions} onChange={(items) => updateField("teacher_actions", items)} />
      <EditableInsightList title="Gợi ý cho phụ huynh" items={content.parent_actions} onChange={(items) => updateField("parent_actions", items)} />
    </div>
  );
}

function EditableInsightText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <textarea
        className="mt-2 min-h-24 w-full rounded-xl border border-ink/15 bg-white p-3 text-sm font-semibold leading-6 outline-none focus:border-leaf"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EditableInsightList({ title, items, onChange }: { title: string; items?: string[]; onChange: (items: string[]) => void }) {
  const editableItems = items?.length ? items : [""];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-bold">{title}</p>
        <button
          type="button"
          onClick={() => onChange([...editableItems, ""])}
          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-ink/15 bg-white px-2 text-xs font-semibold"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Thêm ý
        </button>
      </div>
      <div className="space-y-2">
        {editableItems.map((item, index) => (
          <div key={`${title}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <textarea
              className="min-h-12 w-full resize-y rounded-xl border border-ink/15 bg-white p-2 text-sm leading-6 outline-none focus:border-leaf"
              value={item}
              onChange={(event) => onChange(editableItems.map((current, itemIndex) => (itemIndex === index ? event.target.value : current)))}
            />
            <button
              type="button"
              onClick={() => onChange(editableItems.filter((_, itemIndex) => itemIndex !== index))}
              className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-coral/30 bg-white px-2 text-sm font-semibold text-coral"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Xóa
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RawInsightEditor({ value, onChange }: { value: string; onChange: (content: string) => void }) {
  return (
    <FormField label="Chỉnh sửa AI Insight trước khi duyệt">
      <textarea
        className="min-h-44 w-full rounded-xl border border-ink/15 p-3 text-sm outline-none focus:border-leaf"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </FormField>
  );
}

function InsightList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="font-bold">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-ink/70">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function questionToEditDraft(question: AssessmentQuestionResponse): QuestionEditDraft {
  return {
    question_text: question.question_text,
    question_type: question.question_type,
    choices: question.choices.join("\n"),
    expected_answer: question.expected_answer ?? "",
    skill_tag: question.skill_tag,
    max_score: question.max_score,
    rubric: Object.values(question.rubric_criteria).filter((value) => typeof value === "string").join("\n"),
  };
}

function questionEditPayload(draft: QuestionEditDraft) {
  const rubricCriteria: Record<string, string> = draft.rubric ? { criteria: draft.rubric } : {};
  return {
    question_text: draft.question_text,
    question_type: draft.question_type,
    choices: draft.question_type === "multiple_choice" ? splitChoices(draft.choices) : [],
    expected_answer: draft.expected_answer || undefined,
    skill_tag: draft.skill_tag,
    max_score: Number(draft.max_score),
    rubric_criteria: rubricCriteria,
    score_range: `[0,${draft.max_score}]`,
  };
}

function validateQuestionEditDraft(draft: QuestionEditDraft) {
  if (!draft.question_text.trim()) throw new Error("Nội dung câu hỏi không được để trống.");
  if (!Number.isFinite(draft.max_score) || draft.max_score <= 0 || draft.max_score > 100) {
    throw new Error("Điểm câu hỏi phải lớn hơn 0 và không vượt quá 100.");
  }
  if (draft.question_type === "multiple_choice" && splitChoices(draft.choices).length === 0) {
    throw new Error("Câu hỏi trắc nghiệm cần có ít nhất một lựa chọn.");
  }
}

function QuestionEditFields({
  index,
  draft,
  onChange,
  onSave,
  onCancel,
  hideActions,
  saving,
}: {
  index: number;
  draft: QuestionEditDraft;
  onChange: (patch: Partial<QuestionEditDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  hideActions: boolean;
  saving: boolean;
}) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-4">
      <p className="mb-3 text-sm font-bold text-brand">Chỉnh sửa câu {index + 1}</p>
      <textarea className="min-h-24 w-full rounded-xl border border-ink/15 bg-white p-3 text-sm outline-none focus:border-brand" value={draft.question_text} onChange={(event) => onChange({ question_text: event.target.value })} />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <select className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 text-sm" value={draft.question_type} onChange={(event) => onChange({ question_type: event.target.value as QuestionEditDraft["question_type"] })}>
          <option value="essay">Tự luận</option>
          <option value="multiple_choice">Trắc nghiệm</option>
        </select>
        <select className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 text-sm" value={draft.skill_tag} onChange={(event) => onChange({ skill_tag: event.target.value as ScoreResponse["skill"] })}>
          {skills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
        </select>
        <label className="flex min-h-11 items-center rounded-xl border border-ink/15 bg-white px-3 text-sm">
          <span className="mr-1 shrink-0 font-semibold text-ink/60">Điểm:</span>
          <input className="min-w-0 flex-1 bg-transparent outline-none" type="number" min={0.5} max={100} value={draft.max_score} onChange={(event) => onChange({ max_score: Number(event.target.value) })} />
        </label>
      </div>
      {draft.question_type === "multiple_choice" ? (
        <textarea className="mt-3 min-h-20 w-full rounded-xl border border-ink/15 bg-white p-3 text-sm outline-none focus:border-brand" value={draft.choices} onChange={(event) => onChange({ choices: event.target.value })} placeholder="Lựa chọn, mỗi dòng một đáp án" />
      ) : null}
      <textarea className="mt-3 min-h-16 w-full rounded-xl border border-ink/15 bg-white p-3 text-sm outline-none focus:border-brand" value={draft.expected_answer} onChange={(event) => onChange({ expected_answer: event.target.value })} placeholder="Đáp án/tiêu chí mong đợi" />
      <textarea className="mt-3 min-h-16 w-full rounded-xl border border-ink/15 bg-white p-3 text-sm outline-none focus:border-brand" value={draft.rubric} onChange={(event) => onChange({ rubric: event.target.value })} placeholder="Rubric" />
      {!hideActions ? (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onSave} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saving ? "Đang lưu..." : "Lưu câu hỏi"}
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className="min-h-10 rounded-xl border border-ink/15 bg-white px-4 text-sm font-semibold disabled:opacity-60">Hủy</button>
        </div>
      ) : null}
    </div>
  );
}

function submissionPriority(status?: StudentSubmissionStatus) {
  if (status?.graded && !status.hasInsight) return 0;
  if (status?.submitted && !status.graded && !status.hasInsight) return 1;
  if (status?.graded && status.hasInsight) return 2;
  if (status?.hasInsight) return 2;
  return 3;
}

function gradingBadgeClass(status: StudentSubmissionStatus) {
  if (status.graded) return "border-brand-200 bg-brand-50 text-brand";
  if (status.submitted) return "attention-badge-pulse border-[#ead080] bg-[#fff7d6] text-[#875c00]";
  return "border-ink/10 bg-ink/[0.04] text-ink/45";
}

function insightBadgeClass(status: StudentSubmissionStatus) {
  if (status.hasInsight) return "border-brand-200 bg-brand-50 text-brand";
  if (status.submitted || status.graded) return "attention-badge-pulse border-[#ead080] bg-[#fff7d6] text-[#875c00]";
  return "border-ink/10 bg-ink/[0.04] text-ink/45";
}

function RosterStatBadge({
  label,
  value,
  total,
  icon: Icon,
}: {
  label: string;
  value: number;
  total: number;
  icon: typeof UploadCloud;
}) {
  const complete = total > 0 && value === total;
  return (
    <span className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold ${
      complete ? "border-brand-200 bg-brand-50 text-brand" : "border-[#ead080] bg-[#fff7d6] text-[#875c00]"
    }`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}/{total}</strong>
    </span>
  );
}

function parseInsightContent(value?: string) {
  if (!value) return null;
  try {
    return JSON.parse(value) as InsightContent;
  } catch {
    return null;
  }
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4">
      <p className="text-sm text-ink/55">{label}</p>
      <p className="mt-1 text-sm font-bold leading-6">{value}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block text-sm font-semibold">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  muted = false,
  multiline = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="mb-3 block text-sm font-semibold">
      {label}
      <div
        className={`mt-1 rounded-xl border border-ink/15 bg-white px-3 py-3 font-normal ${muted ? "text-ink/45" : "text-ink"} ${
          multiline ? "min-h-20 whitespace-pre-wrap" : "min-h-11"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function splitChoices(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractionMethodLabel(method?: string | null) {
  switch (method) {
    case "pdf_text":
      return "PyMuPDF";
    case "openai_vision":
      return "OpenAI Vision";
    case "docx_text":
      return "DOCX parser";
    case "plain_text":
      return "text parser";
    case "binary_text":
      return "text fallback";
    default:
      return "không xác định";
  }
}

function normalizeAnswerText(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function multipleChoiceLabel(value?: string | null) {
  const text = (value || "").trim();
  if (!text) return null;
  if (/^[A-Za-z]$/.test(text)) return text.toLowerCase();
  const match = text.match(/^([A-Za-z])\s*[\).:-]\s*/);
  return match?.[1]?.toLowerCase() ?? null;
}

function multipleChoiceTextWithoutLabel(value?: string | null) {
  return (value || "").trim().replace(/^[A-Za-z]\s*[\).:-]\s*/, "").trim();
}

function choiceForLabel(question: AssessmentQuestionResponse, label: string | null) {
  if (!label) return null;
  const labeledChoice = question.choices.find((choice) => multipleChoiceLabel(choice) === label);
  if (labeledChoice) return labeledChoice;
  const index = label.toLowerCase().charCodeAt(0) - "a".charCodeAt(0);
  return index >= 0 && index < question.choices.length ? question.choices[index] : null;
}

function multipleChoiceMatchValues(value?: string | null) {
  return new Set(
    [normalizeAnswerText(value), normalizeAnswerText(multipleChoiceTextWithoutLabel(value))]
      .filter(Boolean),
  );
}

function multipleChoiceValuesOverlap(left?: string | null, right?: string | null) {
  const leftValues = multipleChoiceMatchValues(left);
  const rightValues = multipleChoiceMatchValues(right);
  return [...leftValues].some((value) => rightValues.has(value));
}

function autoScoreAnswer(question: AssessmentQuestionResponse, answerText: string) {
  const expectedAnswer = question.expected_answer;
  if (!expectedAnswer?.trim()) return null;

  if (question.question_type === "multiple_choice") {
    const expectedLabel = multipleChoiceLabel(expectedAnswer);
    const answerLabel = multipleChoiceLabel(answerText);
    const labelsMatch = expectedLabel !== null && expectedLabel === answerLabel;
    const answerTextMatchesExpected = multipleChoiceValuesOverlap(expectedAnswer, answerText);
    const expectedChoice = choiceForLabel(question, expectedLabel);
    const expectedChoiceMatches = expectedChoice ? multipleChoiceValuesOverlap(expectedChoice, answerText) : false;
    const answerChoice = choiceForLabel(question, answerLabel);
    const answerChoiceMatches = answerChoice ? multipleChoiceValuesOverlap(expectedAnswer, answerChoice) : false;
    const textsMatch = normalizeAnswerText(expectedAnswer) === normalizeAnswerText(answerText);
    return labelsMatch || answerTextMatchesExpected || expectedChoiceMatches || answerChoiceMatches || textsMatch ? question.max_score : 0;
  }

  if (question.question_type === "essay" && question.skill_tag !== "writing") {
    return normalizeAnswerText(answerText) === normalizeAnswerText(expectedAnswer) ? question.max_score : 0;
  }

  return null;
}

function hasSubmittedAnswer(value?: string | null) {
  const text = (value || "").trim();
  return Boolean(text && text !== "-");
}

function buildResultRows(
  questions: AssessmentQuestionResponse[],
  assessmentSummary?: StudentAssessmentSummaryResponse["assessments"][number],
) {
  return questions.map((question) => {
    const submitted = assessmentSummary?.questions.find((item) => item.question_id === question.id);
    const answerText = submitted?.student_answer ?? "";
    const hasAnswer = hasSubmittedAnswer(answerText);
    const autoScore = hasAnswer ? autoScoreAnswer(question, answerText) : null;
    return {
      question,
      answer_text: hasAnswer ? answerText : "",
      has_answer: hasAnswer,
      score_awarded: hasAnswer ? submitted?.score_awarded ?? autoScore ?? 0 : 0,
      teacher_feedback: submitted?.teacher_feedback ?? "",
    };
  });
}
