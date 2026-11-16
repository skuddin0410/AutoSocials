import { AccountAvatar } from "@/components/PlatformBadge";
import type { PlatformId } from "@/lib/platforms/registry";
import { canEdit, getContext } from "@/lib/workspace";
import { addSlots, applyRecommended, clearSlots, removeSlot } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
};

export default async function TimesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const sp = await searchParams;
  const { supabase, workspace, role } = await getContext();
  const { data: cats } = await supabase.from("content_categories").select("id,name,color").eq("workspace_id", workspace.id).order("sort");
  const catById = new Map((cats ?? []).map((c) => [c.id, c]));
  const editor = canEdit(role);
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id,platform,display_name,avatar_url,region")
    .eq("workspace_id", workspace.id)
    .order("platform");
  const ids = (accounts ?? []).map((a) => a.id);
  const { data: slots } = ids.length
    ? await supabase.from("posting_slots").select("id,account_id,day_of_week,local_time,category_id").in("account_id", ids).order("local_time")
    : { data: [] as { id: string; account_id: string; day_of_week: number; local_time: string; category_id: string | null }[] };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="masthead">
        <div>
          <h1>Scheduler</h1>
          <p>Your weekly posting timetable. General times take posts you queue; category times are filled automatically from that category&apos;s library. Times in {workspace.timezone.replace("_", " ")}.</p>
        </div>
        {editor && (accounts ?? []).length > 0 && (
          <form action={applyRecommended}>
            <button className="btn-blue">Add recommended times</button>
          </form>
        )}
      </header>

      {!(accounts ?? []).length ? (
        <div className="card p-12 text-center">
          <p className="font-display text-lg font-semibold text-navy">Connect a channel first</p>
          <a href="/channels" className="btn-primary mt-5">Go to Channels</a>
        </div>
      ) : (
        <>
          {editor && (
            <form action={addSlots} className="card mb-8 space-y-5 p-6">
              <h2 className="text-lg font-bold text-navy">Add a posting time</h2>
              <div>
                <span className="label">Channels</span>
                <div className="flex flex-wrap gap-2">
                  {(accounts ?? []).map((a) => (
                    <label key={a.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-line py-1 pl-1 pr-4 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                      <input type="checkbox" name="account" value={a.id} defaultChecked className="sr-only" />
                      <AccountAvatar platform={a.platform as PlatformId} name={a.display_name} avatar={a.avatar_url} size={30} />
                      <span className="text-sm font-medium">{a.display_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <span className="label">Days</span>
                  <div className="flex gap-1.5">
                    {DAYS.map((d, i) => (
                      <label key={d} className="flex h-11 w-12 cursor-pointer items-center justify-center rounded-xl border-2 border-line font-display text-sm font-semibold has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-white">
                        <input type="checkbox" name="day" value={i} defaultChecked={i >= 1 && i <= 5} className="sr-only" />
                        {d}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="category">For</label>
                  <select id="category" name="category" defaultValue={sp.category ?? ""} className="input w-56">
                    <option value="">General queue</option>
                    {(cats ?? []).map((c) => (
                      <option key={c.id} value={c.id}>Category: {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="time">Time</label>
                  <input id="time" name="time" type="time" defaultValue="09:30" required className="input w-36" />
                </div>
                <button className="btn-primary">Add time</button>
              </div>
            </form>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-ink">Key:</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: "#101828" }} />General queue</span>
            {(cats ?? []).map((c) => (
              <span key={c.id} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: c.color }} />{c.name}</span>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {(accounts ?? []).map((a) => {
              const mine = (slots ?? []).filter((s) => s.account_id === a.id);
              return (
                <section key={a.id} className="card p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <AccountAvatar platform={a.platform as PlatformId} name={a.display_name} avatar={a.avatar_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display font-semibold text-navy">{a.display_name}</div>
                      <div className="text-sm text-muted">{mine.length} times a week · {a.region ?? "Canada"}</div>
                    </div>
                    {editor && mine.length > 0 && (
                      <form action={clearSlots}>
                        <input type="hidden" name="account" value={a.id} />
                        <button className="btn-ghost btn-sm">Clear all</button>
                      </form>
                    )}
                  </div>
                  {mine.length ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                        const day = mine.filter((s) => s.day_of_week === d);
                        if (!day.length) return null;
                        return (
                          <div key={d} className="flex items-center gap-3">
                            <span className="w-10 font-display text-sm font-semibold text-muted">{DAYS[d]}</span>
                            <div className="flex flex-wrap gap-1.5">
                              {day.map((s) => (
                                <form key={s.id} action={removeSlot}>
                                  <input type="hidden" name="id" value={s.id} />
                                  <button
                                    className="group flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-white hover:opacity-80"
                                    style={{ background: s.category_id ? catById.get(s.category_id)?.color ?? "#475569" : "#101828" }}
                                    title={`${s.category_id ? catById.get(s.category_id)?.name : "General queue"}: click to remove`}
                                    disabled={!editor}
                                  >
                                    {fmt(s.local_time.slice(0, 5))}
                                    {s.category_id && <span className="text-[11px] opacity-90">{catById.get(s.category_id)?.name}</span>}
                                    {editor && <span className="opacity-70 group-hover:opacity-100">✕</span>}
                                  </button>
                                </form>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="hint">No posting times yet. Add some above or use the recommended times.</p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
