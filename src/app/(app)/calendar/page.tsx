import Link from "next/link";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@/components/Icons";
import { PlatformBadge } from "@/components/PlatformBadge";
import { STATUS_DOT } from "@/components/StatusPill";
import type { PlatformId } from "@/lib/platforms/registry";
import { dayKey, formatTime, zonedLocalToUtcIso } from "@/lib/time";
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
  const { data } = await supabase
    .from("post_variants")
    .select("id,post_id,status,scheduled_at,body,social_accounts(platform,display_name)")
    .eq("workspace_id", workspace.id)
    .gte("scheduled_at", from)
    .lt("scheduled_at", to)
    .neq("status", "cancelled")
    .order("scheduled_at");

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
