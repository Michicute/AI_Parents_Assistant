"use client";

import { useMemo, useState } from "react";
import { BookOpenCheck, History } from "lucide-react";
import type { ScoreResponse, StudentAssessmentSummaryResponse } from "@/lib/api";
import { summarizeSkillScores } from "@/lib/score-utils";

export function StudentGradeTables({
  studentName,
  scores,
  assessmentSummary,
  compact = false,
  highlightLowSkills = false,
}: {
  studentName?: string;
  scores: ScoreResponse[];
  assessmentSummary: StudentAssessmentSummaryResponse | null;
  compact?: boolean;
  highlightLowSkills?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"skills" | "assessments">("skills");
  const skillSummaries = useMemo(() => summarizeSkillScores(scores), [scores]);
  const lowSkills = useMemo(
    () => new Set(skillSummaries.filter((summary) => summary.average < 50 || summary.latest < 50).map((summary) => summary.skill)),
    [skillSummaries],
  );
  const sectionClass = compact ? "rounded-2xl border border-brand-100 bg-white p-4" : "rounded-lg border border-ink/10 bg-white p-4 shadow-panel";
  const emptyClass = compact ? "rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-ink-muted" : "rounded border border-ink/10 bg-paper p-3 text-sm text-ink/60";
  const rowClass = compact ? "bg-white" : "bg-paper";
  const headingClass = compact ? "text-base font-bold" : "text-lg font-bold";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("skills")}
          className={`min-h-10 rounded border px-4 text-sm font-semibold ${activeTab === "skills" ? "border-leaf bg-leaf text-white" : "border-ink/10 bg-white text-ink"}`}
        >
          Điểm kỹ năng
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("assessments")}
          className={`min-h-10 rounded border px-4 text-sm font-semibold ${activeTab === "assessments" ? "border-leaf bg-leaf text-white" : "border-ink/10 bg-white text-ink"}`}
        >
          Điểm bài kiểm tra
        </button>
      </div>

      {activeTab === "skills" ? (
        <>
          <section className={sectionClass}>
            <div className="mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-leaf" aria-hidden="true" />
              <h2 className={headingClass}>Bảng điểm kỹ năng{studentName ? ` - ${studentName}` : ""}</h2>
            </div>
            {skillSummaries.length === 0 ? (
              <p className={emptyClass}>Chưa có điểm kỹ năng. Điểm sẽ xuất hiện sau khi giáo viên lưu bài kiểm tra đã chấm.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-separate border-spacing-y-2 text-left text-sm">
                  <thead className="text-ink/55">
                    <tr>
                      <th className="px-3 py-2">Kỹ năng</th>
                      <th className="px-3 py-2">Điểm trung bình</th>
                      <th className="px-3 py-2">Điểm gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skillSummaries.map((summary) => {
                      const flagged = highlightLowSkills && lowSkills.has(summary.skill);
                      const skillRowClass = flagged ? "bg-coral-light/55 text-coral-dark" : rowClass;
                      const borderClass = flagged ? "border-coral/35" : "border-ink/10";
                      return (
                      <tr key={summary.skill} className={skillRowClass}>
                        <td className={`rounded-l border-y border-l px-3 py-3 font-semibold ${borderClass}`}>{summary.skill}</td>
                        <td className={`border-y px-3 py-3 font-bold ${borderClass}`}>{summary.average}%</td>
                        <td className={`rounded-r border-y border-r px-3 py-3 font-bold ${borderClass}`}>{summary.latest}%</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={sectionClass}>
            <div className="mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-leaf" aria-hidden="true" />
              <h2 className={headingClass}>Lịch sử điểm kỹ năng</h2>
            </div>
            {scores.length === 0 ? (
              <p className={emptyClass}>Chưa có lịch sử điểm.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-left text-sm">
                  <thead className="text-ink/55">
                    <tr>
                      <th className="px-3 py-2">Kỹ năng</th>
                      <th className="px-3 py-2">Điểm</th>
                      <th className="px-3 py-2">Ngày</th>
                      <th className="px-3 py-2">Nguồn</th>
                      <th className="px-3 py-2">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((score) => {
                      const flagged = highlightLowSkills && lowSkills.has(score.skill);
                      const skillRowClass = flagged ? "bg-coral-light/55 text-coral-dark" : rowClass;
                      const borderClass = flagged ? "border-coral/35" : "border-ink/10";
                      return (
                      <tr key={score.id} className={skillRowClass}>
                        <td className={`rounded-l border-y border-l px-3 py-3 font-semibold ${borderClass}`}>{score.skill}</td>
                        <td className={`border-y px-3 py-3 font-bold ${borderClass}`}>{score.score}%</td>
                        <td className={`border-y px-3 py-3 ${borderClass}`}>{score.assessed_on}</td>
                        <td className={`border-y px-3 py-3 ${borderClass}`}>Bài kiểm tra</td>
                        <td className={`rounded-r border-y border-r px-3 py-3 ${borderClass}`}>{score.teacher_comment || "-"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className={sectionClass}>
          <div className="mb-4 flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-leaf" aria-hidden="true" />
            <h2 className={headingClass}>Điểm bài kiểm tra{studentName ? ` - ${studentName}` : ""}</h2>
          </div>
          {!assessmentSummary || assessmentSummary.assessments.length === 0 ? (
            <p className={emptyClass}>Chưa có điểm bài kiểm tra.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-left text-sm">
                <thead className="text-ink/55">
                  <tr>
                    <th className="px-3 py-2">Bài kiểm tra</th>
                    <th className="px-3 py-2">Ngày</th>
                    <th className="px-3 py-2">Điểm</th>
                    <th className="px-3 py-2">Số câu</th>
                  </tr>
                </thead>
                <tbody>
                  {assessmentSummary.assessments.map((assessment) => (
                    <tr key={assessment.id} className={rowClass}>
                      <td className="rounded-l border-y border-l border-ink/10 px-3 py-3 font-semibold">{assessment.title}</td>
                      <td className="border-y border-ink/10 px-3 py-3">{assessment.assessment_date || "-"}</td>
                      <td className="border-y border-ink/10 px-3 py-3 font-bold">{assessment.total_score === null ? "Chưa lưu" : `${assessment.total_score}/${assessment.max_score}`}</td>
                      <td className="rounded-r border-y border-r border-ink/10 px-3 py-3">{assessment.questions.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
