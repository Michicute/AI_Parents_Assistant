type SkeletonProps = {
  className?: string;
  variant?: "text" | "circle" | "card" | "metric";
};

export function Skeleton({ className = "", variant = "text" }: SkeletonProps) {
  const base = "skeleton";
  const variants = {
    text: `${base} h-4 w-full ${className}`,
    circle: `${base} h-12 w-12 rounded-full ${className}`,
    card: `${base} h-40 w-full rounded-4xl ${className}`,
    metric: `${base} h-32 w-full rounded-4xl ${className}`,
  };
  return <div className={variants[variant]} />;
}

export function SkeletonMetricGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="portal-card space-y-4">
          <Skeleton variant="circle" />
          <Skeleton className="w-1/3" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-4xl" />
      ))}
    </div>
  );
}
