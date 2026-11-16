import { NextResponse, type NextRequest } from "next/server";
import { saveConnectedAccounts } from "@/lib/accounts";
import { handleCallback } from "@/lib/platforms/oauth";
import { isPlatformId, PLATFORM_BY_ID } from "@/lib/platforms/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** OAuth redirect target: validates state, exchanges the code, stores the connected accounts. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const sp = request.nextUrl.searchParams;
  const to = (q: string) => NextResponse.redirect(new URL(`/channels?${q}`, request.url));
  const fail = (msg: string) => to(`error=${encodeURIComponent(msg)}`);

  if (!isPlatformId(platform)) return fail("Unknown platform");
  const providerError = sp.get("error_description") ?? sp.get("error_message") ?? sp.get("error");
  if (providerError) return fail(`${PLATFORM_BY_ID[platform].name}: ${providerError}`);

  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return fail("Missing authorization code");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const admin = createAdminClient();
  const { data: row } = await admin.from("oauth_states").select("*").eq("state", state).maybeSingle();
  await admin.from("oauth_states").delete().eq("state", state);
  if (!row || row.user_id !== user.id || row.platform !== platform) return fail("This connection link expired. Please try again.");
  if (Date.now() - new Date(row.created_at).getTime() > 15 * 60_000) return fail("Connection timed out. Please try again.");

  try {
    const accounts = await handleCallback(platform, code, row.code_verifier ?? "");
    if (!accounts.length) return fail(`No ${PLATFORM_BY_ID[platform].name} accounts were found on that login.`);
    const n = await saveConnectedAccounts(row.workspace_id, user.id, platform, accounts);
    return to(`connected=${platform}&count=${n}`);
  } catch (e) {
    return fail(`${PLATFORM_BY_ID[platform].name}: ${(e as Error).message}`);
  }
}
