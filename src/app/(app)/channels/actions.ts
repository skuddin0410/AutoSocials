"use server";
import { revalidatePath } from "next/cache";
import { saveConnectedAccounts } from "@/lib/accounts";
import { verifyCredentials } from "@/lib/platforms/credentials";
import { isPlatformId, PLATFORM_BY_ID } from "@/lib/platforms/registry";
import { getContext, isAdmin } from "@/lib/workspace";

export type ActionState = { ok?: string; error?: string };

export async function connectCredentials(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const platform = String(formData.get("platform"));
  if (!isPlatformId(platform) || PLATFORM_BY_ID[platform].auth !== "credentials") return { error: "Unknown platform" };
  const { user, workspace, role } = await getContext();
  if (!isAdmin(role)) return { error: "Only brand admins can connect channels." };

  const fields: Record<string, string> = {};
  for (const f of PLATFORM_BY_ID[platform].fields ?? []) fields[f.name] = String(formData.get(f.name) ?? "");
  try {
    const account = await verifyCredentials(platform, fields);
    await saveConnectedAccounts(workspace.id, user.id, platform, [account]);
  } catch (e) {
    return { error: `Couldn't connect: ${(e as Error).message}` };
  }
  revalidatePath("/channels");
  return { ok: `${PLATFORM_BY_ID[platform].name} connected.` };
}

export async function disconnectAccount(formData: FormData) {
  const id = String(formData.get("id"));
  const { supabase, role } = await getContext();
  if (!isAdmin(role)) throw new Error("Only brand admins can remove channels.");
  const { error } = await supabase.from("social_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/channels");
}

export async function setDefaultBoard(formData: FormData) {
  const id = String(formData.get("id"));
  const board = String(formData.get("board_id"));
  const { supabase } = await getContext();
  const { data } = await supabase.from("social_accounts").select("settings").eq("id", id).single();
  await supabase.from("social_accounts").update({ settings: { ...(data?.settings ?? {}), default_board_id: board } }).eq("id", id);
  revalidatePath("/channels");
}
