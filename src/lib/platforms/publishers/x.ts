import { api, download, sleep } from "../http";
import { PublishError, type PublishInput, type PublishResult } from "../types";

const API = "https://api.x.com/2";

export async function publishX({ credential, text, link, media }: PublishInput): Promise<PublishResult> {
  const token = credential.access_token as string;
  const auth = { Authorization: `Bearer ${token}` };
  const body = link && !text.includes(link) ? `${text} ${link}` : text;

  const mediaIds: string[] = [];
  const video = media.find((m) => m.kind === "video");
  if (video) {
    mediaIds.push(await uploadChunked(video.public_url, "tweet_video", auth));
  } else {
    for (const img of media.filter((m) => m.kind === "image").slice(0, 4)) {
      mediaIds.push(await uploadChunked(img.public_url, "tweet_image", auth));
    }
  }

  const r = await api(`${API}/tweets`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ text: body, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
  });
  return { id: r.data.id, url: `https://x.com/i/web/status/${r.data.id}` };
}

/** X API v2 chunked media upload (initialize → append → finalize → poll). */
async function uploadChunked(url: string, category: "tweet_image" | "tweet_video", auth: Record<string, string>) {
  const { bytes, type } = await download(url);
  const init = await api(`${API}/media/upload/initialize`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: type, total_bytes: bytes.byteLength, media_category: category }),
  });
  const id: string = init.data?.id ?? init.data?.media_id ?? init.id;
  const CHUNK = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < bytes.byteLength; i += CHUNK, seg++) {
    const fd = new FormData();
    fd.append("segment_index", String(seg));
    fd.append("media", new Blob([bytes.slice(i, i + CHUNK)]));
    const res = await fetch(`${API}/media/upload/${id}/append`, { method: "POST", headers: auth, body: fd });
    if (!res.ok) throw new PublishError(`X media append failed (${res.status}): ${(await res.text()).slice(0, 200)}`, { retryable: res.status >= 500 });
  }
  const fin = await api(`${API}/media/upload/${id}/finalize`, { method: "POST", headers: auth });
  let info = fin.data?.processing_info;
  while (info && (info.state === "pending" || info.state === "in_progress")) {
    await sleep((info.check_after_secs ?? 3) * 1000);
    const s = await api(`${API}/media/upload?command=STATUS&media_id=${id}`, { headers: auth });
    info = s.data?.processing_info;
  }
  if (info?.state === "failed") throw new PublishError(`X could not process media: ${info.error?.message ?? "failed"}`);
  return id;
}
