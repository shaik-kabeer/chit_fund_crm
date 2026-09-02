function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className || ''}`} />;
}

export default function AdminDashboardLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-48" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-5 border">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-9 w-16" />
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-6 space-y-4">
            <Skeleton className="h-6 w-40" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex justify-between items-center py-2">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
