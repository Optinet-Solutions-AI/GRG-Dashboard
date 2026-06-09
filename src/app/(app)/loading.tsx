// Shown instantly on navigation between sections while the server component
// fetches data — makes section switches feel immediate.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
