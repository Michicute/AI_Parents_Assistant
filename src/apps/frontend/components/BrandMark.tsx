import Image from "next/image";

import logoDark from "@/images/Logo_dark.png";
import logoLight from "@/images/Logo_light.png";

type BrandMarkProps = {
  compact?: boolean;
  className?: string;
  tone?: "light" | "dark";
};

export function BrandMark({ compact = false, className = "", tone = "light" }: BrandMarkProps) {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <Image
        src={tone === "dark" ? logoDark : logoLight}
        alt="Pippo Portal"
        className={compact ? "h-auto w-[112px] object-contain" : "h-auto w-[152px] object-contain"}
        priority
      />
    </div>
  );
}
