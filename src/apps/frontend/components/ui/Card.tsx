import { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div";
  variant?: "default" | "outlined" | "elevated" | "brand";
  padding?: "sm" | "md" | "lg";
};

const variants = {
  default: "border border-brand-100/70 bg-white/95 shadow-card",
  outlined: "border border-brand-100 bg-white/90",
  elevated: "border border-white/80 bg-white shadow-soft",
  brand: "border border-brand-200 bg-gradient-to-br from-brand-50 to-white shadow-card",
};

const paddings = {
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export function Card({ as: Component = "section", variant = "default", padding = "md", className = "", ...props }: CardProps) {
  return <Component className={`rounded-2xl transition-shadow hover:shadow-card-hover ${variants[variant]} ${paddings[padding]} ${className}`} {...props} />;
}
