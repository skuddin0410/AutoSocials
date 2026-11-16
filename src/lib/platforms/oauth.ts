import { pkceChallenge } from "../crypto";
import { api, basicAuth, redirectUri, requireEnv } from "./http";
import type { PlatformId } from "./registry";
import type { ConnectedAccount, Credential } from "./types";

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v24.0"}`;
const LI_VERSION = () => process.env.LINKEDIN_VERSION ?? "202510";

const META_SCOPES: Record<"facebook" | "instagram", string[]> = {
  facebook: ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "business_management"],
  instagram: [
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
    "instagram_basic",
    "instagram_content_publish",
  ],
};

const expiresAt = (seconds?: number) => (seconds ? new Date(Date.now() + seconds * 1000).toISOString() : undefined);

// ───────────────────────────── Authorization URLs ─────────────────────────────

export function buildAuthUrl(platform: PlatformId, state: string, verifier: string): string {
  const redirect = redirectUri(platform);
  switch (platform) {
    case "facebook":
    case "instagram": {
      const [appId] = requireEnv("META_APP_ID", "META_APP_SECRET");
      const u = new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION ?? "v24.0"}/dialog/oauth`);
      u.search = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirect,
        state,
        response_type: "code",
        scope: META_SCOPES[platform].join(","),
      }).toString();
      return u.toString();
    }
    case "threads": {
      const [appId] = requireEnv("THREADS_APP_ID", "THREADS_APP_SECRET");
      return `https://threads.net/oauth/authorize?${new URLSearchParams({
        client_id: appId,
        redirect_uri: redirect,
        scope: "threads_basic,threads_content_publish",
        response_type: "code",
        state,
      })}`;
    }
    case "linkedin": {
      const [id] = requireEnv("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET");
      const scopes = ["openid", "profile", "w_member_social"];
      if (process.env.LINKEDIN_ORG_ACCESS === "true") scopes.push("r_organization_admin", "w_organization_social", "rw_organization_admin");
      return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
        response_type: "code",
        client_id: id,
        redirect_uri: redirect,
        state,
        scope: scopes.join(" "),
      })}`;
    }
    case "x": {
      const [id] = requireEnv("X_CLIENT_ID");
      return `https://x.com/i/oauth2/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: id,
        redirect_uri: redirect,
        scope: "tweet.read tweet.write users.read offline.access media.write",
        state,
        code_challenge: pkceChallenge(verifier),
        code_challenge_method: "S256",
      })}`;
    }
    case "tiktok": {
      const [key] = requireEnv("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET");
      return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
        client_key: key,
        scope: "user.info.basic,video.publish,video.upload",
        response_type: "code",
        redirect_uri: redirect,
        state,
      })}`;
    }
    case "youtube":
    case "gbp": {
      const [id] = requireEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
      const scope =
        platform === "youtube"
          ? "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"
          : "https://www.googleapis.com/auth/business.manage";
      return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: id,
        redirect_uri: redirect,
        response_type: "code",
        scope,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      })}`;
    }
    case "pinterest": {
      const [id] = requireEnv("PINTEREST_APP_ID", "PINTEREST_APP_SECRET");
      return `https://www.pinterest.com/oauth/?${new URLSearchParams({
        client_id: id,
        redirect_uri: redirect,
        response_type: "code",
        scope: "boards:read,pins:read,pins:write,user_accounts:read",
        state,
      })}`;
    }
    default:
      throw new Error(`${platform} does not use OAuth`);
  }
}

// ───────────────────────────── Callback: code → accounts ─────────────────────────────

export async function handleCallback(platform: PlatformId, code: string, verifier: string): Promise<ConnectedAccount[]> {
  const redirect = redirectUri(platform);
  switch (platform) {
    case "facebook":
    case "instagram":
      return metaCallback(platform, code, redirect);

    case "threads": {
      const [id, secret] = requireEnv("THREADS_APP_ID", "THREADS_APP_SECRET");
      const short = await api("https://graph.threads.net/oauth/access_token", {
        form: { client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirect, code },
      });
      const long = await api(
        `https://graph.threads.net/access_token?${new URLSearchParams({
          grant_type: "th_exchange_token",
          client_secret: secret,
          access_token: short.access_token,
        })}`,
      );
      const me = await api(
        `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${long.access_token}`,
      );
      return [
        {
          external_id: String(me.id),
          account_type: "profile",
          handle: me.username,
          display_name: me.username,
          avatar_url: me.threads_profile_picture_url ?? null,
          token_expires_at: expiresAt(long.expires_in),
          credential: { access_token: long.access_token, expires_at: expiresAt(long.expires_in) },
        },
      ];
    }

    case "linkedin": {
      const [id, secret] = requireEnv("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET");
      const tok = await api("https://www.linkedin.com/oauth/v2/accessToken", {
        form: { grant_type: "authorization_code", code, redirect_uri: redirect, client_id: id, client_secret: secret },
      });
      const cred: Credential = {
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: expiresAt(tok.expires_in),
      };
      const me = await api("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
      const out: ConnectedAccount[] = [
        {
          external_id: `urn:li:person:${me.sub}`,
          account_type: "profile",
          handle: me.email ?? null,
          display_name: me.name,
          avatar_url: me.picture ?? null,
          token_expires_at: cred.expires_at,
          credential: cred,
        },
      ];
      if (process.env.LINKEDIN_ORG_ACCESS === "true") {
        const headers = {
          Authorization: `Bearer ${tok.access_token}`,
          "LinkedIn-Version": LI_VERSION(),
          "X-Restli-Protocol-Version": "2.0.0",
        };
        const acls = await api("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED", { headers });
        const orgUrns = Array.from(new Set<string>((acls.elements ?? []).map((e: any) => e.organization)));
        for (const urn of orgUrns) {
          const orgId = urn.split(":").pop();
          const org = await api(`https://api.linkedin.com/rest/organizations/${orgId}`, { headers }).catch(() => null);
          out.push({
            external_id: urn,
            account_type: "page",
            handle: org?.vanityName ?? null,
            display_name: org?.localizedName ?? `Company ${orgId}`,
            avatar_url: null,
            token_expires_at: cred.expires_at,
            credential: cred,
          });
        }
      }
      return out;
    }

    case "x": {
      const [id, secret] = requireEnv("X_CLIENT_ID", "X_CLIENT_SECRET");
      const tok = await api("https://api.x.com/2/oauth2/token", {
        headers: { Authorization: basicAuth(id, secret) },
        form: { grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier, client_id: id },
      });
      const me = await api("https://api.x.com/2/users/me?user.fields=profile_image_url", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      return [
        {
          external_id: me.data.id,
          account_type: "profile",
          handle: me.data.username,
          display_name: me.data.name,
          avatar_url: me.data.profile_image_url ?? null,
          token_expires_at: expiresAt(tok.expires_in),
          credential: { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: expiresAt(tok.expires_in) },
        },
      ];
    }

    case "tiktok": {
      const [key, secret] = requireEnv("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET");
      const tok = await api("https://open.tiktokapis.com/v2/oauth/token/", {
        form: { client_key: key, client_secret: secret, code, grant_type: "authorization_code", redirect_uri: redirect },
      });
      if (tok.error) throw new Error(tok.error_description ?? tok.error);
      const info = await api("https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      const u = info.data?.user ?? {};
      return [
        {
          external_id: tok.open_id ?? u.open_id,
          account_type: "profile",
          handle: u.display_name ?? null,
          display_name: u.display_name ?? "TikTok account",
          avatar_url: u.avatar_url ?? null,
          token_expires_at: expiresAt(tok.expires_in),
          credential: {
            access_token: tok.access_token,
            refresh_token: tok.refresh_token,
            expires_at: expiresAt(tok.expires_in),
            refresh_expires_at: expiresAt(tok.refresh_expires_in),
          },
        },
      ];
    }

    case "youtube":
    case "gbp": {
      const tok = await googleToken({ grant_type: "authorization_code", code, redirect_uri: redirect });
      const cred: Credential = {
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: expiresAt(tok.expires_in),
      };
      const auth = { Authorization: `Bearer ${tok.access_token}` };
      if (platform === "youtube") {
        const ch = await api("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: auth });
        return (ch.items ?? []).map((c: any) => ({
          external_id: c.id,
          account_type: "channel",
          handle: c.snippet?.customUrl ?? null,
          display_name: c.snippet?.title,
          avatar_url: c.snippet?.thumbnails?.default?.url ?? null,
          token_expires_at: cred.expires_at,
          credential: cred,
        }));
      }
      const accounts = await api("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: auth });
      const out: ConnectedAccount[] = [];
      for (const acc of accounts.accounts ?? []) {
        const locs = await api(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title&pageSize=100`,
          { headers: auth },
        );
        for (const loc of locs.locations ?? []) {
          out.push({
            external_id: `${acc.name}/${loc.name}`, // accounts/123/locations/456
            account_type: "location",
            handle: null,
            display_name: loc.title,
            avatar_url: null,
            token_expires_at: cred.expires_at,
            credential: cred,
          });
        }
      }
      return out;
    }

    case "pinterest": {
      const [id, secret] = requireEnv("PINTEREST_APP_ID", "PINTEREST_APP_SECRET");
      const tok = await api("https://api.pinterest.com/v5/oauth/token", {
        headers: { Authorization: basicAuth(id, secret) },
        form: { grant_type: "authorization_code", code, redirect_uri: redirect },
      });
      const auth = { Authorization: `Bearer ${tok.access_token}` };
      const me = await api("https://api.pinterest.com/v5/user_account", { headers: auth });
      const boards = await api("https://api.pinterest.com/v5/boards?page_size=100", { headers: auth });
      const boardList = (boards.items ?? []).map((b: any) => ({ id: b.id, name: b.name }));
      return [
        {
          external_id: me.username,
          account_type: "profile",
          handle: me.username,
          display_name: me.business_name || me.username,
          avatar_url: me.profile_image ?? null,
          settings: { boards: boardList, default_board_id: boardList[0]?.id ?? null },
          token_expires_at: expiresAt(tok.expires_in),
          credential: { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: expiresAt(tok.expires_in) },
        },
      ];
    }

    default:
      throw new Error(`${platform} does not use OAuth`);
  }
}

async function metaCallback(platform: "facebook" | "instagram", code: string, redirect: string): Promise<ConnectedAccount[]> {
  const [appId, secret] = requireEnv("META_APP_ID", "META_APP_SECRET");
  const short = await api(
    `${GRAPH()}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: redirect, code })}`,
  );
  // Long-lived user token → Page tokens derived from it don't expire.
  const long = await api(
    `${GRAPH()}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: secret,
      fb_exchange_token: short.access_token,
    })}`,
  );
  const pages = await api(
    `${GRAPH()}/me/accounts?${new URLSearchParams({
      fields: "id,name,username,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
      limit: "100",
      access_token: long.access_token,
    })}`,
  );
  const out: ConnectedAccount[] = [];
  for (const p of pages.data ?? []) {
    if (platform === "facebook") {
      out.push({
        external_id: p.id,
        account_type: "page",
        handle: p.username ?? null,
        display_name: p.name,
        avatar_url: p.picture?.data?.url ?? null,
        credential: { access_token: p.access_token },
      });
    } else if (p.instagram_business_account) {
      const ig = p.instagram_business_account;
      out.push({
        external_id: ig.id,
        account_type: "business",
        handle: ig.username,
        display_name: ig.name || ig.username,
        avatar_url: ig.profile_picture_url ?? null,
        settings: { page_id: p.id, page_name: p.name },
        credential: { access_token: p.access_token },
      });
    }
  }
  if (!out.length) {
    throw new Error(
      platform === "instagram"
        ? "No Instagram professional accounts found. Link your Instagram Business/Creator account to a Facebook Page you manage, then try again."
        : "No Facebook Pages found. Make sure you selected your Pages in the Facebook permission screen.",
    );
  }
  return out;
}

async function googleToken(form: Record<string, string>) {
  const [id, secret] = requireEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  return api("https://oauth2.googleapis.com/token", { form: { client_id: id, client_secret: secret, ...form } });
}

// ───────────────────────────── Token refresh ─────────────────────────────

/** Returns a refreshed credential if it was (nearly) expired, otherwise null. */
export async function refreshIfNeeded(platform: PlatformId, cred: Credential): Promise<Credential | null> {
  if (!cred.expires_at) return null;
  const msLeft = new Date(cred.expires_at).getTime() - Date.now();
  const threshold = platform === "threads" ? 7 * 86400_000 : 5 * 60_000;
  if (msLeft > threshold) return null;

  switch (platform) {
    case "x": {
      if (!cred.refresh_token) return null;
      const [id, secret] = requireEnv("X_CLIENT_ID", "X_CLIENT_SECRET");
      const t = await api("https://api.x.com/2/oauth2/token", {
        headers: { Authorization: basicAuth(id, secret) },
        form: { grant_type: "refresh_token", refresh_token: cred.refresh_token, client_id: id },
      });
      return { ...cred, access_token: t.access_token, refresh_token: t.refresh_token ?? cred.refresh_token, expires_at: expiresAt(t.expires_in) };
    }
    case "tiktok": {
      if (!cred.refresh_token) return null;
      const [key, secret] = requireEnv("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET");
      const t = await api("https://open.tiktokapis.com/v2/oauth/token/", {
        form: { client_key: key, client_secret: secret, grant_type: "refresh_token", refresh_token: cred.refresh_token },
      });
      return { ...cred, access_token: t.access_token, refresh_token: t.refresh_token ?? cred.refresh_token, expires_at: expiresAt(t.expires_in) };
    }
    case "youtube":
    case "gbp": {
      if (!cred.refresh_token) return null;
      const t = await googleToken({ grant_type: "refresh_token", refresh_token: cred.refresh_token });
      return { ...cred, access_token: t.access_token, expires_at: expiresAt(t.expires_in) };
    }
    case "pinterest": {
      if (!cred.refresh_token) return null;
      const [id, secret] = requireEnv("PINTEREST_APP_ID", "PINTEREST_APP_SECRET");
      const t = await api("https://api.pinterest.com/v5/oauth/token", {
        headers: { Authorization: basicAuth(id, secret) },
        form: { grant_type: "refresh_token", refresh_token: cred.refresh_token },
      });
      return { ...cred, access_token: t.access_token, refresh_token: t.refresh_token ?? cred.refresh_token, expires_at: expiresAt(t.expires_in) };
    }
    case "threads": {
      const t = await api(
        `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${cred.access_token}`,
      );
      return { ...cred, access_token: t.access_token, expires_at: expiresAt(t.expires_in) };
    }
    case "linkedin": {
      if (!cred.refresh_token) return null; // only partner apps get refresh tokens; otherwise reconnect every ~60 days
      const [id, secret] = requireEnv("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET");
      const t = await api("https://www.linkedin.com/oauth/v2/accessToken", {
        form: { grant_type: "refresh_token", refresh_token: cred.refresh_token, client_id: id, client_secret: secret },
      });
      return { ...cred, access_token: t.access_token, refresh_token: t.refresh_token ?? cred.refresh_token, expires_at: expiresAt(t.expires_in) };
    }
    default:
      return null;
  }
}
