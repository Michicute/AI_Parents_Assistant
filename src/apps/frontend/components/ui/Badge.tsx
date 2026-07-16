import { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  tone?: "brand" | "good" | "warning" | "danger" | "neutral";
  size?: "sm" | "md";
};

const tones = {
  brand: "bg-brand-50 text-brand ring-brand-100",
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-gold-light text-gold-dark ring-gold/30",
  danger: "bg-coral-light text-coral-dark ring-coral/30",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};

const sizes = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-3 py-1 text-caption",
};

export function Badge({ children, tone = "brand", size = "md" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ring-1 ring-inset ${tones[tone]} ${sizes[size]}`}>
      {children}
    </span>
  );
}
