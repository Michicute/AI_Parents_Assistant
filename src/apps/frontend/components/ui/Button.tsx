import { ButtonHTMLAttributes, forwardRef } from "react";
import { LucideIcon } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
};

const variants = {
  primary: "bg-brand text-white shadow-glow hover:bg-brand-500 active:bg-brand-600 focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
  secondary: "border border-brand-200 bg-white text-brand hover:bg-brand-50 active:bg-brand-100 focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
  ghost: "text-ink-muted hover:bg-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
  danger: "bg-coral text-white shadow-sm hover:bg-coral-dark active:opacity-90 focus-visible:ring-2 focus-visible:ring-coral-light focus-visible:ring-offset-2 focus-visible:ring-offset-white",
};

const sizes = {
  sm: "min-h-9 gap-1.5 px-3 text-caption font-bold",
  md: "min-h-11 gap-2 px-4 text-body font-bold",
  lg: "min-h-12 gap-2 px-5 text-body-lg font-bold",
};

const iconSizes = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-5 w-5" };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", size = "md", icon: Icon, iconRight: IconRight, loading, className = "", children, disabled, ...props }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex cursor-pointer items-center justify-center rounded-xl transition-all disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <span className={`animate-spin rounded-full border-2 border-current border-t-transparent ${iconSizes[size]}`} />
        ) : Icon ? (
          <Icon className={iconSizes[size]} aria-hidden="true" />
        ) : null}
        {children}
        {IconRight && !loading ? <IconRight className={iconSizes[size]} aria-hidden="true" /> : null}
      </button>
    );
  },
);
