import { api, download } from "../http";
import { PublishError, type PublishInput, type PublishResult } from "../types";
import { withLink } from "./meta";

// ───────────── Pinterest ─────────────
export async function publishPinterest({ account, credential, text, title, link, media, options }: PublishInput): Promise<PublishResult> {
  const img = media.find((m) => m.kind === "image");
  if (!img) throw new PublishError("Pinterest pins need an image.");
  const boardId = (options.board_id as string) || (account.settings.default_board_id as string);
  if (!boardId) throw new PublishError("Choose a Pinterest board (Channels → Pinterest settings).");
  const r = await api("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { Authorization: `Bearer ${credential.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: boardId,
      title: (title || text.split("\n")[0]).slice(0, 100),
      description: text.slice(0, 500),
      link: link ?? undefined,
      alt_text: img.alt_text ?? undefined,
      media_source: { source_type: "image_url", url: img.public_url },
    }),
  });
  return { id: r.id, url: `https://www.pinterest.com/pin/${r.id}/` };
}

// ───────────── Google Business Profile ─────────────
export async function publishGbp({ account, credential, text, link, media }: PublishInput): Promise<PublishResult> {
  const img = media.find((m) => m.kind === "image");
  const r = await api(`https://mybusiness.googleapis.com/v4/${account.external_id}/localPosts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credential.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      languageCode: "en-CA",
      summary: text.slice(0, 1500),
      topicType: "STANDARD",
      ...(link ? { callToAction: { actionType: "LEARN_MORE", url: link } } : {}),
      ...(img ? { media: [{ mediaFormat: "PHOTO", sourceUrl: img.public_url }] } : {}),
    }),
  });
  return { id: r.name, url: r.searchUrl ?? null };
}

// ───────────── Bluesky ─────────────
export async function publishBluesky({ credential, text, link, media }: PublishInput): Promise<PublishResult> {
  const service = (credential.service as string) || "https://bsky.social";
  const session = await api(`${service}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: credential.identifier, password: credential.password }),
  });
  const auth = { Authorization: `Bearer ${session.accessJwt}` };
  const body = withLink(text, link).replace(/\n\n(https?:\/\/\S+)$/, " $1");

  let embed: Record<string, unknown> | undefined;
  const images = media.filter((m) => m.kind === "image").slice(0, 4);
  if (images.length) {
    const uploaded = [];
    for (const img of images) {
      const { bytes, type } = await download(img.public_url);
      if (bytes.byteLength > 1_000_000) throw new PublishError("Bluesky images must be under 1 MB.");
      const blob = await api(`${service}/xrpc/com.atproto.repo.uploadBlob`, {
        method: "POST",
        headers: { ...auth, "Content-Type": type },
        body: bytes,
      });
      uploaded.push({ alt: img.alt_text ?? "", image: blob.blob });
    }
    embed = { $type: "app.bsky.embed.images", images: uploaded };
  } else if (link) {
    embed = { $type: "app.bsky.embed.external", external: { uri: link, title: link, description: "" } };
  }

  const record = {
    $type: "app.bsky.feed.post",
    text: body,
    createdAt: new Date().toISOString(),
    facets: linkFacets(body),
    ...(embed ? { embed } : {}),
  };
  const r = await api(`${service}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
  });
  const rkey = String(r.uri).split("/").pop();
  return { id: r.uri, url: `https://bsky.app/profile/${session.handle}/post/${rkey}` };
}

/** Bluesky needs explicit byte-offset facets to make URLs clickable. */
function linkFacets(text: string) {
  const enc = new TextEncoder();
  const facets = [];
  for (const m of text.matchAll(/https?:\/\/[^\s]+/g)) {
    const byteStart = enc.encode(text.slice(0, m.index)).byteLength;
    const byteEnd = byteStart + enc.encode(m[0]).byteLength;
    facets.push({ index: { byteStart, byteEnd }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
  }
  return facets;
}

// ───────────── Mastodon ─────────────
export async function publishMastodon({ credential, text, link, media }: PublishInput): Promise<PublishResult> {
  const instance = credential.instance as string;
  const auth = { Authorization: `Bearer ${credential.access_token}` };
  const ids: string[] = [];
  for (const m of media.slice(0, 4)) {
    const { bytes, type } = await download(m.public_url);
    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type }), m.kind === "video" ? "video.mp4" : "image");
    if (m.alt_text) fd.append("description", m.alt_text);
    const r = await api(`${instance}/api/v2/media`, { method: "POST", headers: auth, body: fd });
    ids.push(r.id);
  }
  const r = await api(`${instance}/api/v1/statuses`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ status: withLink(text, link), media_ids: ids, visibility: "public" }),
  });
  return { id: r.id, url: r.url };
}

// ───────────── Telegram ─────────────
export async function publishTelegram({ credential, text, link, media }: PublishInput): Promise<PublishResult> {
  const base = `https://api.telegram.org/bot${credential.bot_token}`;
  const chat_id = credential.chat_id as string;
  const caption = withLink(text, link);
  const json = { "Content-Type": "application/json" };
  let r: any;
  if (!media.length) {
    r = await api(`${base}/sendMessage`, { method: "POST", headers: json, body: JSON.stringify({ chat_id, text: caption }) });
  } else if (media.length === 1) {
    const m = media[0];
    const method = m.kind === "video" ? "sendVideo" : "sendPhoto";
    r = await api(`${base}/${method}`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ chat_id, [m.kind === "video" ? "video" : "photo"]: m.public_url, caption: caption.slice(0, 1024) }),
    });
  } else {
    const group = media.slice(0, 10).map((m, i) => ({
      type: m.kind === "video" ? "video" : "photo",
      media: m.public_url,
      ...(i === 0 ? { caption: caption.slice(0, 1024) } : {}),
    }));
    r = await api(`${base}/sendMediaGroup`, { method: "POST", headers: json, body: JSON.stringify({ chat_id, media: group }) });
    r = { result: Array.isArray(r.result) ? r.result[0] : r.result };
  }
  const msg = r.result;
  const username = msg?.chat?.username;
  return { id: String(msg?.message_id), url: username ? `https://t.me/${username}/${msg.message_id}` : null };
}
