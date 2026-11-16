import { AccountAvatar, PlatformBadge } from "@/components/PlatformBadge";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/registry";
import type { SocialAccountRow } from "@/lib/platforms/types";
import { getContext, isAdmin } from "@/lib/workspace";
import { disconnectAccount, setDefaultBoard } from "./actions";
import { CredentialConnect } from "./CredentialConnect";

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, workspace, role } = await getContext();
  const admin = isAdmin(role);
  const { data } = await supabase
    .from("social_accounts")
    .select("id,workspace_id,platform,external_id,account_type,handle,display_name,avatar_url,status,token_expires_at,settings,last_error")
    .eq("workspace_id", workspace.id)
    .order("created_at");
  const accounts = (data ?? []) as SocialAccountRow[];
  const byPlatform = (id: PlatformId) => accounts.filter((a) => a.platform === id);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Channels</h1>
        <p className="text-sm text-muted">
          Connect {workspace.name}&apos;s social accounts. Every connected channel shows up in the post composer.
        </p>
      </header>

      {sp.connected && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Connected {sp.count ?? ""} {sp.connected} account{sp.count === "1" ? "" : "s"}.
        </div>
      )}
      {sp.error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{sp.error}</div>}

      {accounts.length > 0 && (
        <section className="card mb-8 divide-y divide-line">
          <div className="px-5 py-3 text-sm font-medium">Connected ({accounts.length})</div>
          {accounts.map((a) => {
            const boards = (a.settings.boards as { id: string; name: string }[] | undefined) ?? [];
            const expires = a.token_expires_at ? new Date(a.token_expires_at) : null;
            const soon = expires && expires.getTime() - Date.now() < 7 * 86400_000 && !["x", "tiktok", "youtube", "gbp", "pinterest"].includes(a.platform);
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <AccountAvatar platform={a.platform} name={a.display_name} avatar={a.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.display_name}</div>
                  <div className="truncate text-xs text-muted">
                    {a.handle ?? a.external_id} · {a.account_type}
                  </div>
                </div>
                {a.platform === "pinterest" && boards.length > 0 && (
                  <form action={setDefaultBoard} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <select name="board_id" defaultValue={String(a.settings.default_board_id ?? "")} className="input w-44 py-1.5">
                      {boards.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <button className="btn-ghost py-1.5">Save board</button>
                  </form>
                )}
                {a.status === "reconnect_needed" ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800" title={a.last_error ?? ""}>
                    Reconnect needed
                  </span>
                ) : soon ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                    Expires {expires!.toLocaleDateString()}
                  </span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">Active</span>
                )}
                {admin && (
                  <form action={disconnectAccount}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn-danger py-1.5">Remove</button>
                  </form>
                )}
              </div>
            );
          })}
        </section>
      )}

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Add a channel</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((p) => {
          const missing = (p.env ?? []).filter((e) => !process.env[e]);
          const count = byPlatform(p.id).length;
          return (
            <div key={p.id} className="card flex flex-col p-5">
              <div className="mb-3 flex items-center gap-3">
                <PlatformBadge platform={p.id} size={32} />
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted">{count ? `${count} connected` : p.connectsAs}</div>
                </div>
              </div>
              {p.note && <p className="mb-4 text-xs leading-relaxed text-muted">{p.note}</p>}
              <div className="mt-auto">
                {!admin ? (
                  <p className="text-xs text-muted">Ask a brand admin to connect channels.</p>
                ) : missing.length ? (
                  <div className="rounded-lg bg-stone-50 p-3 text-xs text-muted">
                    <span className="font-medium text-ink">Setup needed:</span> add {missing.join(", ")} to the app&apos;s environment.{" "}
                    <a href={p.docs} target="_blank" className="underline">Docs</a>
                  </div>
                ) : p.auth === "oauth" ? (
                  <a href={`/api/connect/${p.id}`} className="btn-ghost w-full">
                    {count ? "Connect another / reconnect" : `Connect ${p.name}`}
                  </a>
                ) : (
                  <CredentialConnect platform={p} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
