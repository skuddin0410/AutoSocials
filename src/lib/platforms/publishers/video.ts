import { api, download } from "../http";
import { PublishError, type PublishInput, type PublishResult } from "../types";

// ───────────── TikTok ─────────────
export async function publishTikTok({ credential, text, media, options }: PublishInput): Promise<PublishResult> {
  const token = credential.access_token as string;
  const video = media.find((m) => m.kind === "video");
  if (!video) throw new PublishError("TikTok posts need a video.");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" };
  const { bytes, type } = await download(video.public_url);

  const size = bytes.byteLength;
  const CHUNK = 10 * 1024 * 1024;
  const chunkSize = size <= 64 * 1024 * 1024 ? size : CHUNK;
  const totalChunks = size <= 64 * 1024 * 1024 ? 1 : Math.floor(size / CHUNK);
  const source_info = { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: totalChunks };

  let initUrl: string;
  let payload: Record<string, unknown>;
  if (options.tiktok_mode === "inbox") {
    initUrl = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
    payload = { source_info };
  } else {
    const creator = await api("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { method: "POST", headers });
    const allowed: string[] = creator.data?.privacy_level_options ?? ["SELF_ONLY"];
    const wanted = (options.privacy_level as string) ?? "PUBLIC_TO_EVERYONE";
    initUrl = "https://open.tiktokapis.com/v2/post/publish/video/init/";
    payload = {
      post_info: {
        title: text.slice(0, 2200),
        privacy_level: allowed.includes(wanted) ? wanted : allowed.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : allowed[0],
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
        is_aigc: Boolean(options.is_aigc),
      },
      source_info,
    };
  }
  const init = await api(initUrl, { method: "POST", headers, body: JSON.stringify(payload) });
  if (init.error && init.error.code !== "ok") throw new PublishError(`TikTok: ${init.error.message || init.error.code}`);
  const uploadUrl = init.data.upload_url as string;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = i === totalChunks - 1 ? size : start + chunkSize; // last chunk takes the remainder
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": type || "video/mp4", "Content-Range": `bytes ${start}-${end - 1}/${size}` },
      body: bytes.slice(start, end),
    });
    if (!res.ok && res.status !== 206) throw new PublishError(`TikTok upload failed (${res.status})`, { retryable: res.status >= 500 });
  }
  return {
    id: init.data.publish_id,
    url: null,
    note: options.tiktok_mode === "inbox" ? "Sent to TikTok inbox — open TikTok to finish posting." : undefined,
  };
}

// ───────────── YouTube ─────────────
export async function publishYouTube({ credential, text, title, media, options }: PublishInput): Promise<PublishResult> {
  const token = credential.access_token as string;
  const video = media.find((m) => m.kind === "video");
  if (!video) throw new PublishError("YouTube needs a video.");
  const { bytes, type } = await download(video.public_url);
  const videoTitle = (title || text.split("\n")[0] || "New video").slice(0, 100);

  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": type || "video/mp4",
      "X-Upload-Content-Length": String(bytes.byteLength),
    },
    body: JSON.stringify({
      snippet: { title: videoTitle, description: text.slice(0, 5000), categoryId: (options.category_id as string) ?? "22" },
      status: { privacyStatus: (options.privacy as string) ?? "public", selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) {
    throw new PublishError(`YouTube ${init.status}: ${(await init.text()).slice(0, 300)}`, {
      status: init.status,
      retryable: init.status >= 500,
      auth: init.status === 401,
    });
  }
  const location = init.headers.get("location")!;
  const up = await fetch(location, { method: "PUT", headers: { "Content-Type": type || "video/mp4" }, body: bytes });
  const body = await up.json().catch(() => ({}));
  if (!up.ok) throw new PublishError(`YouTube upload failed (${up.status}): ${JSON.stringify(body).slice(0, 200)}`, { retryable: up.status >= 500 });
  return { id: body.id, url: `https://youtu.be/${body.id}` };
}
