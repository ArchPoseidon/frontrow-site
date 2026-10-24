export function RadarSkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6" aria-busy="true" aria-label="Loading your radar">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-surface-border" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-56 animate-pulse rounded-card border border-surface-border bg-surface" />
        ))}
      </div>
    </main>
  );
}
