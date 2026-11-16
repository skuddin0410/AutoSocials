"use server";
import { revalidatePath } from "next/cache";
import { PLATFORM_BY_ID, textLength, type PlatformId } from "@/lib/platforms/registry";
import { zonedLocalToUtcIso } from "@/lib/time";
import { triggerPublisher } from "@/lib/trigger";
import { aiEnabled, generateCaptions } from "@/lib/ai";
import { canEdit, getContext, isAdmin } from "@/lib/workspace";

export type ComposePayload = {
  baseText: string;
  link: string;
  mediaIds: string[];
  accountIds: string[];
  overrides: Partial<Record<PlatformId, string>>;
  title: string;
  options: Record<string, unknown>; // { tiktok_mode, privacy_level, youtube_privacy, boards: {accountId: boardId} }
  mode: "now" | "schedule" | "draft" | "queue" | "library";
  categoryId?: string | null;
  scheduledLocal?: string; // "YYYY-MM-DDTHH:mm" in brand timezone
};

export type ComposeResult = { ok: true; count: number; when: string | null } | { ok: false; error: string };

export async function createPost(p: ComposePayload): Promise<ComposeResult> {
  const { supabase, user, workspace, role } = await getContext();
  if (!canEdit(role)) return { ok: false, error: "Viewers can't create posts." };
  if (!p.accountIds.length) return { ok: false, error: "Pick at least one channel." };
  if (!p.baseText.trim() && !p.mediaIds.length) return { ok: false, error: "Write something or add media." };

  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id,platform,status")
    .eq("workspace_id", workspace.id)
    .in("id", p.accountIds);
  if (!accounts?.length) return { ok: false, error: "Those channels aren't connected to this brand." };

  const { data: media } = p.mediaIds.length
    ? await supabase.from("media_assets").select("id,kind").in("id", p.mediaIds)
    : { data: [] as { id: string; kind: string }[] };
  const images = (media ?? []).filter((m) => m.kind === "image").length;
  const videos = (media ?? []).filter((m) => m.kind === "video").length;

  // Server-side validation mirrors the composer's warnings.
  const problems: string[] = [];
  for (const a of accounts) {
    const meta = PLATFORM_BY_ID[a.platform as PlatformId];
    const text = p.overrides[meta.id] ?? p.baseText;
    if (textLength(text) > meta.textLimit) problems.push(`${meta.name}: text is over ${meta.textLimit} characters`);
    if (meta.media === "required" && !images && !videos) problems.push(`${meta.name} needs an image or video`);
    if (meta.media === "video-required" && !videos) problems.push(`${meta.name} needs a video`);
    if (meta.media === "image-required" && !images) problems.push(`${meta.name} needs an image`);
    if (videos && !meta.video) problems.push(`${meta.name} doesn't support video here`);
    if (images > meta.maxImages && meta.maxImages > 0) problems.push(`${meta.name} allows up to ${meta.maxImages} images`);
  }
  if (problems.length) return { ok: false, error: Array.from(new Set(problems)).join(" · ") };

  // Save to a category library: no channel posts yet; the timetable fills category slots from it.
  if (p.mode === "library") {
    if (!p.categoryId) return { ok: false, error: "Pick a category to save into." };
    const { error } = await supabase.from("posts").insert({
      workspace_id: workspace.id,
      origin: "manual",
      base_text: p.baseText,
      link_url: p.link || null,
      media_ids: p.mediaIds,
      title: p.title || null,
      created_by: user.id,
      category_id: p.categoryId,
      in_library: true,
      overrides: p.overrides,
      account_ids: p.accountIds,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/content");
    return { ok: true, count: p.accountIds.length, when: null };
  }

  let scheduledAt: string | null = null;
  if (p.mode === "now") scheduledAt = new Date().toISOString();
  if (p.mode === "schedule") {
    if (!p.scheduledLocal) return { ok: false, error: "Pick a date and time." };
    scheduledAt = zonedLocalToUtcIso(p.scheduledLocal, workspace.timezone);
    if (new Date(scheduledAt).getTime() < Date.now() - 60_000) return { ok: false, error: "That time is in the past." };
  }

  const needsApproval = workspace.require_approval && !isAdmin(role) && p.mode !== "draft";
  const status = p.mode === "draft" ? "draft" : needsApproval ? "pending_approval" : "scheduled";

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({
      workspace_id: workspace.id,
      origin: "manual",
      base_text: p.baseText,
      link_url: p.link || null,
      media_ids: p.mediaIds,
      created_by: user.id,
      category_id: p.categoryId || null,
    })
    .select("id")
    .single();
  if (postErr) return { ok: false, error: postErr.message };

  const boards = (p.options.boards as Record<string, string>) ?? {};
  // "Add to queue": each channel gets its own next free posting time.
  const slots: Record<string, string> = {};
  if (p.mode === "queue") {
    const missing: string[] = [];
    for (const a of accounts) {
      const { data: slot } = await supabase.rpc("next_free_slot", { p_account: a.id });
      if (slot) slots[a.id] = slot as string;
      else missing.push(PLATFORM_BY_ID[a.platform as PlatformId].name);
    }
    if (missing.length) {
      await supabase.from("posts").delete().eq("id", post.id);
      return { ok: false, error: `Set posting times first for: ${Array.from(new Set(missing)).join(", ")} (Posting times page).` };
    }
  }

  const rows = accounts.map((a) => {
    const platform = a.platform as PlatformId;
    const options: Record<string, unknown> = {};
    if (platform === "tiktok") {
      options.tiktok_mode = p.options.tiktok_mode ?? "direct";
      options.privacy_level = p.options.privacy_level ?? "PUBLIC_TO_EVERYONE";
    }
    if (platform === "youtube") options.privacy = p.options.youtube_privacy ?? "public";
    if (platform === "pinterest" && boards[a.id]) options.board_id = boards[a.id];
    return {
      post_id: post.id,
      workspace_id: workspace.id,
      account_id: a.id,
      body: p.overrides[platform] ?? p.baseText,
      title: p.title || null,
      link_url: p.link || null,
      media_ids: p.mediaIds,
      options,
      status,
      scheduled_at: p.mode === "queue" ? slots[a.id] : scheduledAt,
      approved_by: status === "scheduled" ? user.id : null,
    };
  });
  const { error: vErr } = await supabase.from("post_variants").insert(rows);
  if (vErr) {
    await supabase.from("posts").delete().eq("id", post.id);
    return { ok: false, error: vErr.message };
  }

  if (p.mode === "now" && status === "scheduled") await triggerPublisher();
  revalidatePath("/calendar");
  revalidatePath("/posts");
  return { ok: true, count: rows.length, when: p.mode === "queue" ? Object.values(slots).sort()[0] ?? null : scheduledAt };
}

export type AiResult = { ok: true; base: string; perPlatform: Partial<Record<PlatformId, string>> } | { ok: false; error: string };

/** "Write with AI": drafts the main text plus a tailored version for each selected platform. */
export async function aiWrite(input: { topic: string; text: string; link: string; platforms: PlatformId[] }): Promise<AiResult> {
  const { workspace, role, supabase } = await getContext();
  if (!canEdit(role)) return { ok: false, error: "Viewers can't use AI writing." };
  if (!aiEnabled()) return { ok: false, error: "AI writing is off. Add ANTHROPIC_API_KEY in Netlify → Environment variables, then redeploy." };
  if (!input.platforms.length) return { ok: false, error: "Pick at least one channel first." };
  if (!input.topic.trim() && !input.text.trim() && !input.link.trim()) return { ok: false, error: "Type a topic, a rough draft or paste a link first." };
  const { data: ws } = await supabase.from("workspaces").select("brand_voice").eq("id", workspace.id).single();
  try {
    const r = await generateCaptions({
      brandVoice: ws?.brand_voice,
      topic: input.topic || undefined,
      sourceText: input.text || undefined,
      link: input.link || null,
      platforms: input.platforms,
    });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
