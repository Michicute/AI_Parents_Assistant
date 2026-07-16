import { LucideIcon } from "lucide-react";

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  trend?: { value: string; positive: boolean };
  tone?: "brand" | "good" | "warm" | "neutral";
};

const iconTones = {
  brand: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  good: "bg-lime-100 text-lime-700 ring-lime-200",
  warm: "bg-green-100 text-green-700 ring-green-200",
  neutral: "bg-portal-mint text-portal-muted ring-portal-line",
};

export function MetricCard({ icon: Icon, label, value, detail, trend, tone = "brand" }: MetricCardProps) {
  const seed = [...`${label}${value}`].reduce((total, char) => total + char.charCodeAt(0), 0);
  const bars = Array.from({ length: 8 }, (_, index) => Math.max(24, ((seed + index * 17) % 72) + 20));

  return (
    <div className="portal-card portal-card-hover p-6">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-full ring-1 ${iconTones[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {trend ? (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${trend.positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {trend.positive ? "+" : ""}{trend.value}
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-sm font-medium text-portal-muted">{label}</p>
      <p className="font-display mt-3 text-[40px] leading-[1.13] tracking-[-0.02em] text-portal-ink">{value}</p>
      {detail ? <p className="mt-2 text-xs font-medium text-portal-muted"><span className="text-portal-green">↑</span> {detail}</p> : null}
      <div className="mt-4 flex h-10 items-end gap-1.5" aria-hidden="true">
        {bars.map((height, index) => (
          <span key={`${label}-${index}`} className="stat-spark-bar flex-1 rounded-t-full bg-portal-green opacity-80" style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }} />
        ))}
      </div>
    </div>
  );
}
