import { NextResponse, type NextRequest } from "next/server";
import { randomToken } from "@/lib/crypto";
import { buildAuthUrl } from "@/lib/platforms/oauth";
import { isPlatformId, PLATFORM_BY_ID } from "@/lib/platforms/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContext, isAdmin } from "@/lib/workspace";

/** Starts the OAuth flow for a platform: stores state (+ PKCE verifier) and redirects to the provider. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = (error: string) => NextResponse.redirect(new URL(`/channels?error=${encodeURIComponent(error)}`, request.url));
  if (!isPlatformId(platform) || PLATFORM_BY_ID[platform].auth !== "oauth") return back("Unknown platform");

  const { user, workspace, role } = await getContext();
  if (!isAdmin(role)) return back("Only brand admins can connect channels.");

  const state = randomToken(24);
  const verifier = randomToken(48);
  let url: string;
  try {
    url = buildAuthUrl(platform, state, verifier);
  } catch (e) {
    return back((e as Error).message);
  }

  const admin = createAdminClient();
  await admin.from("oauth_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
  const { error } = await admin
    .from("oauth_states")
    .insert({ state, workspace_id: workspace.id, user_id: user.id, platform, code_verifier: verifier });
  if (error) return back(error.message);

  return NextResponse.redirect(url);
}
