import { api, download, sleep } from "../http";
import { PublishError, type PublishInput, type PublishResult } from "../types";

const VERSION = () => process.env.LINKEDIN_VERSION ?? "202510";

/** LinkedIn "little text" format reserves these characters in commentary. */
function escapeCommentary(text: string) {
  return text.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`);
}

export async function publishLinkedIn({ account, credential, text, title, link, media }: PublishInput): Promise<PublishResult> {
  const token = credential.access_token as string;
  const author = account.external_id; // urn:li:person:… or urn:li:organization:…
  const headers = {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": VERSION(),
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };

  const images = media.filter((m) => m.kind === "image");
  const videos = media.filter((m) => m.kind === "video");
  let content: Record<string, unknown> | undefined;
  let commentary = text;

  if (videos.length) {
    const urn = await uploadVideo(videos[0].public_url, author, headers);
    content = { media: { id: urn, title: title ?? undefined } };
    if (link && !text.includes(link)) commentary = `${text}\n\n${link}`;
  } else if (images.length === 1) {
    content = { media: { id: await uploadImage(images[0].public_url, author, headers), altText: images[0].alt_text ?? undefined } };
    if (link && !text.includes(link)) commentary = `${text}\n\n${link}`;
  } else if (images.length > 1) {
    const ids = [];
    for (const img of images.slice(0, 20)) ids.push({ id: await uploadImage(img.public_url, author, headers), altText: img.alt_text ?? undefined });
    content = { multiImage: { images: ids } };
    if (link && !text.includes(link)) commentary = `${text}\n\n${link}`;
  } else if (link) {
    content = { article: { source: link, title: title || link } };
  }

  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers,
    body: JSON.stringify({
      author,
      commentary: escapeCommentary(commentary),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(content ? { content } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new PublishError(`LinkedIn ${res.status}: ${body.slice(0, 300)}`, {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
      auth: res.status === 401,
    });
  }
  const id = res.headers.get("x-restli-id") ?? "";
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : null };
}

async function uploadImage(url: string, owner: string, headers: Record<string, string>) {
  const init = await api("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers,
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const { bytes, type } = await download(url);
  const put = await fetch(init.value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: headers.Authorization, "Content-Type": type },
    body: bytes,
  });
  if (!put.ok) throw new PublishError(`LinkedIn image upload failed (${put.status})`, { retryable: put.status >= 500 });
  return init.value.image as string;
}

async function uploadVideo(url: string, owner: string, headers: Record<string, string>) {
  const { bytes } = await download(url);
  const init = await api("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers,
    body: JSON.stringify({
      initializeUploadRequest: { owner, fileSizeBytes: bytes.byteLength, uploadCaptions: false, uploadThumbnail: false },
    }),
  });
  const v = init.value;
  const etags: string[] = [];
  for (const ins of v.uploadInstructions) {
    const chunk = bytes.slice(ins.firstByte, ins.lastByte + 1);
    const put = await fetch(ins.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
    if (!put.ok) throw new PublishError(`LinkedIn video upload failed (${put.status})`, { retryable: true });
    etags.push(put.headers.get("etag") ?? "");
  }
  await api("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    method: "POST",
    headers,
    body: JSON.stringify({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken ?? "", uploadedPartIds: etags } }),
  });
  // Wait until LinkedIn has processed the video.
  for (let i = 0; i < 60; i++) {
    const s = await api(`https://api.linkedin.com/rest/videos/${encodeURIComponent(v.video)}`, { headers });
    if (s.status === "AVAILABLE") break;
    if (s.status === "PROCESSING_FAILED") throw new PublishError("LinkedIn could not process the video");
    await sleep(5000);
  }
  return v.video as string;
}
