import { AccountAvatar, PlatformBadge } from "@/components/PlatformBadge";
import { PLATFORMS, REGIONS } from "@/lib/platforms/registry";
import type { SocialAccountRow } from "@/lib/platforms/types";
import { getContext, isAdmin } from "@/lib/workspace";
import { disconnectAccount, setDefaultBoard, setRegion } from "./actions";
import { AddChannelDialog, type PickerPlatform } from "./AddChannelDialog";

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, workspace, role } = await getContext();
  const admin = isAdmin(role);
  const { data } = await supabase
    .from("social_accounts")
    .select("id,workspace_id,platform,external_id,account_type,handle,display_name,avatar_url,status,token_expires_at,settings,last_error,region")
    .eq("workspace_id", workspace.id)
    .order("platform");
  const accounts = (data ?? []) as SocialAccountRow[];

  const picker: PickerPlatform[] = PLATFORMS.map((p) => {
    const missing = (p.env ?? []).filter((e) => !process.env[e]);
    return { ...p, missing, ready: missing.length === 0, connected: accounts.filter((a) => a.platform === p.id).length };
  });
  const metaReady = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);

  const regions = Array.from(new Set([...REGIONS, ...accounts.map((a) => a.region ?? "Canada")])).filter((r) =>
    accounts.some((a) => (a.region ?? "Canada") === r),
  );
  const ready = picker.filter((p) => p.ready).length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="masthead">
        <div>
          <h1>Channels</h1>
          <p>
            {workspace.name}&apos;s connected social accounts. {accounts.length} connected · {ready} of {PLATFORMS.length} platforms ready to connect.
          </p>
        </div>
        {admin && <AddChannelDialog platforms={picker} metaReady={metaReady} />}
      </header>

      {sp.connected && (
        <div role="status" className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-green-800">
          Connected {sp.count ?? ""} {sp.connected} account{sp.count === "1" ? "" : "s"}.
        </div>
      )}
      {sp.error && <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-brand-soft px-5 py-4 text-brand-dark">{sp.error}</div>}

      {!accounts.length ? (
        <section className="card flex flex-col items-center px-8 py-16 text-center">
          <div className="mb-5 flex -space-x-2">
            {PLATFORMS.slice(0, 6).map((p) => (
              <PlatformBadge key={p.id} platform={p.id} size={44} />
            ))}
          </div>
          <h2 className="text-2xl font-bold text-navy">Connect your first channel</h2>
          <p className="hint mt-2 max-w-md">
            Click Add channel, pick a platform and log in. CanadianSME&apos;s pages then show up when you create a post.
          </p>
        </section>
      ) : (
        <div className="space-y-8">
          {regions.map((r) => (
            <section key={r} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-paper px-6 py-4">
                <h2 className="text-lg font-bold text-navy">{r}</h2>
                <span className="hint">{accounts.filter((a) => (a.region ?? "Canada") === r).length} channels</span>
              </div>
              <ul className="divide-y divide-line">
                {accounts
                  .filter((a) => (a.region ?? "Canada") === r)
                  .map((a) => {
                    const boards = (a.settings.boards as { id: string; name: string }[] | undefined) ?? [];
                    const expires = a.token_expires_at ? new Date(a.token_expires_at) : null;
                    const soon =
                      expires && expires.getTime() - Date.now() < 7 * 86400_000 && !["x", "tiktok", "youtube", "gbp", "pinterest"].includes(a.platform);
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                        <AccountAvatar platform={a.platform} name={a.display_name} avatar={a.avatar_url} size={48} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-base font-semibold text-navy">{a.display_name}</div>
                          <div className="truncate text-sm text-muted">
                            {PLATFORMS.find((p) => p.id === a.platform)?.name} · {a.handle ?? a.external_id}
                          </div>
                        </div>
                        {a.status === "reconnect_needed" ? (
                          <a href={`/api/connect/${a.platform}?region=${encodeURIComponent(a.region ?? "Canada")}`} className="btn-primary btn-sm" title={a.last_error ?? ""}>
                            Reconnect
                          </a>
                        ) : soon ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-[13px] font-semibold text-amber-800">
                            Login expires {expires!.toLocaleDateString("en-CA")}
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-[13px] font-semibold text-green-800">Active</span>
                        )}
                        {admin && (
                          <form action={setRegion} className="flex items-center gap-2">
                            <input type="hidden" name="id" value={a.id} />
                            <label className="sr-only" htmlFor={`region-${a.id}`}>Region</label>
                            <select id={`region-${a.id}`} name="region" defaultValue={a.region ?? "Canada"} className="input min-h-9 w-32 py-1.5 text-sm">
                              {REGIONS.map((x) => (
                                <option key={x}>{x}</option>
                              ))}
                            </select>
                            <button className="btn-ghost btn-sm">Move</button>
                          </form>
                        )}
                        {a.platform === "pinterest" && boards.length > 0 && (
                          <form action={setDefaultBoard} className="flex items-center gap-2">
                            <input type="hidden" name="id" value={a.id} />
                            <select name="board_id" defaultValue={String(a.settings.default_board_id ?? "")} className="input min-h-9 w-44 py-1.5 text-sm">
                              {boards.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>
                            <button className="btn-ghost btn-sm">Save board</button>
                          </form>
                        )}
                        {admin && (
                          <form action={disconnectAccount}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className="btn-danger btn-sm">Remove</button>
                          </form>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-1 text-xl font-bold text-navy">Platform setup</h2>
        <p className="hint mb-4">A platform can be connected once its developer app keys are added to the app&apos;s settings.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {picker.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
              <PlatformBadge platform={p.id} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-sm font-semibold text-navy">{p.name}</div>
                <div className={`text-[13px] ${p.ready ? "text-green-700" : "text-muted"}`}>{p.ready ? "Ready" : "Needs app keys"}</div>
              </div>
              <a href={p.docs} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-harbour hover:underline">
                Docs
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
