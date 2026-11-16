import { decryptJson, encryptJson } from "./crypto";
import type { PlatformId } from "./platforms/registry";
import type { ConnectedAccount, Credential } from "./platforms/types";
import { createAdminClient } from "./supabase/admin";

/** Upserts connected accounts and stores their encrypted credentials. Server only. */
export async function saveConnectedAccounts(
  workspaceId: string,
  userId: string,
  platform: PlatformId,
  accounts: ConnectedAccount[],
  region?: string | null,
): Promise<number> {
  const admin = createAdminClient();
  for (const a of accounts) {
    const { data, error } = await admin
      .from("social_accounts")
      .upsert(
        {
          workspace_id: workspaceId,
          platform: a.platform ?? platform,
          external_id: a.external_id,
          ...(region ? { region } : {}),
          account_type: a.account_type ?? null,
          handle: a.handle ?? null,
          display_name: a.display_name ?? null,
          avatar_url: a.avatar_url ?? null,
          settings: a.settings ?? {},
          token_expires_at: a.token_expires_at ?? null,
          status: "active",
          last_error: null,
          connected_by: userId,
        },
        { onConflict: "workspace_id,platform,external_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await saveCredential(data.id, a.credential);
  }
  return accounts.length;
}

export async function saveCredential(accountId: string, credential: Credential) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("account_credentials")
    .upsert({ account_id: accountId, ciphertext: encryptJson(credential), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function loadCredential(accountId: string): Promise<Credential> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("account_credentials").select("ciphertext").eq("account_id", accountId).single();
  if (error || !data) throw new Error("No stored credentials for this channel — reconnect it.");
  return decryptJson<Credential>(data.ciphertext);
}
