import { api } from "./http";
import type { PlatformId } from "./registry";
import type { ConnectedAccount } from "./types";

/** Validates app-password / token style connections and returns the account to store. */
export async function verifyCredentials(platform: PlatformId, f: Record<string, string>): Promise<ConnectedAccount> {
  switch (platform) {
    case "bluesky": {
      const service = (f.service || "https://bsky.social").replace(/\/$/, "");
      const identifier = f.identifier.trim().replace(/^@/, "");
      const session = await api(`${service}/xrpc/com.atproto.server.createSession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password: f.password.trim() }),
      });
      const profile = await api(`${service}/xrpc/app.bsky.actor.getProfile?actor=${session.did}`, {
        headers: { Authorization: `Bearer ${session.accessJwt}` },
      }).catch(() => ({}) as any);
      return {
        external_id: session.did,
        account_type: "profile",
        handle: session.handle,
        display_name: profile.displayName || session.handle,
        avatar_url: profile.avatar ?? null,
        credential: { identifier, password: f.password.trim(), service, did: session.did },
      };
    }
    case "mastodon": {
      const instance = f.instance.trim().replace(/\/$/, "");
      const me = await api(`${instance}/api/v1/accounts/verify_credentials`, {
        headers: { Authorization: `Bearer ${f.token.trim()}` },
      });
      return {
        external_id: `${new URL(instance).host}:${me.id}`,
        account_type: "profile",
        handle: `@${me.acct}@${new URL(instance).host}`,
        display_name: me.display_name || me.username,
        avatar_url: me.avatar ?? null,
        credential: { access_token: f.token.trim(), instance },
      };
    }
    case "telegram": {
      const token = f.bot_token.trim();
      const chatId = f.chat_id.trim();
      const bot = await api(`https://api.telegram.org/bot${token}/getMe`);
      const chat = await api(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`);
      const c = chat.result;
      return {
        external_id: String(c.id),
        account_type: c.type,
        handle: c.username ? `@${c.username}` : null,
        display_name: c.title ?? c.username ?? chatId,
        avatar_url: null,
        settings: { bot_username: bot.result?.username },
        credential: { bot_token: token, chat_id: String(c.id) },
      };
    }
    default:
      throw new Error(`${platform} connects with OAuth, not credentials`);
  }
}
