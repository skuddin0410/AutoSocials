import { api, sleep } from "../http";
import { PublishError, type PublishInput, type PublishResult } from "../types";

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v24.0"}`;

// ───────────── Facebook Page ─────────────
export async function publishFacebook({ account, credential, text, link, media }: PublishInput): Promise<PublishResult> {
  const token = credential.access_token as string;
  const page = account.external_id;
  const videos = media.filter((m) => m.kind === "video");
  const images = media.filter((m) => m.kind === "image");

  if (videos.length) {
    const r = await api(`${GRAPH()}/${page}/videos`, {
      form: { file_url: videos[0].public_url, description: withLink(text, link), access_token: token },
    });
    return { id: r.id, url: `https://www.facebook.com/${page}/videos/${r.id}` };
  }
  if (images.length === 1) {
    const r = await api(`${GRAPH()}/${page}/photos`, {
      form: { url: images[0].public_url, caption: withLink(text, link), access_token: token },
    });
    return { id: r.post_id ?? r.id, url: `https://www.facebook.com/${r.post_id ?? r.id}` };
  }
  const form: Record<string, string> = { message: text, access_token: token };
  if (images.length > 1) {
    const ids: string[] = [];
    for (const img of images) {
      const r = await api(`${GRAPH()}/${page}/photos`, { form: { url: img.public_url, published: "false", access_token: token } });
      ids.push(r.id);
    }
    ids.forEach((id, i) => (form[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    if (link) form.message = withLink(text, link);
  } else if (link) {
    form.link = link;
  }
  const r = await api(`${GRAPH()}/${page}/feed`, { form });
  return { id: r.id, url: `https://www.facebook.com/${r.id}` };
}

// ───────────── Instagram (professional account) ─────────────
export async function publishInstagram({ account, credential, text, link, media }: PublishInput): Promise<PublishResult> {
  const token = credential.access_token as string;
  const ig = account.external_id;
  if (!media.length) throw new PublishError("Instagram posts need at least one image or video.");
  const caption = link ? `${text}\n\n${link}` : text; // links aren't clickable on IG, but kept for reference

  const container = async (params: Record<string, string>) =>
    (await api(`${GRAPH()}/${ig}/media`, { form: { ...params, access_token: token } })).id as string;

  let creationId: string;
  if (media.length === 1) {
    const m = media[0];
    creationId =
      m.kind === "video"
        ? await container({ media_type: "REELS", video_url: m.public_url, caption, share_to_feed: "true" })
        : await container({ image_url: m.public_url, caption });
    await waitForContainer(creationId, token);
  } else {
    const children: string[] = [];
    for (const m of media.slice(0, 10)) {
      const id =
        m.kind === "video"
          ? await container({ media_type: "VIDEO", video_url: m.public_url, is_carousel_item: "true" })
          : await container({ image_url: m.public_url, is_carousel_item: "true" });
      await waitForContainer(id, token);
      children.push(id);
    }
    creationId = await container({ media_type: "CAROUSEL", children: children.join(","), caption });
    await waitForContainer(creationId, token);
  }
  const pub = await api(`${GRAPH()}/${ig}/media_publish`, { form: { creation_id: creationId, access_token: token } });
  const info = await api(`${GRAPH()}/${pub.id}?fields=permalink&access_token=${token}`).catch(() => ({}) as any);
  return { id: pub.id, url: info.permalink ?? null };
}

async function waitForContainer(id: string, token: string, maxMs = 5 * 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = await api(`${GRAPH()}/${id}?fields=status_code,status&access_token=${token}`);
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED")
      throw new PublishError(`Instagram could not process the media: ${s.status ?? s.status_code}`);
    await sleep(4000);
  }
  throw new PublishError("Instagram media processing timed out", { retryable: true });
}

// ───────────── Threads ─────────────
export async function publishThreads({ account, credential, text, link, media }: PublishInput): Promise<PublishResult> {
  const token = credential.access_token as string;
  const user = account.external_id;
  const base = "https://graph.threads.net/v1.0";
  const create = async (params: Record<string, string>) =>
    (await api(`${base}/${user}/threads`, { form: { ...params, access_token: token } })).id as string;
  const wait = async (id: string) => {
    for (let i = 0; i < 60; i++) {
      const s = await api(`${base}/${id}?fields=status,error_message&access_token=${token}`);
      if (s.status === "FINISHED" || s.status === "PUBLISHED") return;
      if (s.status === "ERROR" || s.status === "EXPIRED") throw new PublishError(`Threads media error: ${s.error_message ?? s.status}`);
      await sleep(3000);
    }
    throw new PublishError("Threads media processing timed out", { retryable: true });
  };
  const body = text;
  let creationId: string;
  if (!media.length) {
    const p: Record<string, string> = { media_type: "TEXT", text: body };
    if (link) p.link_attachment = link;
    creationId = await create(p);
  } else if (media.length === 1) {
    const m = media[0];
    creationId = await create(
      m.kind === "video"
        ? { media_type: "VIDEO", video_url: m.public_url, text: withLink(body, link) }
        : { media_type: "IMAGE", image_url: m.public_url, text: withLink(body, link) },
    );
  } else {
    const children: string[] = [];
    for (const m of media.slice(0, 10)) {
      const id = await create(
        m.kind === "video"
          ? { media_type: "VIDEO", video_url: m.public_url, is_carousel_item: "true" }
          : { media_type: "IMAGE", image_url: m.public_url, is_carousel_item: "true" },
      );
      await wait(id);
      children.push(id);
    }
    creationId = await create({ media_type: "CAROUSEL", children: children.join(","), text: withLink(body, link) });
  }
  await wait(creationId);
  const pub = await api(`${base}/${user}/threads_publish`, { form: { creation_id: creationId, access_token: token } });
  const info = await api(`${base}/${pub.id}?fields=permalink&access_token=${token}`).catch(() => ({}) as any);
  return { id: pub.id, url: info.permalink ?? null };
}

export function withLink(text: string, link: string | null) {
  if (!link || text.includes(link)) return text;
  return `${text}\n\n${link}`;
}
