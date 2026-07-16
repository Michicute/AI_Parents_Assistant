import { HTMLAttributes, ReactNode } from "react";
import { LucideIcon } from "lucide-react";

type PageSectionProps = HTMLAttributes<HTMLElement> & {
  icon?: LucideIcon;
  badge?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function PageSection({ icon: Icon, badge, title, subtitle, action, children, className = "", ...props }: PageSectionProps) {
  return (
    <section className={`portal-section ${className}`} {...props}>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div>
            {badge && <p className="portal-badge mb-1">{badge}</p>}
            <h2 className="text-heading-2">{title}</h2>
            {subtitle && <p className="mt-1 text-body text-ink-muted">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
