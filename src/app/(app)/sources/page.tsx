import Link from "next/link";
import { AccountAvatar } from "@/components/PlatformBadge";
import { aiEnabled } from "@/lib/ai";
import type { PlatformId } from "@/lib/platforms/registry";
import { formatDateTime } from "@/lib/time";
import { getContext, isAdmin } from "@/lib/workspace";
import { addSource, deleteSource, updateSource } from "./actions";

type Account = { id: string; platform: PlatformId; display_name: string | null; avatar_url: string | null };

function ChannelPicker({ accounts, selected }: { accounts: Account[]; selected?: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((a) => (
        <label key={a.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-2 border-line py-1 pl-1 pr-3.5 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="checkbox" name="account" value={a.id} defaultChecked={!selected?.length || selected.includes(a.id)} className="sr-only" />
          <AccountAvatar platform={a.platform} name={a.display_name} avatar={a.avatar_url} size={28} />
          <span className="text-sm font-medium">{a.display_name}</span>
        </label>
      ))}
    </div>
  );
}

export default async function SourcesPage() {
  const { supabase, workspace, role } = await getContext();
  const admin = isAdmin(role);
  const [{ data: sources }, { data: accounts }, { data: recent }] = await Promise.all([
    supabase.from("content_sources").select("*").eq("workspace_id", workspace.id).order("created_at"),
    supabase.from("social_accounts").select("id,platform,display_name,avatar_url").eq("workspace_id", workspace.id).eq("status", "active").order("platform"),
    supabase
      .from("source_items")
      .select("id,title,link,created_at,post_id,content_sources!inner(workspace_id,name)")
      .eq("content_sources.workspace_id", workspace.id)
      .not("post_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const ai = aiEnabled();

  return (
    <div className="mx-auto max-w-5xl">
      <header className="masthead">
        <div>
          <h1>Auto-post from website</h1>
          <p>New articles on your website become social posts automatically, checked every 15 minutes.</p>
        </div>
      </header>

      {!ai && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          AI captions are off, so posts use the article title, summary and link. Add <code className="font-semibold">ANTHROPIC_API_KEY</code> in Netlify to have AI write each platform&apos;s caption.
        </div>
      )}

      <div className="space-y-5">
        {(sources ?? []).map((s) => (
          <form key={s.id} action={updateSource} className="card space-y-5 p-6">
            <input type="hidden" name="id" value={s.id} />
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-navy">{s.name}</h2>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-harbour hover:underline">{s.url}</a>
                <p className="hint mt-1">
                  {s.last_checked_at ? `Last checked ${formatDateTime(s.last_checked_at, workspace.timezone)}` : "Not checked yet: the first check runs within a minute."}
                  {s.last_error && <span className="text-brand-dark"> · Error: {s.last_error}</span>}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="active" defaultChecked={s.active} disabled={!admin} className="h-5 w-5 accent-[#d71920]" /> On
              </label>
            </div>
            <fieldset disabled={!admin} className="space-y-5">
              <div>
                <span className="label">What happens to new articles</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer gap-3 rounded-xl border-2 border-line p-4 has-[:checked]:border-navy">
                    <input type="radio" name="mode" value="draft" defaultChecked={s.mode === "draft"} className="mt-1 accent-[#101828]" />
                    <span><span className="block font-semibold">Save as drafts</span><span className="hint">The team picks which ones to post from Queue › Drafts.</span></span>
                  </label>
                  <label className="flex cursor-pointer gap-3 rounded-xl border-2 border-line p-4 has-[:checked]:border-navy">
                    <input type="radio" name="mode" value="queue" defaultChecked={s.mode === "queue"} className="mt-1 accent-[#101828]" />
                    <span><span className="block font-semibold">Add to queue automatically</span><span className="hint">Each article goes out at the channel&apos;s next posting time.</span></span>
                  </label>
                </div>
              </div>
              <div>
                <span className="label">Post to</span>
                <ChannelPicker accounts={(accounts ?? []) as Account[]} selected={s.account_ids} />
              </div>
              <label className="flex items-center gap-2.5 text-[15px]">
                <input type="checkbox" name="use_ai" defaultChecked={s.use_ai} className="h-5 w-5 accent-[#1e5aa8]" /> Write captions with AI for each platform
              </label>
              {admin && (
                <div className="flex gap-2">
                  <button className="btn-primary">Save</button>
                </div>
              )}
            </fieldset>
          </form>
        ))}
        {admin &&
          (sources ?? []).map((s) => (
            <form key={`del-${s.id}`} action={deleteSource} className="-mt-3 text-right">
              <input type="hidden" name="id" value={s.id} />
              <button className="text-sm font-semibold text-brand hover:underline">Remove {s.name}</button>
            </form>
          ))}
      </div>

      {admin && (
        <form action={addSource} className="card mt-8 space-y-5 p-6">
          <h2 className="text-lg font-bold text-navy">{(sources ?? []).length ? "Add another website" : "Connect your website"}</h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" name="name" className="input" defaultValue={(sources ?? []).length ? "" : "CanadianSME articles"} required />
            </div>
            <div>
              <label className="label" htmlFor="url">RSS feed address</label>
              <input id="url" name="url" className="input" defaultValue={(sources ?? []).length ? "" : "https://canadiansme.ca/feed"} placeholder="https://example.com/feed" required />
            </div>
          </div>
          <div>
            <span className="label">Post to</span>
            {(accounts ?? []).length ? <ChannelPicker accounts={(accounts ?? []) as Account[]} /> : <p className="hint">No channels yet. Connect some on the Channels page; new articles will be saved until then.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-[15px]"><input type="radio" name="mode" value="draft" defaultChecked className="accent-[#101828]" /> Save as drafts</label>
            <label className="flex items-center gap-2 text-[15px]"><input type="radio" name="mode" value="queue" className="accent-[#101828]" /> Add to queue automatically</label>
            <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" name="use_ai" defaultChecked className="accent-[#1e5aa8]" /> Write captions with AI</label>
          </div>
          <p className="hint">On the first check, only the 3 newest articles become posts; older ones are skipped.</p>
          <button className="btn-primary">Start auto-posting</button>
        </form>
      )}

      {(recent ?? []).length > 0 && (
        <section className="card mt-8 overflow-hidden">
          <h2 className="border-b border-line px-6 py-4 text-lg font-bold text-navy">Recently turned into posts</h2>
          <ul className="divide-y divide-line">
            {(recent ?? []).map((r: any) => (
              <li key={r.id} className="flex items-center gap-4 px-6 py-3">
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <Link href={`/posts?post=${r.post_id}`} className="btn-ghost btn-sm">Open post</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
