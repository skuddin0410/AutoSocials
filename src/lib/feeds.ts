/**
 * Website → social. Polls each active RSS source (e.g. https://canadiansme.ca/feed),
 * and turns every new article into a post for the chosen channels:
 *   mode "draft" → waits in Queue › Drafts for a person to approve
 *   mode "queue" → goes straight into each channel's next free posting time
 * Framework-agnostic; called from the publisher cron.
 */
import { aiEnabled, generateCaptions } from "./ai";
import { PLATFORM_BY_ID, textLength, type PlatformId } from "./platforms/registry";
import { createAdminClient } from "./supabase/admin";

type Source = {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  mode: "draft" | "queue";
  account_ids: string[];
  use_ai: boolean;
  last_checked_at: string | null;
};
type Item = { guid: string; title: string; link: string; description: string; pubDate: string | null };

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();

export function parseRss(xml: string): Item[] {
  const items: Item[] = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const block = m[0];
    const tag = (t: string) => block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1];
    const link = tag("link") ? decode(tag("link")!) : block.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "";
    const title = decode(tag("title") ?? "");
    const guid = decode(tag("guid") ?? tag("id") ?? link ?? title);
    if (!guid || !title) continue;
    items.push({
      guid,
      title,
      link,
      description: decode(tag("description") ?? tag("summary") ?? ""),
      pubDate: tag("pubDate") ?? tag("published") ?? tag("updated") ?? null,
    });
  }
  return items;
}

async function ogImage(url: string): Promise<string | null> {
  try {
    const html = await (await fetch(url, { headers: { "user-agent": "AutoSocials/1.0" } })).text();
    return html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Plain caption when AI is off. */
function templateCaption(p: PlatformId, it: Item): string {
  const meta = PLATFORM_BY_ID[p];
  const noLink = ["instagram", "tiktok", "pinterest"].includes(p);
  let text = `${it.title}\n\n${it.description}`.trim();
  if (!noLink) text += `\n\nRead more: ${it.link}`;
  if (p === "instagram") text += "\n\nLink in bio. #CanadianSME #SmallBusiness #Canada";
  if (textLength(text) > meta.textLimit) {
    const tail = noLink ? "" : ` ${it.link}`;
    text = Array.from(it.title).slice(0, meta.textLimit - tail.length - 1).join("") + tail;
  }
  return text;
}

export async function runFeeds(opts: { minIntervalMin?: number; maxItemsPerSource?: number } = {}) {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - (opts.minIntervalMin ?? 15) * 60_000).toISOString();
  const { data: sources } = await admin
    .from("content_sources")
    .select("*")
    .eq("active", true)
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`);
  const summary = { sources: 0, created: 0, errors: 0 };

  for (const s of (sources ?? []) as Source[]) {
    summary.sources++;
    try {
      const xml = await (await fetch(s.url, { headers: { "user-agent": "AutoSocials/1.0" } })).text();
      const items = parseRss(xml);
      const firstRun = !s.last_checked_at;
      await admin.from("content_sources").update({ last_checked_at: new Date().toISOString(), last_error: null }).eq("id", s.id);
      if (!items.length) continue;

      // Which are new?
      const { data: seen } = await admin.from("source_items").select("guid").eq("source_id", s.id).in("guid", items.map((i) => i.guid));
      const seenSet = new Set((seen ?? []).map((r) => r.guid));
      let fresh = items.filter((i) => !seenSet.has(i.guid));
      // First run: remember the backlog but only create posts for the 3 newest, so nobody gets flooded.
      if (firstRun && fresh.length > 3) {
        const backlog = fresh.slice(3);
        await admin.from("source_items").upsert(
          backlog.map((i) => ({ source_id: s.id, guid: i.guid, title: i.title, link: i.link, published_at: i.pubDate ? new Date(i.pubDate).toISOString() : null })),
          { onConflict: "source_id,guid", ignoreDuplicates: true },
        );
        fresh = fresh.slice(0, 3);
      }
      fresh = fresh.slice(0, opts.maxItemsPerSource ?? 10);
      if (!fresh.length) continue;

      // Target channels
      let q = admin.from("social_accounts").select("id,platform").eq("workspace_id", s.workspace_id).eq("status", "active");
      if (s.account_ids.length) q = q.in("id", s.account_ids);
      const { data: accounts } = await q;
      const { data: ws } = await admin.from("workspaces").select("brand_voice").eq("id", s.workspace_id).single();

      for (const it of fresh.reverse()) {
        const { data: si, error: siErr } = await admin
          .from("source_items")
          .insert({ source_id: s.id, guid: it.guid, title: it.title, link: it.link, published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null })
          .select("id")
          .single();
        if (siErr) continue; // another run already took it
        if (!accounts?.length) continue;

        // Image from the article (og:image) → media library
        const media: string[] = [];
        const img = it.link ? await ogImage(it.link) : null;
        if (img) {
          const { data: m } = await admin
            .from("media_assets")
            .insert({ workspace_id: s.workspace_id, storage_path: `external:${img}`, public_url: img, kind: "image", mime_type: "image/*" })
            .select("id")
            .single();
          if (m) media.push(m.id);
        }

        const platforms = Array.from(new Set(accounts.map((a) => a.platform as PlatformId)));
        let captions: Partial<Record<PlatformId, string>> = {};
        let base = `${it.title}\n\n${it.link}`;
        if (s.use_ai && aiEnabled()) {
          try {
            const r = await generateCaptions({ brandVoice: ws?.brand_voice, topic: it.title, sourceText: it.description, link: it.link, platforms });
            captions = r.perPlatform;
            base = r.base || base;
          } catch {
            /* fall back to template */
          }
        }

        const { data: post } = await admin
          .from("posts")
          .insert({ workspace_id: s.workspace_id, origin: "rss", title: it.title, base_text: base, link_url: it.link, media_ids: media, source_item_id: si.id })
          .select("id")
          .single();
        if (!post) continue;
        await admin.from("source_items").update({ post_id: post.id }).eq("id", si.id);

        for (const a of accounts) {
          const p = a.platform as PlatformId;
          // Skip channels whose media rules this article can't meet (e.g. TikTok/YouTube need video).
          const meta = PLATFORM_BY_ID[p];
          if (meta.media === "video-required" || (meta.media !== "optional" && !media.length)) continue;
          let scheduled_at: string | null = null;
          let status = "draft";
          if (s.mode === "queue") {
            const { data: slot } = await admin.rpc("next_free_slot", { p_account: a.id });
            if (slot) {
              scheduled_at = slot as string;
              status = "scheduled";
            }
          }
          await admin.from("post_variants").insert({
            post_id: post.id,
            workspace_id: s.workspace_id,
            account_id: a.id,
            body: captions[p] ?? templateCaption(p, it),
            title: it.title.slice(0, 100),
            link_url: it.link,
            media_ids: media,
            status,
            scheduled_at,
          });
        }
        summary.created++;
      }
    } catch (e) {
      summary.errors++;
      await admin.from("content_sources").update({ last_checked_at: new Date().toISOString(), last_error: (e as Error).message.slice(0, 300) }).eq("id", s.id);
    }
  }
  return summary;
}
