type StatusPillProps = {
  label: string;
  tone: "good" | "watch" | "neutral";
};

const tones = {
  good: "border-brand-200 bg-brand-50 text-brand before:bg-brand",
  watch: "border-coral/30 bg-coral/10 text-coral before:bg-coral",
  neutral: "border-slate-200 bg-white text-slate-600 before:bg-slate-300",
};

export function StatusPill({ label, tone }: StatusPillProps) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black before:h-1.5 before:w-1.5 before:rounded-full ${tones[tone]}`}>{label}</span>;
}
