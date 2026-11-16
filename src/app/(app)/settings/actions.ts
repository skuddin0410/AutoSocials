"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContext, isAdmin, WS_COOKIE } from "@/lib/workspace";

export async function updateBrand(formData: FormData) {
  const { supabase, workspace, role } = await getContext();
  if (!isAdmin(role)) throw new Error("Admins only");
  const tz = String(formData.get("timezone"));
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    throw new Error("Unknown time zone");
  }
  await supabase
    .from("workspaces")
    .update({
      name: String(formData.get("name")).trim() || workspace.name,
      timezone: tz,
      require_approval: formData.get("require_approval") === "on",
      brand_voice: String(formData.get("brand_voice") ?? "").trim() || null,
    })
    .eq("id", workspace.id);
  revalidatePath("/", "layout");
}

export async function addMember(formData: FormData) {
  const { workspace, role } = await getContext();
  if (!isAdmin(role)) throw new Error("Admins only");
  const email = String(formData.get("email")).trim().toLowerCase();
  const memberRole = String(formData.get("role"));
  if (!["admin", "editor", "viewer"].includes(memberRole)) throw new Error("Bad role");
  const admin = createAdminClient();
  // Find the user (they must have signed up first).
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (!data.users.length || data.users.length < 200) break;
  }
  if (!userId) redirect(`/settings?error=${encodeURIComponent(`${email} hasn't created an account yet. Ask them to sign up first.`)}`);
  await admin.from("workspace_members").upsert({ workspace_id: workspace.id, user_id: userId, role: memberRole });
  revalidatePath("/settings");
}

export async function removeMember(formData: FormData) {
  const { supabase, workspace, role, user } = await getContext();
  if (!isAdmin(role)) throw new Error("Admins only");
  const target = String(formData.get("user_id"));
  if (target === user.id) throw new Error("You can't remove yourself");
  await supabase.from("workspace_members").delete().eq("workspace_id", workspace.id).eq("user_id", target);
  revalidatePath("/settings");
}

export async function createBrand(formData: FormData) {
  const { supabase } = await getContext();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);
  const { data, error } = await supabase.rpc("create_workspace", { p_name: name, p_slug: slug });
  if (error) throw new Error(error.message);
  (await cookies()).set(WS_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/channels");
}
