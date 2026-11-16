"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AccountAvatar, PlatformBadge } from "@/components/PlatformBadge";
import { PLATFORM_BY_ID, textLength, type PlatformId } from "@/lib/platforms/registry";
import { createClient } from "@/lib/supabase/client";
import { createPost } from "./actions";

type Account = {
  id: string;
  platform: PlatformId;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  status: string;
  settings: Record<string, unknown>;
  region?: string | null;
};
type Media = { id: string; public_url: string; kind: "image" | "video"; name: string };

export function Composer({
  accounts,
  workspaceId,
  timezone,
  defaultLocal,
  initialMedia = [],
}: {
  accounts: Account[];
  workspaceId: string;
  timezone: string;
  defaultLocal: string;
  initialMedia?: Media[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(accounts.filter((a) => a.status === "active").map((a) => a.id));
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [media, setMedia] = useState<Media[]>(initialMedia);
  const [overrides, setOverrides] = useState<Partial<Record<PlatformId, string>>>({});
  const [tab, setTab] = useState<PlatformId | "all">("all");
  const [mode, setMode] = useState<"now" | "schedule" | "draft">("schedule");
  const [when, setWhen] = useState(defaultLocal);
  const [tiktokMode, setTiktokMode] = useState("direct");
  const [ytPrivacy, setYtPrivacy] = useState("public");
  const [boards, setBoards] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const chosen = accounts.filter((a) => selected.includes(a.id));
  const regions = Array.from(new Set(accounts.map((a) => a.region ?? "Canada")));
  const platforms = useMemo(() => Array.from(new Set(chosen.map((a) => a.platform))), [chosen]);
  const images = media.filter((m) => m.kind === "image").length;
  const videos = media.filter((m) => m.kind === "video").length;

  const issues = useMemo(() => {
    const out: Partial<Record<PlatformId, string[]>> = {};
    for (const id of platforms) {
      const meta = PLATFORM_BY_ID[id];
      const t = overrides[id] ?? text;
      const list: string[] = [];
      if (textLength(t) > meta.textLimit) list.push(`${textLength(t)}/${meta.textLimit} characters`);
      if (meta.media === "required" && !images && !videos) list.push("needs an image or video");
      if (meta.media === "video-required" && !videos) list.push("needs a video");
      if (meta.media === "image-required" && !images) list.push("needs an image");
      if (videos && !meta.video) list.push("video not supported");
      if (meta.maxImages > 0 && images > meta.maxImages) list.push(`max ${meta.maxImages} images`);
      if (list.length) out[id] = list;
    }
    return out;
  }, [platforms, overrides, text, images, videos]);
  const hasIssues = Object.keys(issues).length > 0;
  const needsTitle = platforms.some((p) => PLATFORM_BY_ID[p].needsTitle);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
        if (!kind) throw new Error(`${file.name}: only images and videos are supported`);
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${workspaceId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(`${file.name}: ${upErr.message}`);
        const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
        const { data: row, error: rowErr } = await supabase
          .from("media_assets")
          .insert({ workspace_id: workspaceId, storage_path: path, public_url: pub.publicUrl, kind, mime_type: file.type, bytes: file.size })
          .select("id,public_url,kind")
          .single();
        if (rowErr) throw new Error(rowErr.message);
        setMedia((m) => [...m, { ...(row as Omit<Media, "name">), name: file.name }]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submit(m: "now" | "schedule" | "draft") {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await createPost({
        baseText: text,
        link,
        title,
        mediaIds: media.map((x) => x.id),
        accountIds: selected,
        overrides,
        options: { tiktok_mode: tiktokMode, youtube_privacy: ytPrivacy, boards },
        mode: m,
        scheduledLocal: when,
      });
      if (!res.ok) return setError(res.error);
      setDone(
        m === "now"
          ? `Publishing to ${res.count} channel${res.count > 1 ? "s" : ""} now…`
          : m === "draft"
            ? "Saved as draft."
            : `Scheduled for ${res.count} channel${res.count > 1 ? "s" : ""}.`,
      );
      setText("");
      setLink("");
      setTitle("");
      setMedia([]);
      setOverrides({});
      setTab("all");
      router.refresh();
    });
  }

  if (!accounts.length) {
    return (
      <div className="card p-14 text-center">
        <p className="font-display text-xl font-semibold text-navy">Connect a channel to start posting</p>
        <p className="hint mt-1.5">Link CanadianSME's Facebook, Instagram, LinkedIn and other accounts, then come back here.</p>
        <a href="/channels" className="btn-primary btn-lg mt-6">Connect channels</a>
      </div>
    );
  }

  const editingText = tab === "all" ? text : overrides[tab] ?? text;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {/* Channels */}
        <section className="card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-navy">Post to <span className="font-sans text-sm font-normal text-muted">({selected.length} of {accounts.length} selected)</span></h2>
            <div className="flex flex-wrap gap-2">
              {regions.length > 1 &&
                regions.map((r) => (
                  <button
                    key={r}
                    className="btn-ghost btn-sm"
                    onClick={() => setSelected(accounts.filter((a) => a.status === "active" && (a.region ?? "Canada") === r).map((a) => a.id))}
                  >
                    {r} only
                  </button>
                ))}
              <button className="btn-ghost btn-sm" onClick={() => setSelected(accounts.filter((a) => a.status === "active").map((a) => a.id))}>
                Select all
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setSelected([])}>Clear</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => {
              const on = selected.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggle(a.id)}
                  disabled={a.status !== "active"}
                  title={a.status !== "active" ? "Reconnect this channel first" : `${PLATFORM_BY_ID[a.platform].name}: ${a.display_name}`}
                  aria-pressed={on}
                  className={`flex min-h-12 items-center gap-2.5 rounded-full border-2 py-1.5 pl-1.5 pr-4 text-[15px] font-medium transition ${
                    on ? "border-brand bg-brand-soft text-navy" : "border-line bg-white text-ink/70 hover:border-navy/30"
                  } disabled:opacity-40`}
                >
                  <AccountAvatar platform={a.platform} name={a.display_name} avatar={a.avatar_url} size={34} />
                  <span className="max-w-[170px] truncate">{a.display_name}</span>
                  {regions.length > 1 && <span className="text-xs text-muted">{a.region ?? "Canada"}</span>}
                  {on && <span className="text-brand" aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* Text */}
        <section className="card p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <TabBtn active={tab === "all"} onClick={() => setTab("all")}>All channels</TabBtn>
            {platforms.map((p) => (
              <TabBtn key={p} active={tab === p} onClick={() => setTab(p)}>
                <PlatformBadge platform={p} size={16} /> {PLATFORM_BY_ID[p].name}
                {overrides[p] !== undefined && <span className="text-[10px] opacity-70">· edited</span>}
                {issues[p] && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
              </TabBtn>
            ))}
          </div>
          <textarea
            className="input min-h-52 resize-y text-base leading-relaxed"
            placeholder={tab === "all" ? "What do you want to share?" : `Custom text for ${PLATFORM_BY_ID[tab].name}`}
            value={editingText}
            onChange={(e) => (tab === "all" ? setText(e.target.value) : setOverrides((o) => ({ ...o, [tab]: e.target.value })))}
          />
          <div className="mt-2.5 flex items-center justify-between text-sm text-muted">
            {tab === "all" ? (
              <span>Same text goes to every channel. Use the tabs to customize one platform.</span>
            ) : overrides[tab] !== undefined ? (
              <button
                className="underline"
                onClick={() =>
                  setOverrides((o) => {
                    const n = { ...o };
                    delete n[tab];
                    return n;
                  })
                }
              >
                Reset to main text
              </button>
            ) : (
              <span>Editing here customizes {PLATFORM_BY_ID[tab].name} only.</span>
            )}
            <span>{textLength(editingText)} characters</span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="link">Link (optional)</label>
              <input id="link" className="input" placeholder="https://canadiansme.ca/…" value={link} onChange={(e) => setLink(e.target.value)} />
            </div>
            {needsTitle && (
              <div>
                <label className="label" htmlFor="title">Title (YouTube / Pinterest)</label>
                <input id="title" className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            )}
          </div>
        </section>

        {/* Media */}
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-navy">Images and video</h2>
            <button className="btn-blue" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : "Add media"}
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          </div>
          {media.length ? (
            <div className="flex flex-wrap gap-3">
              {media.map((m) => (
                <div key={m.id} className="relative h-28 w-28 overflow-hidden rounded-xl border border-line bg-paper">
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.public_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video src={m.public_url} className="h-full w-full object-cover" muted />
                  )}
                  <button
                    onClick={() => setMedia((x) => x.filter((y) => y.id !== m.id))}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-navy/80 text-sm text-white hover:bg-brand"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                  {m.kind === "video" && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">VIDEO</span>}
                </div>
              ))}
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper px-6 py-8 text-center hover:border-harbour">
              <span className="font-display font-semibold text-navy">Drop in a photo or video</span>
              <span className="hint mt-1">Instagram, TikTok, YouTube and Pinterest need one. Click to choose files.</span>
            </button>
          )}
        </section>

        {/* Platform options */}
        {(platforms.includes("tiktok") || platforms.includes("youtube") || platforms.includes("pinterest")) && (
          <section className="card grid gap-5 p-6 sm:grid-cols-2">
            {platforms.includes("tiktok") && (
              <div>
                <label className="label" htmlFor="tt">TikTok</label>
                <select id="tt" className="input" value={tiktokMode} onChange={(e) => setTiktokMode(e.target.value)}>
                  <option value="direct">Post directly</option>
                  <option value="inbox">Send to TikTok inbox (finish in app)</option>
                </select>
              </div>
            )}
            {platforms.includes("youtube") && (
              <div>
                <label className="label" htmlFor="yt">YouTube visibility</label>
                <select id="yt" className="input" value={ytPrivacy} onChange={(e) => setYtPrivacy(e.target.value)}>
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>
            )}
            {chosen
              .filter((a) => a.platform === "pinterest")
              .map((a) => {
                const list = (a.settings.boards as { id: string; name: string }[]) ?? [];
                return (
                  <div key={a.id}>
                    <label className="label">Pinterest board · {a.display_name}</label>
                    <select
                      className="input"
                      value={boards[a.id] ?? String(a.settings.default_board_id ?? "")}
                      onChange={(e) => setBoards((b) => ({ ...b, [a.id]: e.target.value }))}
                    >
                      {list.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
          </section>
        )}
      </div>

      {/* Right column: checks + schedule */}
      <aside className="space-y-5 lg:sticky lg:top-8 lg:self-start">
        <section className="card p-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-navy">Ready to post?</h2>
          {!platforms.length ? (
            <p className="hint">Pick channels and we will check each one for length and media.</p>
          ) : (
            <ul className="space-y-3">
              {platforms.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-[15px]">
                  <PlatformBadge platform={p} size={22} />
                  <span className="flex-1 font-medium">{PLATFORM_BY_ID[p].name}</span>
                  {issues[p] ? (
                    <span className="text-right text-xs text-red-700">{issues[p]!.join(", ")}</span>
                  ) : (
                    <span className="text-xs text-green-700">
                      ✓ {textLength(overrides[p] ?? text)}/{PLATFORM_BY_ID[p].textLimit}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-5 p-6">
          <h2 className="font-display text-lg font-semibold text-navy">When should it go out?</h2>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-paper p-1.5 ring-1 ring-line">
            {(["now", "schedule", "draft"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`min-h-10 rounded-lg font-display text-sm font-semibold ${mode === m ? "bg-navy text-white shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {m === "now" ? "Right now" : m === "schedule" ? "Later" : "Draft"}
              </button>
            ))}
          </div>
          {mode === "schedule" && (
            <div>
              <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
              <p className="hint mt-1.5">Times are in {timezone.replace("_", " ")}.</p>
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-brand-soft p-3.5 text-sm text-brand-dark">{error}</p>}
          {done && <p role="status" className="rounded-xl bg-green-50 p-3.5 text-sm text-green-800">{done}</p>}
          <button
            className="btn-primary btn-lg w-full"
            disabled={pending || uploading || !selected.length || (hasIssues && mode !== "draft")}
            onClick={() => submit(mode)}
          >
            {pending ? "Saving…" : mode === "now" ? `Publish to ${selected.length} channel${selected.length === 1 ? "" : "s"}` : mode === "schedule" ? `Schedule for ${selected.length} channel${selected.length === 1 ? "" : "s"}` : "Save draft"}
          </button>
        </section>
      </aside>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-10 items-center gap-2 rounded-full px-4 py-2 font-display text-sm font-semibold ${active ? "bg-navy text-white" : "bg-paper text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
