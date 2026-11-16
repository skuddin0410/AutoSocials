const STYLES: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  pending_approval: "bg-purple-100 text-purple-800",
  scheduled: "bg-harbour-soft text-harbour",
  publishing: "bg-amber-100 text-amber-800",
  published: "bg-green-100 text-green-800",
  failed: "bg-brand-soft text-brand-dark",
  cancelled: "bg-stone-100 text-stone-500 line-through",
};
const LABELS: Record<string, string> = { pending_approval: "Needs approval" };

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[13px] font-semibold capitalize ${STYLES[status] ?? STYLES.draft}`}>
      {LABELS[status] ?? status}
    </span>
  );
}

export const STATUS_DOT: Record<string, string> = {
  draft: "bg-stone-400",
  pending_approval: "bg-purple-500",
  scheduled: "bg-harbour",
  publishing: "bg-amber-500",
  published: "bg-green-500",
  failed: "bg-brand",
  cancelled: "bg-stone-300",
};
