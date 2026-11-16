import Link from "next/link";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@/components/Icons";
import { PlatformBadge } from "@/components/PlatformBadge";
import { STATUS_DOT } from "@/components/StatusPill";
import type { PlatformId } from "@/lib/platforms/registry";
import { StatusPill } from "@/components/StatusPill";
import { dayKey, formatDateTime, formatTime, zonedLocalToUtcIso } from "@/lib/time";
import { getContext } from "@/lib/workspace";

type Row = {
  id: string;
  post_id: string;
  status: string;
  scheduled_at: string;
  body: string;
  social_accounts: { platform: PlatformId; display_name: string | null } | null;
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase, workspace } = await getContext();
  const tz = workspace.timezone;
  const todayKey = dayKey(new Date().toISOString(), tz);
  const month = /^\d{4}-\d{2}$/.test((await searchParams).month ?? "") ? (await searchParams).month! : todayKey.slice(0, 7);
  const [y, m] = month.split("-").map(Number);

  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay(); // Sunday-start grid
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  const from = zonedLocalToUtcIso(`${month}-01T00:00`, tz);
  const to = zonedLocalToUtcIso(`${next}-01T00:00`, tz);
  const monthQuery = supabase
    .from("post_variants")
    .select("id,post_id,status,scheduled_at,body,social_accounts(platform,display_name)")
    .eq("workspace_id", workspace.id)
    .gte("scheduled_at", from)
    .lt("scheduled_at", to)
    .neq("status", "cancelled")
    .order("scheduled_at");

  // "Coming up" (next 14 days) and quick stats, shown above the month grid.
  const nowIso = new Date().toISOString();
  const in14 = new Date(Date.now() + 14 * 86400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [{ data }, { data: upcomingRows }, scheduled7, published7, failed, approval] = await Promise.all([
    monthQuery,
    supabase
      .from("post_variants")
      .select("id,post_id,status,scheduled_at,body,social_accounts(platform,display_name)")
      .eq("workspace_id", workspace.id)
      .in("status", ["scheduled", "pending_approval", "publishing"])
      .gte("scheduled_at", new Date(Date.now() - 3600_000).toISOString())
      .lte("scheduled_at", in14)
      .order("scheduled_at")
      .limit(200),
    supabase.from("post_variants").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "scheduled").gte("scheduled_at", nowIso).lte("scheduled_at", new Date(Date.now() + 7 * 86400_000).toISOString()),
    supabase.from("post_variants").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "published").gte("published_at", weekAgo),
    supabase.from("post_variants").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "failed"),
    supabase.from("post_variants").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "pending_approval"),
  ]);
  const upcoming = new Map<string, Row[]>();
  for (const r of (upcomingRows ?? []) as unknown as Row[]) upcoming.set(r.post_id, [...(upcoming.get(r.post_id) ?? []), r]);
  const upcomingPosts = Array.from(upcoming.values()).slice(0, 8);
  const stats = [
    { label: "Scheduled, next 7 days", value: scheduled7.count ?? 0, href: "/posts?filter=upcoming", tone: "text-harbour" },
    { label: "Published, last 7 days", value: published7.count ?? 0, href: "/posts?filter=published", tone: "text-green-700" },
    { label: "Need approval", value: approval.count ?? 0, href: "/posts?filter=pending_approval", tone: "text-purple-700" },
    { label: "Failed", value: failed.count ?? 0, href: "/posts?filter=failed", tone: (failed.count ?? 0) > 0 ? "text-brand" : "text-muted" },
  ];

  // Group by day, then by post (one card per post, with a badge per channel).
  const byDay = new Map<string, Map<string, Row[]>>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const k = dayKey(r.scheduled_at, tz);
    if (!byDay.has(k)) byDay.set(k, new Map());
    const posts = byDay.get(k)!;
    posts.set(r.post_id, [...(posts.get(r.post_id) ?? []), r]);
  }

  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const monthName = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="masthead">
        <div>
          <h1>{monthName}</h1>
          <p>{workspace.name} calendar. Times shown in {tz.replace("_", " ")}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/calendar?month=${prev}`} className="btn-ghost px-3" aria-label="Previous month"><IconChevronLeft /></Link>
          <Link href="/calendar" className="btn-ghost">Today</Link>
          <Link href={`/calendar?month=${next}`} className="btn-ghost px-3" aria-label="Next month"><IconChevronRight /></Link>
          <Link href="/compose" className="btn-primary"><IconPlus /> Create post</Link>
        </div>
      </header>

      {/* Coming up: the next two weeks, newest first, before the month view */}
      <section className="mb-8 grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 className="text-xl font-bold text-navy">Coming up</h2>
            <Link href="/posts?filter=upcoming" className="text-sm font-semibold text-harbour hover:underline">See all upcoming</Link>
          </div>
          {upcomingPosts.length ? (
            <ul className="divide-y divide-line">
              {upcomingPosts.map((vs) => {
                const v = vs[0];
                return (
                  <li key={v.post_id}>
                    <Link href={`/posts?post=${v.post_id}`} className="flex items-center gap-5 px-6 py-4 hover:bg-paper">
                      <div className="w-28 shrink-0">
                        <div className="font-display text-sm font-semibold text-harbour">{formatDateTime(v.scheduled_at, tz).split(",").slice(0, 2).join(",")}</div>
                        <div className="text-sm text-muted">{formatTime(v.scheduled_at, tz)}</div>
                      </div>
                      <p className="line-clamp-2 min-w-0 flex-1 text-[15px] text-ink">{v.body || "(media only)"}</p>
                      <span className="flex shrink-0 -space-x-1">
                        {vs.slice(0, 6).map((x) => x.social_accounts && <PlatformBadge key={x.id} platform={x.social_accounts.platform} size={24} />)}
                        {vs.length > 6 && <span className="pl-2 text-xs text-muted">+{vs.length - 6}</span>}
                      </span>
                      <StatusPill status={vs.some((x) => x.status === "pending_approval") ? "pending_approval" : v.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-6 py-10 text-center">
              <p className="font-display text-lg font-semibold text-navy">Nothing scheduled for the next two weeks</p>
              <p className="hint mt-1">Plan a few posts so CanadianSME&apos;s channels stay active.</p>
              <Link href="/compose" className="btn-primary mt-5">Create post</Link>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-1">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="card flex items-center justify-between px-5 py-4 hover:border-navy/30">
              <span className="text-sm font-medium text-muted">{s.label}</span>
              <span className={`font-display text-3xl font-bold ${s.tone}`}>{s.value}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-navy text-sm font-semibold text-white/85">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-3 py-3 font-display">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const key = d ? `${month}-${String(d).padStart(2, "0")}` : "";
            const posts = d ? byDay.get(key) : undefined;
            return (
              <div key={i} className={`min-h-36 border-b border-r border-line p-2 ${d ? "" : "bg-paper"} ${(i + 1) % 7 === 0 ? "border-r-0" : ""}`}>
                {d && (
                  <div className={`mb-1 text-xs ${key === todayKey ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand font-display text-sm font-semibold text-white" : "font-display text-sm font-medium text-muted"}`}>
                    {d}
                  </div>
                )}
                <div className="space-y-1">
                  {posts &&
                    Array.from(posts.values()).map((variants) => {
                      const v = variants[0];
                      const worst = variants.find((x) => x.status === "failed")?.status ?? v.status;
                      return (
                        <Link
                          key={v.post_id}
                          href={`/posts?post=${v.post_id}`}
                          className="block rounded-lg border border-line bg-white p-2 text-[13px] shadow-sm hover:border-harbour"
                        >
                          <div className="mb-1 flex items-center gap-1">
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[worst]}`} />
                            <span className="font-medium">{formatTime(v.scheduled_at, tz)}</span>
                            <span className="ml-auto flex -space-x-1">
                              {variants.slice(0, 5).map((x) => x.social_accounts && <PlatformBadge key={x.id} platform={x.social_accounts.platform} size={14} />)}
                              {variants.length > 5 && <span className="pl-1.5 text-[10px] text-muted">+{variants.length - 5}</span>}
                            </span>
                          </div>
                          <div className="line-clamp-2 text-ink/80">{v.body || "(media only)"}</div>
                        </Link>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
