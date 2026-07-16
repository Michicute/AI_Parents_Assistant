"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { AssessmentPrintViewResponse, getAssessmentPrintView } from "@/lib/api";
import { getAccessToken } from "@/lib/dev-auth";

export default function TeacherClassAssessmentPrintRoute() {
  const params = useParams<{ assessmentId: string }>();
  const assessmentId = params.assessmentId;
  const [printView, setPrintView] = useState<AssessmentPrintViewResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadPrintView() {
      const token = getAccessToken();
      if (!token) return;
      try {
        setPrintView(await getAssessmentPrintView(assessmentId, token));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Không thể tải bản in");
      }
    }
    void loadPrintView();
  }, [assessmentId]);

  if (!printView) {
    return <main className="grid min-h-screen place-items-center bg-white p-8 text-ink">{message || "Đang tải bản in..."}</main>;
  }

  return (
    <main className="min-h-screen bg-white p-8 text-ink">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
          <div>
            <p className="text-sm font-semibold text-leaf">Bản in bài kiểm tra</p>
            <h1 className="text-2xl font-bold">{printView.assessment.title}</h1>
          </div>
          <button onClick={() => window.print()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-brand px-4 text-sm font-semibold text-white shadow-glow hover:bg-brand-500">
            <Printer className="h-4 w-4" aria-hidden="true" />
            In / Lưu PDF
          </button>
        </div>

        <section className="border-b border-ink pb-4">
          <p className="text-sm font-semibold">Trung tâm Anh ngữ</p>
          <h2 className="mt-2 text-3xl font-bold">{printView.assessment.title}</h2>
          <p className="mt-1 text-sm">Ngày: {printView.assessment.assessment_date || "__________"}</p>
          {printView.assessment.description ? <p className="mt-3 text-sm">{printView.assessment.description}</p> : null}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <p>Họ và tên: ______________________________</p>
            <p>Lớp: ______________________________</p>
          </div>
        </section>

        <section className="mt-6 space-y-6">
          {printView.questions.map((question, index) => (
            <article key={question.id} className="break-inside-avoid">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-bold">Câu {index + 1}. {question.question_text}</h3>
                <span className="whitespace-nowrap text-sm font-semibold">{question.max_score} điểm</span>
              </div>
              {question.question_type === "multiple_choice" ? (
                <div className="mt-3 grid gap-2">
                  {question.choices.map((choice) => <p key={choice} className="text-sm">□ {choice}</p>)}
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="h-8 border-b border-ink/40" />
                  <div className="h-8 border-b border-ink/40" />
                  <div className="h-8 border-b border-ink/40" />
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
