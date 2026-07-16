import { LucideIcon, Inbox } from "lucide-react";
import { ReactNode } from "react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-brand-100 bg-brand-50/40 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand shadow-sm ring-1 ring-brand-100">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-body font-bold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-caption text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
