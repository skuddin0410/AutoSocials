/** Shown instantly on every navigation while the server renders the next page. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-8 border-b border-line pb-6">
        <div className="h-9 w-64 rounded-lg bg-line" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-line/70" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-white ring-1 ring-line" />
        ))}
      </div>
      <div className="mt-6 h-80 rounded-2xl bg-white ring-1 ring-line" />
    </div>
  );
}
