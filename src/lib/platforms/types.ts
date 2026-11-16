import type { PlatformId } from "./registry";

/** What we store (encrypted) per connected account. */
export type Credential = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string; // ISO
  /** Platform-specific extras: Bluesky password/service, Telegram bot token, Mastodon instance, etc. */
  [k: string]: unknown;
};

export type ConnectedAccount = {
  /** Set when one login connects several platforms (Meta Business Suite → Facebook + Instagram). */
  platform?: PlatformId;
  external_id: string;
  account_type?: string;
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  settings?: Record<string, unknown>;
  token_expires_at?: string | null;
  credential: Credential;
};

export type SocialAccountRow = {
  id: string;
  workspace_id: string;
  platform: PlatformId;
  external_id: string;
  account_type: string | null;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: "active" | "reconnect_needed" | "disabled";
  token_expires_at: string | null;
  settings: Record<string, unknown>;
  last_error: string | null;
  region?: string;
};

export type MediaRow = {
  id: string;
  public_url: string;
  kind: "image" | "video";
  mime_type: string | null;
  bytes: number | null;
  alt_text: string | null;
};

export type VariantRow = {
  id: string;
  post_id: string;
  workspace_id: string;
  account_id: string;
  body: string;
  title: string | null;
  link_url: string | null;
  media_ids: string[];
  options: Record<string, unknown>;
  status: string;
  scheduled_at: string | null;
  attempts: number;
};

export type PublishInput = {
  account: SocialAccountRow;
  credential: Credential;
  text: string;
  title: string | null;
  link: string | null;
  media: MediaRow[];
  options: Record<string, unknown>;
};

export type PublishResult = { id: string; url?: string | null; note?: string };

/** Error with retry/auth classification for the publisher. */
export class PublishError extends Error {
  constructor(
    message: string,
    public opts: { retryable?: boolean; auth?: boolean; status?: number; body?: unknown } = {},
  ) {
    super(message);
  }
}
