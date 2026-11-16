// Client-safe platform metadata (no secrets). Drives the Channels page, composer limits and validation.

export type PlatformId =
  | "facebook"
  | "instagram"
  | "threads"
  | "linkedin"
  | "x"
  | "tiktok"
  | "youtube"
  | "pinterest"
  | "gbp"
  | "bluesky"
  | "mastodon"
  | "telegram";

export type CredentialField = {
  name: string;
  label: string;
  type?: "text" | "password" | "url";
  placeholder?: string;
  help?: string;
};

export type PlatformMeta = {
  id: PlatformId;
  name: string;
  color: string; // brand accent for chips/avatars
  short: string; // 1–2 letter badge
  auth: "oauth" | "credentials";
  connectsAs: string; // what gets connected
  textLimit: number;
  media: "optional" | "required" | "video-required" | "image-required";
  maxImages: number; // 0 = images not supported
  video: boolean;
  needsTitle?: boolean;
  /** Server env vars required for OAuth platforms. */
  env?: string[];
  /** Platform review/approval caveat shown on the Channels page. */
  note?: string;
  fields?: CredentialField[];
  docs: string;
};

export const PLATFORMS: PlatformMeta[] = [
  {
    id: "facebook",
    name: "Facebook",
    color: "#1877F2",
    short: "f",
    auth: "oauth",
    connectsAs: "Facebook Pages you manage",
    textLimit: 63206,
    media: "optional",
    maxImages: 10,
    video: true,
    env: ["META_APP_ID", "META_APP_SECRET"],
    note: "Works in Meta's development mode for Pages owned by the app's admins. Business verification recommended.",
    docs: "https://developers.facebook.com/docs/pages-api/posts",
  },
  {
    id: "instagram",
    name: "Instagram",
    color: "#E1306C",
    short: "IG",
    auth: "oauth",
    connectsAs: "Instagram professional accounts linked to your Facebook Pages",
    textLimit: 2200,
    media: "required",
    maxImages: 10,
    video: true,
    env: ["META_APP_ID", "META_APP_SECRET"],
    note: "Account must be Business/Creator and linked to a Facebook Page. Every post needs an image or video.",
    docs: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  },
  {
    id: "threads",
    name: "Threads",
    color: "#111111",
    short: "@",
    auth: "oauth",
    connectsAs: "Threads profile",
    textLimit: 500,
    media: "optional",
    maxImages: 10,
    video: true,
    env: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
    docs: "https://developers.facebook.com/docs/threads",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0A66C2",
    short: "in",
    auth: "oauth",
    connectsAs: "Your LinkedIn profile, plus company Pages once LinkedIn approves page access",
    textLimit: 3000,
    media: "optional",
    maxImages: 20,
    video: true,
    env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    note: "Company Page posting needs LinkedIn's Community Management API approval (set LINKEDIN_ORG_ACCESS=true once approved).",
    docs: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api",
  },
  {
    id: "x",
    name: "X (Twitter)",
    color: "#000000",
    short: "X",
    auth: "oauth",
    connectsAs: "X account",
    textLimit: 280,
    media: "optional",
    maxImages: 4,
    video: true,
    env: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    note: "Pay-per-use API: about $0.015 per post, about $0.20 for posts containing a link.",
    docs: "https://docs.x.com/x-api/posts/manage-tweets/introduction",
  },
  {
    id: "tiktok",
    name: "TikTok",
    color: "#010101",
    short: "TT",
    auth: "oauth",
    connectsAs: "TikTok account",
    textLimit: 2200,
    media: "video-required",
    maxImages: 0,
    video: true,
    env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    note: "Until TikTok audits the app, posts are private (only you). Use 'Send to TikTok inbox' mode to finish posts in the app.",
    docs: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  },
  {
    id: "youtube",
    name: "YouTube",
    color: "#FF0000",
    short: "YT",
    auth: "oauth",
    connectsAs: "YouTube channel",
    textLimit: 5000,
    media: "video-required",
    maxImages: 0,
    video: true,
    needsTitle: true,
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    note: "Uploads stay private until Google completes the API compliance audit for the project.",
    docs: "https://developers.google.com/youtube/v3/docs/videos/insert",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    color: "#E60023",
    short: "P",
    auth: "oauth",
    connectsAs: "Pinterest business account (pins to a board)",
    textLimit: 500,
    media: "image-required",
    maxImages: 1,
    video: false,
    needsTitle: true,
    env: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
    note: "Trial access works for your own account; request Standard access for production volume.",
    docs: "https://developers.pinterest.com/docs/api/v5/pins-create",
  },
  {
    id: "gbp",
    name: "Google Business Profile",
    color: "#4285F4",
    short: "G",
    auth: "oauth",
    connectsAs: "Business locations you manage",
    textLimit: 1500,
    media: "optional",
    maxImages: 1,
    video: false,
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    note: "Google must approve Business Profile API access for your Cloud project.",
    docs: "https://developers.google.com/my-business/content/posts-data",
  },
  {
    id: "bluesky",
    name: "Bluesky",
    color: "#0085FF",
    short: "B",
    auth: "credentials",
    connectsAs: "Bluesky account (app password)",
    textLimit: 300,
    media: "optional",
    maxImages: 4,
    video: false,
    fields: [
      { name: "identifier", label: "Handle", placeholder: "canadiansme.bsky.social" },
      { name: "password", label: "App password", type: "password", help: "Settings → Privacy and security → App passwords. Never use your main password." },
      { name: "service", label: "Server (optional)", type: "url", placeholder: "https://bsky.social" },
    ],
    docs: "https://docs.bsky.app/docs/advanced-guides/posts",
  },
  {
    id: "mastodon",
    name: "Mastodon",
    color: "#6364FF",
    short: "M",
    auth: "credentials",
    connectsAs: "Mastodon account",
    textLimit: 500,
    media: "optional",
    maxImages: 4,
    video: true,
    fields: [
      { name: "instance", label: "Instance URL", type: "url", placeholder: "https://mastodon.social" },
      { name: "token", label: "Access token", type: "password", help: "Preferences → Development → New application (scopes: read, write:statuses, write:media) → copy the access token." },
    ],
    docs: "https://docs.joinmastodon.org/methods/statuses/",
  },
  {
    id: "telegram",
    name: "Telegram",
    color: "#26A5E4",
    short: "T",
    auth: "credentials",
    connectsAs: "Telegram channel or group (via your bot)",
    textLimit: 4096,
    media: "optional",
    maxImages: 10,
    video: true,
    fields: [
      { name: "bot_token", label: "Bot token", type: "password", help: "Create a bot with @BotFather, then add it as an admin of your channel." },
      { name: "chat_id", label: "Channel", placeholder: "@canadiansme or -100123456789" },
    ],
    docs: "https://core.telegram.org/bots/api#sendmessage",
  },
];

export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as Record<PlatformId, PlatformMeta>;

export function isPlatformId(v: string): v is PlatformId {
  return v in PLATFORM_BY_ID;
}

/** Grapheme-ish length (counts emoji as 1) — close enough for limit warnings. */
export function textLength(text: string): number {
  return Array.from(text).length;
}
