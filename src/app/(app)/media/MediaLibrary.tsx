"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; public_url: string; kind: "image" | "video"; mime_type: string | null; bytes: number | null; created_at: string; storage_path: string };

const size = (b: number | null) => (!b ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export function MediaLibrary({ workspaceId, initial }: { workspaceId: string; initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = items.filter((i) => filter === "all" || i.kind === filter);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
        if (!kind) throw new Error(`${file.name}: only images and videos can be uploaded`);
        const path = `${workspaceId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: e1 } = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
        if (e1) throw new Error(`${file.name}: ${e1.message}`);
        const url = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
        const { data, error: e2 } = await supabase
          .from("media_assets")
          .insert({ workspace_id: workspaceId, storage_path: path, public_url: url, kind, mime_type: file.type, bytes: file.size })
          .select("id,public_url,kind,mime_type,bytes,created_at,storage_path")
          .single();
        if (e2) throw new Error(e2.message);
        setItems((x) => [data as Item, ...x]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(item: Item) {
    const supabase = createClient();
    await supabase.storage.from("media").remove([item.storage_path]);
    await supabase.from("media_assets").delete().eq("id", item.id);
    setItems((x) => x.filter((i) => i.id !== item.id));
    setPicked((p) => p.filter((id) => id !== item.id));
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {(["all", "image", "video"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`min-h-10 rounded-full px-4 py-2 font-display text-sm font-semibold ${filter === f ? "bg-navy text-white" : "bg-white text-muted ring-1 ring-line hover:text-ink"}`}
          >
            {f === "all" ? `All (${items.length})` : f === "image" ? "Photos" : "Videos"}
          </button>
        ))}
        <div className="ml-auto flex gap-3">
          {picked.length > 0 && (
            <Link href={`/compose?media=${picked.join(",")}`} className="btn-primary">
              Use {picked.length} in a new post
            </Link>
          )}
          <button className="btn-blue" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "Uploading…" : "Upload media"}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-brand-soft p-3.5 text-sm text-brand-dark">{error}</p>}

      {!shown.length ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-white px-6 py-16 text-center hover:border-harbour"
        >
          <span className="font-display text-lg font-semibold text-navy">Your library is empty</span>
          <span className="hint mt-1">Upload CanadianSME logos, magazine covers and event photos to reuse them in posts.</span>
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((m) => {
            const on = picked.includes(m.id);
            return (
              <li key={m.id} className={`group overflow-hidden rounded-2xl border-2 bg-white ${on ? "border-brand" : "border-line"}`}>
                <button
                  className="relative block aspect-square w-full bg-paper"
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                  aria-pressed={on}
                  aria-label={on ? "Unselect" : "Select for a post"}
                >
                  {m.kind === "image" ? (
                    <img src={m.public_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <video src={m.public_url} className="h-full w-full object-cover" muted preload="metadata" />
                  )}
                  {m.kind === "video" && <span className="absolute bottom-2 left-2 rounded-md bg-navy/80 px-2 py-0.5 text-xs font-semibold text-white">Video</span>}
                  {on && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm text-white">✓</span>}
                </button>
                <div className="flex items-center justify-between px-3 py-2 text-xs text-muted">
                  <span>{new Date(m.created_at).toLocaleDateString("en-CA")} · {size(m.bytes)}</span>
                  <button className="font-semibold text-brand hover:underline" onClick={() => remove(m)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
