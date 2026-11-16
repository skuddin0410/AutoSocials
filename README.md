# AutoSocials

In-house social media scheduler for **CanadianSME** (and, later, our other brands).
Write a post once, pick the channels, and publish now or schedule it. The app posts to every channel automatically.

**Channels supported:** Facebook Pages · Instagram · Threads · LinkedIn (profile + company Pages) · X · TikTok · YouTube · Pinterest · Google Business Profile · Bluesky · Mastodon · Telegram

**Stack:** Next.js 15 (App Router) · Supabase (Postgres, Auth, Storage, RLS) · Netlify (hosting + scheduled/background functions)

---

## How it works

```
Composer ──► posts + post_variants (one per channel, status = scheduled)
                       │
Netlify cron (every minute) ──► publish-background function (≤15 min)
                       │
             claim_due_variants()  ← FOR UPDATE SKIP LOCKED: each post goes out once
                       │
     refresh token if needed ─► platform adapter ─► published | failed (auto-retry 1/5/15/60 min)
```

- **Brands = workspaces.** Each brand has its own channels, calendar and team (owner/admin/editor/viewer). Switch brands from the sidebar; add brands in Settings.
- **Tokens** are AES-256-GCM encrypted (`TOKEN_ENCRYPTION_KEY`) in `account_credentials`, which only the server can read (RLS on, no policies).
- **Media** uploads go straight from the browser to the public `media` bucket (`<workspace_id>/…`), so Instagram, Threads and Pinterest can fetch the files by URL.
- **Failures:** retryable errors (rate limits, 5xx, timeouts) retry automatically; auth errors mark the channel *Reconnect needed*.

| Path | What |
|---|---|
| `src/lib/platforms/registry.ts` | Platform list, limits, media rules |
| `src/lib/platforms/oauth.ts` | OAuth URLs, callbacks, token refresh for every platform |
| `src/lib/platforms/credentials.ts` | Bluesky / Mastodon / Telegram connect |
| `src/lib/platforms/publishers/*` | One adapter per platform |
| `src/lib/publisher.ts` | The publishing engine |
| `netlify/functions/*` | Every-minute cron + background publisher |
| `supabase/migrations/*` | Database schema (already applied to the AutoSocials project) |

---

## 1. Environment

Copy `.env.example` to `.env.local` (local) or add the same keys in Netlify → Site configuration → Environment variables.

Required to run at all: `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`.

Each platform's keys are optional: the Channels page shows **Setup needed** for any platform whose keys are missing.

## 2. Supabase settings (one-time)

Project: **AutoSocials** (`bbjhuclnjuxxjuzagubb`, ca-central-1). The schema is already applied.

- Authentication → URL Configuration → **Site URL** = your `APP_URL`; add `APP_URL/auth/callback` to Redirect URLs.
- Authentication → Providers → Email: keep it on. Optionally turn **off** "Allow new users to sign up" once the team has signed up.
- Storage: the `media` bucket allows files up to 500 MB, but your plan's global upload limit may be lower (Storage settings). Raise it for video.

## 3. Deploy (Netlify)

1. New site → import this GitHub repo. The build settings come from `netlify.toml`.
2. Add the environment variables, then deploy.
3. Set `APP_URL` to the live URL (e.g. `https://autosocials.netlify.app` or a custom domain like `social.canadiansme.ca`) and redeploy.
4. The `publish-cron` scheduled function starts running every minute automatically.

Not on Netlify? Call `GET /api/cron/publish` every minute with header `x-cron-secret: $CRON_SECRET` from any scheduler (Vercel Cron, Supabase pg_cron + pg_net, GitHub Actions).

## 4. Connect each platform

For every OAuth platform, create a developer app and add this **redirect URI**:

```
{APP_URL}/api/connect/{platform}/callback
```

where `{platform}` is `facebook`, `instagram`, `threads`, `linkedin`, `x`, `tiktok`, `youtube`, `gbp` or `pinterest`.

Use `{APP_URL}/privacy` and `{APP_URL}/terms` wherever an app form asks for a privacy policy or terms URL.

| Platform | Where | Env vars | Notes |
|---|---|---|---|
| Facebook + Instagram | developers.facebook.com → Create app (Business) → add **Facebook Login for Business**; add both callback URIs | `META_APP_ID`, `META_APP_SECRET` | Development mode works for Pages owned by the app's admins/testers. Instagram must be a Business/Creator account linked to a Page. |
| Threads | Same Meta dashboard → add the **Threads** use case | `THREADS_APP_ID`, `THREADS_APP_SECRET` | Add your Threads profile as a tester while in development. |
| LinkedIn | linkedin.com/developers → Create app (linked to the CanadianSME Page) → Products: **Share on LinkedIn**, **Sign In with OpenID Connect**; request **Community Management API** | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Profile posting works immediately. Set `LINKEDIN_ORG_ACCESS=true` after Community Management is approved to post as company Pages. Tokens last about 60 days; reconnect when prompted. |
| X | developer.x.com → Project + App → User authentication: OAuth 2.0, *Web App* (confidential), read + write | `X_CLIENT_ID`, `X_CLIENT_SECRET` | Pay-per-use: buy credits in the developer console. |
| TikTok | developers.tiktok.com → app → add **Login Kit** + **Content Posting API** (Direct Post on) | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Posts are private until TikTok audits the app; use *Send to TikTok inbox* meanwhile. |
| YouTube + Business Profile | console.cloud.google.com → enable **YouTube Data API v3** (and Business Profile APIs) → OAuth consent screen → OAuth client (Web) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | YouTube uploads are private until the API audit passes. Business Profile API access needs Google's approval. |
| Pinterest | developers.pinterest.com → Connect app | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | Pick a default board per account on the Channels page. |
| Bluesky | none | none | Connect in the app with handle + **app password**. |
| Mastodon | your instance → Preferences → Development | none | Paste the instance URL + access token. |
| Telegram | @BotFather → new bot → add it as channel admin | none | Paste the bot token + `@channel`. |

## 5. Local development

```bash
npm install
cp .env.example .env.local   # fill in
npm run dev                  # http://localhost:3000
```

Set `APP_URL=http://localhost:3000` locally and add the localhost callback URIs to each platform app (most allow several). To publish locally, call:

```bash
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/publish
```

## AI captions (optional)

Add `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) in Netlify. This turns on **Write with AI** in the composer and AI captions for website auto-posts. The brand voice is set in Settings.

## Roadmap

- Bulk CSV upload, evergreen recycling
- Unified inbox (comments/messages)
- Analytics sync and reports
- Link-in-bio page
- REST API + MCP server for agents
