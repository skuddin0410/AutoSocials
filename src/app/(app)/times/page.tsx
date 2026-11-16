import { AccountAvatar } from "@/components/PlatformBadge";
import type { PlatformId } from "@/lib/platforms/registry";
import { canEdit, getContext } from "@/lib/workspace";
import { addSlots, applyRecommended, clearSlots, removeSlot } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
};

export default async function TimesPage() {
  const { supabase, workspace, role } = await getContext();
  const editor = canEdit(role);
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id,platform,display_name,avatar_url,region")
    .eq("workspace_id", workspace.id)
    .order("platform");
  const ids = (accounts ?? []).map((a) => a.id);
  const { data: slots } = ids.length
    ? await supabase.from("posting_slots").select("id,account_id,day_of_week,local_time").in("account_id", ids).order("local_time")
    : { data: [] as { id: string; account_id: string; day_of_week: number; local_time: string }[] };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="masthead">
        <div>
          <h1>Posting times</h1>
          <p>When &quot;Queue&quot; is chosen, each post takes the channel&apos;s next free time. Times are in {workspace.timezone.replace("_", " ")}.</p>
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
                  <label className="label" htmlFor="time">Time</label>
                  <input id="time" name="time" type="time" defaultValue="09:30" required className="input w-36" />
                </div>
                <button className="btn-primary">Add time</button>
              </div>
            </form>
          )}

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
                                  <button className="group flex min-h-8 items-center gap-1.5 rounded-lg bg-harbour-soft px-2.5 text-sm font-medium text-harbour hover:bg-brand-soft hover:text-brand" title="Remove this time" disabled={!editor}>
                                    {fmt(s.local_time.slice(0, 5))}
                                    {editor && <span className="opacity-50 group-hover:opacity-100">✕</span>}
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
