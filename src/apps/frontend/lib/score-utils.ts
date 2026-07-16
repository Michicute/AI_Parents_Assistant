import { ScoreResponse } from "@/lib/api";

export type SkillScoreSummary = {
  skill: ScoreResponse["skill"];
  average: number;
  latest: number;
  latestDate: string;
  count: number;
};

export function summarizeSkillScores(scores: ScoreResponse[]): SkillScoreSummary[] {
  const grouped = new Map<ScoreResponse["skill"], ScoreResponse[]>();
  for (const score of scores) {
    grouped.set(score.skill, [...(grouped.get(score.skill) ?? []), score]);
  }

  return Array.from(grouped.entries())
    .map(([skill, items]) => {
      const sorted = [...items].sort((a, b) => {
        const dateCompare = toTime(b.assessed_on) - toTime(a.assessed_on);
        if (dateCompare !== 0) return dateCompare;
        return toTime(b.created_at) - toTime(a.created_at);
      });
      const latest = sorted[0];
      return {
        skill,
        average: roundScore(items.reduce((sum, item) => sum + item.score, 0) / items.length),
        latest: roundScore(latest.score),
        latestDate: latest.assessed_on,
        count: items.length,
      };
    })
    .sort((a, b) => a.skill.localeCompare(b.skill));
}

function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}

function toTime(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
