/**
 * The publishing engine. Framework-agnostic so it can run from a Next.js route,
 * a Netlify background function, or any cron runner.
 *
 * 1. Release posts stuck in "publishing" (crashed worker).
 * 2. Atomically claim due variants (FOR UPDATE SKIP LOCKED → a post can't go out twice).
 * 3. Refresh tokens if needed, call the platform adapter, record the attempt.
 * 4. Retry transient errors with backoff (1, 5, 15, 60 min); flag auth errors as "reconnect needed".
 */
import { loadCredential, saveCredential } from "./accounts";
import { refreshIfNeeded } from "./platforms/oauth";
import { publishFacebook, publishInstagram, publishThreads } from "./platforms/publishers/meta";
import { publishLinkedIn } from "./platforms/publishers/linkedin";
import { publishX } from "./platforms/publishers/x";
import { publishTikTok, publishYouTube } from "./platforms/publishers/video";
import { publishBluesky, publishGbp, publishMastodon, publishPinterest, publishTelegram } from "./platforms/publishers/others";
import type { PlatformId } from "./platforms/registry";
import { PublishError, type MediaRow, type PublishInput, type PublishResult, type SocialAccountRow, type VariantRow } from "./platforms/types";
import { createAdminClient } from "./supabase/admin";

const ADAPTERS: Record<PlatformId, (i: PublishInput) => Promise<PublishResult>> = {
  facebook: publishFacebook,
  instagram: publishInstagram,
  threads: publishThreads,
  linkedin: publishLinkedIn,
  x: publishX,
  tiktok: publishTikTok,
  youtube: publishYouTube,
  pinterest: publishPinterest,
  gbp: publishGbp,
  bluesky: publishBluesky,
  mastodon: publishMastodon,
  telegram: publishTelegram,
};

const BACKOFF_MIN = [1, 5, 15, 60];
const MAX_ATTEMPTS = 4;

export type RunSummary = { claimed: number; published: number; failed: number; released: number };

export async function runPublisher(opts: { limit?: number; deadlineMs?: number } = {}): Promise<RunSummary> {
  const admin = createAdminClient();
  const deadline = Date.now() + (opts.deadlineMs ?? 12 * 60_000);
  const summary: RunSummary = { claimed: 0, published: 0, failed: 0, released: 0 };

  const { data: released } = await admin.rpc("release_stuck_variants");
  summary.released = Number(released ?? 0);

  while (Date.now() < deadline) {
    const { data: batch, error } = await admin.rpc("claim_due_variants", { p_limit: opts.limit ?? 10 });
    if (error) throw new Error(`claim_due_variants: ${error.message}`);
    const variants = (batch ?? []) as VariantRow[];
    if (!variants.length) break;
    summary.claimed += variants.length;
    // Publish in parallel within a batch; each variant is independent.
    const results = await Promise.allSettled(variants.map((v) => publishOne(v)));
    for (const r of results) r.status === "fulfilled" && r.value ? summary.published++ : summary.failed++;
  }
  return summary;
}

async function publishOne(v: VariantRow): Promise<boolean> {
  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("publish_attempts")
    .insert({ variant_id: v.id, attempt_no: v.attempts })
    .select("id")
    .single();

  const finishAttempt = (fields: Record<string, unknown>) =>
    attempt ? admin.from("publish_attempts").update({ finished_at: new Date().toISOString(), ...fields }).eq("id", attempt.id) : null;

  let account: SocialAccountRow | null = null;
  try {
    const { data: acc } = await admin.from("social_accounts").select("*").eq("id", v.account_id).single();
    account = acc as SocialAccountRow | null;
    if (!account) throw new PublishError("Channel was removed.");
    if (account.status === "disabled") throw new PublishError("Channel is disabled.");

    let credential = await loadCredential(account.id);
    const refreshed = await refreshIfNeeded(account.platform, credential).catch((e) => {
      throw new PublishError(`Token refresh failed: ${(e as Error).message}`, { auth: true });
    });
    if (refreshed) {
      credential = refreshed;
      await saveCredential(account.id, refreshed);
      await admin.from("social_accounts").update({ token_expires_at: refreshed.expires_at ?? null }).eq("id", account.id);
    }

    let media: MediaRow[] = [];
    if (v.media_ids.length) {
      const { data } = await admin.from("media_assets").select("id,public_url,kind,mime_type,bytes,alt_text").in("id", v.media_ids);
      const byId = new Map((data ?? []).map((m: MediaRow) => [m.id, m]));
      media = v.media_ids.map((id) => byId.get(id)).filter(Boolean) as MediaRow[];
    }

    const result = await ADAPTERS[account.platform]({
      account,
      credential,
      text: v.body,
      title: v.title,
      link: v.link_url,
      media,
      options: v.options ?? {},
    });

    await admin
      .from("post_variants")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        external_post_id: result.id,
        external_url: result.url ?? null,
        last_error: result.note ?? null,
        next_attempt_at: null,
      })
      .eq("id", v.id);
    await finishAttempt({ success: true, response: result });
    if (account.status !== "active") await admin.from("social_accounts").update({ status: "active", last_error: null }).eq("id", account.id);
    return true;
  } catch (e) {
    const err = e instanceof PublishError ? e : new PublishError((e as Error).message ?? String(e), { retryable: true });
    const canRetry = err.opts.retryable && !err.opts.auth && v.attempts < MAX_ATTEMPTS;
    const next = canRetry ? new Date(Date.now() + BACKOFF_MIN[Math.min(v.attempts - 1, BACKOFF_MIN.length - 1)] * 60_000) : null;
    await admin
      .from("post_variants")
      .update({ status: "failed", last_error: err.message.slice(0, 1000), next_attempt_at: next?.toISOString() ?? null })
      .eq("id", v.id);
    await finishAttempt({
      success: false,
      error_message: err.message.slice(0, 2000),
      retryable: canRetry,
      response: (err.opts.body as object) ?? null,
    });
    if (err.opts.auth && account) {
      await admin
        .from("social_accounts")
        .update({ status: "reconnect_needed", last_error: err.message.slice(0, 500) })
        .eq("id", account.id);
    }
    return false;
  }
}
