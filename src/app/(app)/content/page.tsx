import Link from "next/link";
import { IconPlus } from "@/components/Icons";
import { formatDateTime } from "@/lib/time";
import { canEdit, getContext } from "@/lib/workspace";
import { deleteCategory, moveToCategory, removeFromLibrary, saveCategory, shareNow } from "./actions";

type Cat = { id: string; name: string; color: string; description: string | null; recycle: boolean; sort: number };
type LibPost = {
  id: string;
  base_text: string;
  link_url: string | null;
  media_ids: string[];
  category_id: string | null;
  share_count: number;
  last_shared_at: string | null;
  created_at: string;
};

const COLORS = ["#1e5aa8", "#d71920", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#db2777", "#475569"];

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ c?: string; edit?: string }> }) {
  const sp = await searchParams;
  const { supabase, workspace, role } = await getContext();
  const editor = canEdit(role);
  const [{ data: catRows }, { data: postRows }, { data: slotRows }] = await Promise.all([
    supabase.from("content_categories").select("id,name,color,description,recycle,sort").eq("workspace_id", workspace.id).order("sort").order("created_at"),
    supabase
      .from("posts")
      .select("id,base_text,link_url,media_ids,category_id,share_count,last_shared_at,created_at")
      .eq("workspace_id", workspace.id)
      .eq("in_library", true)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("posting_slots").select("category_id").not("category_id", "is", null),
  ]);
  const cats = (catRows ?? []) as Cat[];
  const posts = (postRows ?? []) as LibPost[];
  const active = cats.find((c) => c.id === sp.c) ?? cats[0];
  const shown = posts.filter((p) => p.category_id === active?.id);
  const slotsPerCat = new Map<string, number>();
  for (const s of slotRows ?? []) slotsPerCat.set(s.category_id as string, (slotsPerCat.get(s.category_id as string) ?? 0) + 1);
  const mediaIds = Array.from(new Set(shown.flatMap((p) => p.media_ids))).slice(0, 200);
  const { data: media } = mediaIds.length ? await supabase.from("media_assets").select("id,public_url,kind").in("id", mediaIds) : { data: [] };
  const mediaById = new Map((media ?? []).map((m) => [m.id, m]));
  const editing = sp.edit === "new" ? null : cats.find((c) => c.id === sp.edit);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="masthead">
        <div>
          <h1>Content library</h1>
          <p>Group posts into categories. Each category gets its own times on the timetable, and evergreen posts are re-shared automatically.</p>
        </div>
        {active && editor && (
          <Link href={`/compose?category=${active.id}`} className="btn-primary">
            <IconPlus /> Add post to {active.name}
          </Link>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Categories */}
        <aside className="space-y-2">
          {cats.map((c) => {
            const count = posts.filter((p) => p.category_id === c.id).length;
            const on = c.id === active?.id;
            return (
              <Link
                key={c.id}
                href={`/content?c=${c.id}`}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 transition ${on ? "border-navy bg-white" : "border-transparent bg-white hover:border-line"}`}
              >
                <span className="h-9 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-semibold text-navy">{c.name}</span>
                  <span className="block text-[13px] text-muted">
                    {count} posts · {slotsPerCat.get(c.id) ?? 0} times/week{c.recycle ? " · evergreen" : ""}
                  </span>
                </span>
              </Link>
            );
          })}
          {editor && (
            <Link href="/content?edit=new" className="btn-ghost w-full">
              <IconPlus /> New category
            </Link>
          )}
        </aside>

        <section className="min-w-0 space-y-5">
          {/* Category editor */}
          {editor && (sp.edit === "new" || editing) && (
            <form action={saveCategory} className="card space-y-4 p-6">
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <h2 className="text-lg font-bold text-navy">{editing ? `Edit ${editing.name}` : "New category"}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="cname">Name</label>
                  <input id="cname" name="name" className="input" defaultValue={editing?.name ?? ""} required />
                </div>
                <div>
                  <span className="label">Colour</span>
                  <div className="flex gap-2">
                    {COLORS.map((col) => (
                      <label key={col} className="cursor-pointer">
                        <input type="radio" name="color" value={col} defaultChecked={(editing?.color ?? COLORS[0]) === col} className="peer sr-only" />
                        <span className="block h-9 w-9 rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-navy" style={{ background: col }} />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="cdesc">What goes here</label>
                <input id="cdesc" name="description" className="input" defaultValue={editing?.description ?? ""} />
              </div>
              <label className="flex items-start gap-3 text-[15px]">
                <input type="checkbox" name="recycle" defaultChecked={editing?.recycle ?? true} className="mt-1 h-5 w-5 accent-[#16a34a]" />
                <span>
                  <span className="font-semibold">Evergreen: re-share posts when the category runs out</span>
                  <span className="hint block">Turn off for time-sensitive content (events, news) so each post goes out only once.</span>
                </span>
              </label>
              <div className="flex gap-2">
                <button className="btn-primary">Save category</button>
                <Link href={`/content${active ? `?c=${active.id}` : ""}`} className="btn-ghost">Cancel</Link>
              </div>
            </form>
          )}

          {active ? (
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-5" style={{ boxShadow: `inset 4px 0 0 ${active.color}` }}>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-navy">{active.name}</h2>
                  <p className="hint">{active.description || "No description"} · {active.recycle ? "Evergreen (recycles)" : "Each post goes out once"}</p>
                </div>
                {editor && (
                  <>
                    <Link href={`/times?category=${active.id}`} className="btn-ghost btn-sm">Set posting times</Link>
                    <Link href={`/content?c=${active.id}&edit=${active.id}`} className="btn-ghost btn-sm">Edit</Link>
                    <form action={deleteCategory}>
                      <input type="hidden" name="id" value={active.id} />
                      <button className="btn-danger btn-sm">Delete</button>
                    </form>
                  </>
                )}
              </div>
              {!(slotsPerCat.get(active.id) ?? 0) && (
                <p className="border-b border-line bg-amber-50 px-6 py-3 text-sm text-amber-900">
                  This category has no posting times yet, so its posts won&apos;t go out automatically.{" "}
                  <Link href={`/times?category=${active.id}`} className="font-semibold underline">Add times</Link>
                </p>
              )}
              {shown.length ? (
                <ul className="divide-y divide-line">
                  {shown.map((p) => {
                    const thumb = p.media_ids.map((id) => mediaById.get(id)).find(Boolean);
                    return (
                      <li key={p.id} className="flex flex-wrap items-start gap-4 px-6 py-4">
                        {thumb ? (
                          thumb.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb.public_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                          ) : (
                            <video src={thumb.public_url} className="h-16 w-16 rounded-xl object-cover" muted preload="metadata" />
                          )
                        ) : (
                          <span className="flex h-16 w-16 items-center justify-center rounded-xl text-xs font-semibold text-white" style={{ background: active.color }}>Text</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-3 whitespace-pre-line text-[15px]">{p.base_text || "(media only)"}</p>
                          <p className="hint mt-1.5">
                            Shared {p.share_count} time{p.share_count === 1 ? "" : "s"}
                            {p.last_shared_at ? ` · last ${formatDateTime(p.last_shared_at, workspace.timezone)}` : " · not shared yet"}
                          </p>
                        </div>
                        {editor && (
                          <div className="flex flex-wrap items-center gap-2">
                            <form action={moveToCategory} className="flex items-center gap-1.5">
                              <input type="hidden" name="post_id" value={p.id} />
                              <select name="category_id" defaultValue={p.category_id ?? ""} className="input min-h-9 w-40 py-1 text-sm" aria-label="Move to category">
                                {cats.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                              <button className="btn-ghost btn-sm">Move</button>
                            </form>
                            <form action={shareNow}>
                              <input type="hidden" name="post_id" value={p.id} />
                              <button className="btn-blue btn-sm">Share now</button>
                            </form>
                            <form action={removeFromLibrary}>
                              <input type="hidden" name="post_id" value={p.id} />
                              <button className="btn-danger btn-sm">Remove</button>
                            </form>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-6 py-14 text-center">
                  <p className="font-display text-lg font-semibold text-navy">No posts in {active.name} yet</p>
                  <p className="hint mt-1">Add a few posts and give the category posting times. AutoSocials fills those times for you.</p>
                  {editor && <Link href={`/compose?category=${active.id}`} className="btn-primary mt-5">Add the first post</Link>}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <p className="font-display text-lg font-semibold text-navy">Create your first category</p>
              <Link href="/content?edit=new" className="btn-primary mt-5">New category</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
