import Image from "next/image";
import { HTMLAttributes } from "react";

type AvatarProps = HTMLAttributes<HTMLSpanElement> & {
  name: string;
  size?: "sm" | "md" | "lg";
  src?: string;
};

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Avatar({ name, size = "md", src, className = "", ...props }: AvatarProps) {
  if (src) {
    return (
      <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizes[size]} ${className}`} {...props}>
        <Image src={src} alt={name} fill sizes="48px" className="object-cover" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand ${sizes[size]} ${className}`}
      aria-label={name}
      {...props}
    >
      {initials(name)}
    </span>
  );
}
