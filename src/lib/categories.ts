/**
 * SocialBee-style category scheduling.
 * Each posting time on the weekly timetable can belong to a content category.
 * This job looks 7 days ahead and fills every empty category slot with a post
 * from that category's library: never-shared posts first, then (for evergreen
 * categories) the post that was shared longest ago. Framework-agnostic.
 */
import { PLATFORM_BY_ID, textLength, type PlatformId } from "./platforms/registry";
import { createAdminClient } from "./supabase/admin";

type Occ = { slot_id: string; account_id: string; platform: PlatformId; workspace_id: string; category_id: string; ts: string };
type LibPost = {
  id: string;
  base_text: string;
  link_url: string | null;
  media_ids: string[];
  overrides: Partial<Record<PlatformId, string>>;
  account_ids: string[];
  last_shared_at: string | null;
  share_count: number;
  title: string | null;
};

export async function fillCategorySlots(days = 7) {
  const admin = createAdminClient();
  const { data: occ, error } = await admin.rpc("category_slot_occurrences", { p_days: days });
  if (error) throw new Error(error.message);
  const occurrences = (occ ?? []) as Occ[];
  if (!occurrences.length) return { filled: 0, empty: 0 };

  const catIds = Array.from(new Set(occurrences.map((o) => o.category_id)));
  const [{ data: cats }, { data: posts }] = await Promise.all([
    admin.from("content_categories").select("id,recycle").in("id", catIds),
    admin
      .from("posts")
      .select("id,category_id,base_text,link_url,media_ids,overrides,account_ids,last_shared_at,share_count,title")
      .in("category_id", catIds)
      .eq("in_library", true),
  ]);
  const recycle = new Map((cats ?? []).map((c) => [c.id, c.recycle as boolean]));
  const byCat = new Map<string, LibPost[]>();
  for (const p of (posts ?? []) as (LibPost & { category_id: string })[]) byCat.set(p.category_id, [...(byCat.get(p.category_id) ?? []), p]);

  // Media kinds, to respect each platform's media rules.
  const mediaIds = Array.from(new Set((posts ?? []).flatMap((p) => p.media_ids as string[])));
  const { data: media } = mediaIds.length ? await admin.from("media_assets").select("id,kind").in("id", mediaIds) : { data: [] };
  const kind = new Map((media ?? []).map((m) => [m.id, m.kind as string]));

  let filled = 0;
  let empty = 0;
  for (const o of occurrences) {
    const meta = PLATFORM_BY_ID[o.platform];
    const pool = (byCat.get(o.category_id) ?? [])
      .filter((p) => !p.account_ids?.length || p.account_ids.includes(o.account_id))
      .filter((p) => recycle.get(o.category_id) || p.share_count === 0)
      .filter((p) => {
        const imgs = p.media_ids.filter((id) => kind.get(id) === "image").length;
        const vids = p.media_ids.filter((id) => kind.get(id) === "video").length;
        if (meta.media === "required" && !imgs && !vids) return false;
        if (meta.media === "video-required" && !vids) return false;
        if (meta.media === "image-required" && !imgs) return false;
        if (vids && !meta.video) return false;
        const text = p.overrides?.[o.platform] ?? p.base_text;
        return textLength(text) <= meta.textLimit;
      })
      .sort((a, b) => {
        if (!a.last_shared_at !== !b.last_shared_at) return a.last_shared_at ? 1 : -1; // never-shared first
        return (a.last_shared_at ?? "").localeCompare(b.last_shared_at ?? "");
      });
    const pick = pool[0];
    if (!pick) {
      empty++;
      continue;
    }
    const { error: insErr } = await admin.from("post_variants").insert({
      post_id: pick.id,
      workspace_id: o.workspace_id,
      account_id: o.account_id,
      body: pick.overrides?.[o.platform] ?? pick.base_text,
      title: pick.title,
      link_url: pick.link_url,
      media_ids: pick.media_ids,
      status: "scheduled",
      scheduled_at: o.ts,
      options: { from_category: o.category_id },
    });
    if (insErr) continue;
    // Mark as used so the next slot picks a different post (rotation).
    pick.last_shared_at = o.ts;
    pick.share_count += 1;
    await admin.from("posts").update({ last_shared_at: o.ts, share_count: pick.share_count }).eq("id", pick.id);
    filled++;
  }
  return { filled, empty };
}
