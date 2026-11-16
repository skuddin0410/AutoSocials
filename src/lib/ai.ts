/**
 * AI captions via the Claude API. Needs ANTHROPIC_API_KEY (console.anthropic.com).
 * Optional ANTHROPIC_MODEL (default claude-sonnet-5-5). Framework-agnostic.
 */
import { PLATFORM_BY_ID, type PlatformId } from "./platforms/registry";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const DEFAULT_VOICE =
  "CanadianSME Small Business Magazine: Canada's leading platform for small business insights. Professional, warm and practical. " +
  "Speak to Canadian small and medium business owners and entrepreneurs. Canadian spelling. No hype, no clickbait, at most one or two emojis. " +
  "Facts only from the source; never invent numbers, quotes or names.";

const RULES: Partial<Record<PlatformId, string>> = {
  x: "Max 260 characters including the link. One strong line, 1–2 hashtags max.",
  bluesky: "Max 280 characters including the link. Conversational, no hashtags or one at most.",
  threads: "Max 450 characters. Conversational, 0–2 hashtags.",
  linkedin: "120–220 words. Hook in the first line, short paragraphs, a takeaway for business owners, 3–4 relevant hashtags at the end.",
  facebook: "60–120 words. Friendly, clear call to read more, 1–3 hashtags.",
  instagram: "80–150 words. Hook first line, line breaks, mention 'link in bio' instead of pasting a URL, 5–8 relevant hashtags at the end.",
  tiktok: "Max 150 characters plus 3–5 hashtags. Punchy.",
  youtube: "2–4 sentence description with the link at the end.",
  pinterest: "1–2 sentences, keyword-rich, no hashtags.",
  gbp: "50–90 words, plain and informative, no hashtags.",
  mastodon: "Max 450 characters, 1–3 CamelCase hashtags.",
  telegram: "Short paragraph plus the link.",
};

export type CaptionRequest = {
  brandVoice?: string | null;
  topic?: string; // what the user typed or the article title
  sourceText?: string; // article summary / user draft
  link?: string | null;
  platforms: PlatformId[];
};

export type CaptionResult = { base: string; perPlatform: Partial<Record<PlatformId, string>> };

export async function generateCaptions(req: CaptionRequest): Promise<CaptionResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI writing is off. Add ANTHROPIC_API_KEY to the app's environment variables.");
  const platforms = Array.from(new Set(req.platforms));

  const system = [
    "You write social media posts for a magazine's social team.",
    `Brand voice: ${req.brandVoice?.trim() || DEFAULT_VOICE}`,
    "Return ONLY a JSON object, no prose, shaped as {\"base\": string, \"perPlatform\": {<platform id>: string}}.",
    "\"base\" is a versatile 1–3 sentence post that works on most networks.",
    "Include the link in posts where the rules allow it (not Instagram/TikTok/Pinterest).",
  ].join("\n");

  const user = [
    req.topic ? `Topic / headline: ${req.topic}` : "",
    req.sourceText ? `Source text:\n${req.sourceText.slice(0, 6000)}` : "",
    req.link ? `Link: ${req.link}` : "",
    "Write one version per platform:",
    ...platforms.map((p) => `- ${p} (${PLATFORM_BY_ID[p].name}, limit ${PLATFORM_BY_ID[p].textLimit} chars): ${RULES[p] ?? "Keep it concise."}`),
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${body?.error?.message ?? "unknown error"}`);
  const text: string = (body.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: CaptionResult;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The AI reply couldn't be read. Try again.");
  }
  // Enforce hard limits so an over-long caption can never block publishing.
  const perPlatform: CaptionResult["perPlatform"] = {};
  for (const p of platforms) {
    const v = parsed.perPlatform?.[p];
    if (typeof v === "string" && v.trim()) perPlatform[p] = Array.from(v.trim()).slice(0, PLATFORM_BY_ID[p].textLimit).join("");
  }
  return { base: String(parsed.base ?? "").trim(), perPlatform };
}
