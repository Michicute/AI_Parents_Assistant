import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

export type SectionHeaderProps = {
  icon?: LucideIcon;
  badge?: string;
  label?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function SectionHeader({ icon: Icon, badge, label, title, description, action }: SectionHeaderProps) {
  const badgeText = badge || label;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-brand-100 bg-brand-50 text-brand shadow-sm">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          {badgeText ? <p className="mb-0.5 text-[11px] font-black uppercase tracking-[0.24em] text-brand">{badgeText}</p> : null}
          <h2 className="text-heading-3 text-ink">{title}</h2>
          {description ? <p className="mt-1 text-caption text-slate-500">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
