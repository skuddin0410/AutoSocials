const STYLES: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  pending_approval: "bg-purple-100 text-purple-800",
  scheduled: "bg-blue-100 text-blue-800",
  publishing: "bg-amber-100 text-amber-800",
  published: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-stone-100 text-stone-500 line-through",
};
const LABELS: Record<string, string> = { pending_approval: "Needs approval" };

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STYLES[status] ?? STYLES.draft}`}>
      {LABELS[status] ?? status}
    </span>
  );
}

export const STATUS_DOT: Record<string, string> = {
  draft: "bg-stone-400",
  pending_approval: "bg-purple-500",
  scheduled: "bg-blue-500",
  publishing: "bg-amber-500",
  published: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-stone-300",
};
