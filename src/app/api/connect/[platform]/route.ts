import { NextResponse, type NextRequest } from "next/server";
import { randomToken } from "@/lib/crypto";
import { buildAuthUrl } from "@/lib/platforms/oauth";
import { isPlatformId, PLATFORM_BY_ID, REGIONS, type PlatformId } from "@/lib/platforms/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContext, isAdmin } from "@/lib/workspace";

/**
 * Starts the OAuth flow for a platform: stores state (+ PKCE verifier, region, variant)
 * and sends the browser straight to the platform's own login/consent screen.
 * `/api/connect/meta` = Meta Business Suite: one Facebook login connects Pages AND Instagram accounts.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform: raw } = await params;
  const back = (error: string) => NextResponse.redirect(new URL(`/channels?error=${encodeURIComponent(error)}`, request.url));

  const variant = raw === "meta" ? "meta" : null;
  const platform = (variant ? "facebook" : raw) as PlatformId;
  if (!isPlatformId(platform) || PLATFORM_BY_ID[platform].auth !== "oauth") return back("Unknown platform");

  const regionParam = request.nextUrl.searchParams.get("region");
  const region = REGIONS.includes(regionParam as (typeof REGIONS)[number]) ? regionParam : null;

  const { user, workspace, role } = await getContext();
  if (!isAdmin(role)) return back("Only brand admins can connect channels.");

  const state = randomToken(24);
  const verifier = randomToken(48);
  let url: string;
  try {
    url = buildAuthUrl(platform, state, verifier, variant);
  } catch (e) {
    return back((e as Error).message);
  }

  const admin = createAdminClient();
  await admin.from("oauth_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
  const { error } = await admin
    .from("oauth_states")
    .insert({ state, workspace_id: workspace.id, user_id: user.id, platform, code_verifier: verifier, region, variant });
  if (error) return back(error.message);

  return NextResponse.redirect(url);
}
