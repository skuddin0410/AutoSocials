import Link from "next/link";
import { AccountAvatar } from "@/components/PlatformBadge";
import { StatusPill } from "@/components/StatusPill";
import type { PlatformId } from "@/lib/platforms/registry";
import { formatDateTime } from "@/lib/time";
import { canEdit, getContext, isAdmin } from "@/lib/workspace";
import { approvePost, cancelVariant, deletePost, retryVariant } from "./actions";

type Variant = {
  id: string;
  post_id: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  body: string;
  external_url: string | null;
  last_error: string | null;
  attempts: number;
  social_accounts: { platform: PlatformId; display_name: string | null; avatar_url: string | null } | null;
};

const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "pending_approval", label: "Needs approval" },
  { key: "failed", label: "Failed" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "all", label: "All" },
];

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ filter?: string; post?: string }> }) {
  const sp = await searchParams;
  const filter = sp.filter ?? (sp.post ? "all" : "upcoming");
  const { supabase, workspace, role } = await getContext();
  const tz = workspace.timezone;

  let q = supabase
    .from("post_variants")
    .select("id,post_id,status,scheduled_at,published_at,body,external_url,last_error,attempts,social_accounts(platform,display_name,avatar_url)")
    .eq("workspace_id", workspace.id)
    .limit(300);
  if (sp.post) q = q.eq("post_id", sp.post);
  if (filter === "upcoming") q = q.in("status", ["scheduled", "publishing", "pending_approval"]).order("scheduled_at", { ascending: true });
  else if (filter !== "all") q = q.eq("status", filter).order("scheduled_at", { ascending: false, nullsFirst: true });
  else q = q.order("scheduled_at", { ascending: false, nullsFirst: true });
  const { data } = await q;
  const variants = (data ?? []) as unknown as Variant[];

  const groups = new Map<string, Variant[]>();
  for (const v of variants) groups.set(v.post_id, [...(groups.get(v.post_id) ?? []), v]);
  const editor = canEdit(role);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">All posts</h1>
          <p className="text-sm text-muted">Status of every post on every channel.</p>
        </div>
        <Link href="/compose" className="btn-primary">+ Create post</Link>
      </header>

      <nav className="mb-5 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/posts?filter=${f.key}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${filter === f.key && !sp.post ? "bg-ink text-white" : "text-muted hover:bg-stone-100"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {!groups.size && <div className="card p-10 text-center text-sm text-muted">Nothing here yet.</div>}

      <div className="space-y-4">
        {Array.from(groups.entries()).map(([postId, vs]) => {
          const first = vs[0];
          const needsApproval = vs.some((v) => v.status === "pending_approval");
          return (
            <article key={postId} className="card">
              <div className="flex flex-wrap items-start gap-4 border-b border-line p-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs text-muted">
                    {first.scheduled_at ? formatDateTime(first.scheduled_at, tz) : "Not scheduled"}
                  </div>
                  <p className="line-clamp-3 whitespace-pre-line text-sm">{first.body || "(media only)"}</p>
                </div>
                {editor && (
                  <div className="flex gap-2">
                    {needsApproval && isAdmin(role) && (
                      <form action={approvePost}>
                        <input type="hidden" name="post_id" value={postId} />
                        <button className="btn-primary py-1.5">Approve</button>
                      </form>
                    )}
                    <form action={deletePost}>
                      <input type="hidden" name="post_id" value={postId} />
                      <button className="btn-danger py-1.5">Delete</button>
                    </form>
                  </div>
                )}
              </div>
              <ul className="divide-y divide-line">
                {vs.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    {v.social_accounts && (
                      <AccountAvatar platform={v.social_accounts.platform} name={v.social_accounts.display_name} avatar={v.social_accounts.avatar_url} size={28} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{v.social_accounts?.display_name ?? "Removed channel"}</span>
                    {v.last_error && (
                      <span className="max-w-xs truncate text-xs text-red-700" title={v.last_error}>
                        {v.last_error}
                      </span>
                    )}
                    <StatusPill status={v.status} />
                    {v.external_url && (
                      <a href={v.external_url} target="_blank" className="text-xs underline">View</a>
                    )}
                    {editor && ["failed", "cancelled", "draft"].includes(v.status) && (
                      <form action={retryVariant}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="text-xs font-medium text-blue-700 hover:underline">{v.status === "failed" ? "Retry now" : "Publish now"}</button>
                      </form>
                    )}
                    {editor && ["scheduled", "pending_approval", "draft", "failed"].includes(v.status) && (
                      <form action={cancelVariant}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="text-xs text-muted hover:text-ink">Cancel</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
