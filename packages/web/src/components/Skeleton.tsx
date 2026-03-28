/** Shimmer loading skeletons */

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`skeleton h-4 ${className}`} />;
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <div className="skeleton rounded-full" style={{ width: size, height: size }} />;
}

export function SkeletonCard() {
  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="aspect-[4/5] skeleton rounded-none" />
      <div className="p-4 space-y-3">
        <SkeletonLine className="w-2/3 h-6" />
        <SkeletonLine className="w-1/2 h-4" />
        <div className="flex gap-1.5">
          <SkeletonLine className="w-16 h-6 rounded-full" />
          <SkeletonLine className="w-20 h-6 rounded-full" />
          <SkeletonLine className="w-14 h-6 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonIntroCard() {
  return (
    <div className="card p-4 flex gap-3 animate-pulse">
      <SkeletonCircle size={48} />
      <div className="flex-1 space-y-2">
        <SkeletonLine className="w-1/3 h-5" />
        <SkeletonLine className="w-full h-4" />
        <SkeletonLine className="w-2/3 h-4" />
      </div>
    </div>
  );
}

export function SkeletonSettingsRow() {
  return (
    <div className="flex items-center justify-between py-3 animate-pulse">
      <SkeletonLine className="w-1/3 h-4" />
      <SkeletonLine className="w-11 h-6 rounded-full" />
    </div>
  );
}
