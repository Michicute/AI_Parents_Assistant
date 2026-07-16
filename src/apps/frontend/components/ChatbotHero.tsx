import { Bot, MessageCircleHeart, Sparkles } from "lucide-react";

type ChatbotHeroProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: {
    outer: "h-14 w-14 rounded-xl",
    bot: "h-7 w-7",
    bubble: "h-4 w-4",
  },
  md: {
    outer: "h-20 w-20 rounded-2xl",
    bot: "h-10 w-10",
    bubble: "h-6 w-6",
  },
  lg: {
    outer: "h-32 w-32 rounded-[1.5rem]",
    bot: "h-16 w-16",
    bubble: "h-8 w-8",
  },
};

export function ChatbotHero({ size = "md", className = "" }: ChatbotHeroProps) {
  const current = sizes[size];

  return (
    <div className={`relative ${current.outer} ${className}`}>
      <div className="relative grid h-full w-full place-items-center overflow-hidden rounded-[inherit] border border-[#d9e2d3] bg-white shadow-soft">
        <div className="relative grid h-[68%] w-[68%] place-items-center rounded-[1rem] bg-brand-50 text-brand">
          <Bot className={current.bot} aria-hidden="true" />
        </div>
      </div>
      <span className={`absolute -right-1.5 -top-1.5 grid ${current.bubble} place-items-center rounded-full bg-brand text-white shadow-soft`}>
        <Sparkles className="h-3 w-3" aria-hidden="true" />
      </span>
      <span className={`absolute -bottom-1.5 -left-1.5 grid ${current.bubble} place-items-center rounded-full bg-white text-brand shadow-soft ring-1 ring-[#d9e2d3]`}>
        <MessageCircleHeart className="h-3 w-3" aria-hidden="true" />
      </span>
    </div>
  );
}
