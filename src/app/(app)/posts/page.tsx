import Link from "next/link";
import { AccountAvatar } from "@/components/PlatformBadge";
import { StatusPill } from "@/components/StatusPill";
import type { PlatformId } from "@/lib/platforms/registry";
import { formatDateTime } from "@/lib/time";
import { canEdit, getContext, isAdmin } from "@/lib/workspace";
import { approvePost, cancelVariant, deletePost, publishDraftPostNow, queueDraftPost, retryVariant } from "./actions";

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
  { key: "published", label: "Sent" },
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
      <header className="masthead">
        <div>
          <h1>Queue</h1>
          <p>See what went out, what's coming up and what needs a second try.</p>
        </div>
        <Link href="/compose" className="btn-primary">Create post</Link>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/posts?filter=${f.key}`}
            className={`min-h-10 rounded-full px-4 py-2 font-display text-sm font-semibold ${filter === f.key && !sp.post ? "bg-navy text-white" : "bg-white text-muted ring-1 ring-line hover:text-ink"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {!groups.size && <div className="card p-12 text-center"><p className="font-display text-lg font-semibold text-navy">No posts here</p><p className="hint mt-1">Create a post and it will show up in this list.</p><Link href="/compose" className="btn-primary mt-5">Create post</Link></div>}

      <div className="space-y-4">
        {Array.from(groups.entries()).map(([postId, vs]) => {
          const first = vs[0];
          const needsApproval = vs.some((v) => v.status === "pending_approval");
          return (
            <article key={postId} className="card">
              <div className="flex flex-wrap items-start gap-4 border-b border-line p-5">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 font-display text-sm font-semibold text-harbour">
                    {first.scheduled_at ? formatDateTime(first.scheduled_at, tz) : "Not scheduled"}
                  </div>
                  <p className="line-clamp-3 whitespace-pre-line text-[15px] leading-relaxed">{first.body || "(media only)"}</p>
                </div>
                {editor && (
                  <div className="flex flex-wrap gap-2">
                    {vs.some((v) => v.status === "draft") && (
                      <>
                        <form action={queueDraftPost}>
                          <input type="hidden" name="post_id" value={postId} />
                          <button className="btn-blue btn-sm">Add to queue</button>
                        </form>
                        <form action={publishDraftPostNow}>
                          <input type="hidden" name="post_id" value={postId} />
                          <button className="btn-primary btn-sm">Publish now</button>
                        </form>
                      </>
                    )}
                    {needsApproval && isAdmin(role) && (
                      <form action={approvePost}>
                        <input type="hidden" name="post_id" value={postId} />
                        <button className="btn-primary btn-sm">Approve</button>
                      </form>
                    )}
                    <form action={deletePost}>
                      <input type="hidden" name="post_id" value={postId} />
                      <button className="btn-danger btn-sm">Delete</button>
                    </form>
                  </div>
                )}
              </div>
              <ul className="divide-y divide-line">
                {vs.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    {v.social_accounts && (
                      <AccountAvatar platform={v.social_accounts.platform} name={v.social_accounts.display_name} avatar={v.social_accounts.avatar_url} size={34} />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{v.social_accounts?.display_name ?? "Removed channel"}</span>
                    {v.last_error && (
                      <span className="max-w-xs truncate text-xs text-red-700" title={v.last_error}>
                        {v.last_error}
                      </span>
                    )}
                    <StatusPill status={v.status} />
                    {v.external_url && (
                      <a href={v.external_url} target="_blank" className="btn-ghost btn-sm">View post</a>
                    )}
                    {editor && ["failed", "cancelled", "draft"].includes(v.status) && (
                      <form action={retryVariant}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="btn-blue btn-sm">{v.status === "failed" ? "Retry now" : "Publish now"}</button>
                      </form>
                    )}
                    {editor && ["scheduled", "pending_approval", "draft", "failed"].includes(v.status) && (
                      <form action={cancelVariant}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="btn-ghost btn-sm">Cancel</button>
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
