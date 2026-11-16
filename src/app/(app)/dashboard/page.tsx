import Link from "next/link";
import { AccountAvatar, PlatformBadge } from "@/components/PlatformBadge";
import { IconPlus } from "@/components/Icons";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/registry";
import { dayKey, formatTime, zonedLocalToUtcIso } from "@/lib/time";
import { getContext } from "@/lib/workspace";

export default async function Dashboard() {
  const { supabase, workspace, user } = await getContext();
  const tz = workspace.timezone;
  const today = dayKey(new Date().toISOString(), tz);
  const dayStart = zonedLocalToUtcIso(`${today}T00:00`, tz);
  const dayEnd = new Date(new Date(dayStart).getTime() + 86400_000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

  const count = (q: any) => q.then((r: { count: number | null }) => r.count ?? 0);
  const base = () => supabase.from("post_variants").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);

  const [scheduledToday, publishedToday, failedToday, published30, { data: cats }, { data: lib }, { data: slots }, { data: accounts }, { data: next }] = await Promise.all([
    count(base().eq("status", "scheduled").gte("scheduled_at", dayStart).lt("scheduled_at", dayEnd)),
    count(base().eq("status", "published").gte("published_at", dayStart).lt("published_at", dayEnd)),
    count(base().eq("status", "failed").gte("scheduled_at", dayStart).lt("scheduled_at", dayEnd)),
    count(base().eq("status", "published").gte("published_at", monthAgo)),
    supabase.from("content_categories").select("id,name,color").eq("workspace_id", workspace.id).order("sort"),
    supabase.from("posts").select("category_id").eq("workspace_id", workspace.id).eq("in_library", true),
    supabase.from("posting_slots").select("category_id"),
    supabase.from("social_accounts").select("id,platform,display_name,avatar_url,status").eq("workspace_id", workspace.id),
    supabase
      .from("post_variants")
      .select("id,post_id,scheduled_at,body,social_accounts(platform,display_name,avatar_url)")
      .eq("workspace_id", workspace.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(6),
  ]);

  const perCat = new Map<string, number>();
  for (const p of lib ?? []) if (p.category_id) perCat.set(p.category_id, (perCat.get(p.category_id) ?? 0) + 1);
  const slotsPerCat = new Map<string, number>();
  for (const s of slots ?? []) if (s.category_id) slotsPerCat.set(s.category_id, (slotsPerCat.get(s.category_id) ?? 0) + 1);
  const maxCat = Math.max(1, ...Array.from(perCat.values()));
  const byPlatform = new Map<PlatformId, number>();
  for (const a of accounts ?? []) byPlatform.set(a.platform as PlatformId, (byPlatform.get(a.platform as PlatformId) ?? 0) + 1);
  const hoursSaved = Math.round((published30 * 6) / 60); // ~6 minutes saved per post vs. posting by hand
  const name = (user.email ?? "").split("@")[0];

  return (
    <div className="mx-auto max-w-7xl">
      <header className="masthead">
        <div>
          <h1>Hello{name ? `, ${name.charAt(0).toUpperCase()}${name.slice(1)}` : ""}</h1>
          <p>Here&apos;s how {workspace.name}&apos;s social channels look today.</p>
        </div>
        <Link href="/compose" className="btn-primary btn-lg"><IconPlus /> Create post</Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Today */}
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-bold text-navy">Today</h2>
          {[
            { label: "Scheduled", value: scheduledToday, dot: "bg-harbour", href: "/posts?filter=upcoming" },
            { label: "Published", value: publishedToday, dot: "bg-green-600", href: "/posts?filter=published" },
            { label: "Failed", value: failedToday, dot: "bg-brand", href: "/posts?filter=failed" },
          ].map((r) => (
            <Link key={r.label} href={r.href} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-paper">
              <span className={`h-2.5 w-2.5 rounded-full ${r.dot}`} />
              <span className="flex-1 text-[15px]">{r.label}</span>
              <span className="font-display text-2xl font-bold text-navy">{r.value}</span>
            </Link>
          ))}
        </section>

        {/* Content across categories */}
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">Content by category</h2>
            <Link href="/content" className="text-sm font-semibold text-harbour hover:underline">Library</Link>
          </div>
          {(cats ?? []).length ? (
            <ul className="space-y-3">
              {(cats ?? []).map((c) => {
                const n = perCat.get(c.id) ?? 0;
                return (
                  <li key={c.id}>
                    <Link href={`/content?c=${c.id}`} className="block">
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted">{n} posts · {slotsPerCat.get(c.id) ?? 0}/week</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-paper">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(n ? 6 : 0, (n / maxCat) * 100)}%`, background: c.color }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="hint">No categories yet.</p>
          )}
        </section>

        {/* Time saved */}
        <section className="card flex flex-col items-center justify-center p-6 text-center">
          <h2 className="mb-4 self-start text-lg font-bold text-navy">Time saved, last 30 days</h2>
          <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full border-[10px] border-brand">
            <span className="font-display text-4xl font-bold text-navy">{hoursSaved}</span>
            <span className="text-sm text-muted">hours</span>
          </div>
          <p className="hint mt-4">{published30} posts published automatically (about 6 minutes saved each).</p>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        {/* Next posts */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 className="text-lg font-bold text-navy">Next posts</h2>
            <Link href="/calendar" className="text-sm font-semibold text-harbour hover:underline">Calendar</Link>
          </div>
          {(next ?? []).length ? (
            <ul className="divide-y divide-line">
              {(next ?? []).map((v: any) => (
                <li key={v.id}>
                  <Link href={`/posts?post=${v.post_id}`} className="flex items-center gap-3 px-6 py-3 hover:bg-paper">
                    {v.social_accounts && <AccountAvatar platform={v.social_accounts.platform} name={v.social_accounts.display_name} avatar={v.social_accounts.avatar_url} size={34} />}
                    <span className="min-w-0 flex-1 truncate text-[15px]">{v.body || "(media only)"}</span>
                    <span className="shrink-0 font-display text-sm font-semibold text-harbour">
                      {dayKey(v.scheduled_at, tz) === today ? "Today" : new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short" }).format(new Date(v.scheduled_at))}{" "}
                      {formatTime(v.scheduled_at, tz)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-6 py-10 text-center">
              <p className="hint">Nothing scheduled. Add posts to a category or queue a post.</p>
              <Link href="/compose" className="btn-primary mt-4">Create post</Link>
            </div>
          )}
        </section>

        {/* Connected accounts */}
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">
              Social accounts <span className="text-muted">({(accounts ?? []).length})</span>
            </h2>
            <Link href="/channels?add=1" className="btn-ghost btn-sm"><IconPlus /> Connect</Link>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {PLATFORMS.map((p) => {
              const n = byPlatform.get(p.id) ?? 0;
              return (
                <Link
                  key={p.id}
                  href={n ? "/channels" : "/channels?add=1"}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition hover:border-navy/30 ${n ? "border-green-200 bg-green-50" : "border-line bg-white"}`}
                >
                  <PlatformBadge platform={p.id} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className={`text-xs font-semibold ${n ? "text-green-700" : "text-harbour"}`}>{n ? `${n} ✓` : "+ Add"}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
