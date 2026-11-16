import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export const WS_COOKIE = "as_ws";

export type Workspace = { id: string; name: string; slug: string; timezone: string; require_approval: boolean };
export type Role = "owner" | "admin" | "editor" | "viewer";

/** Signed-in user + current brand (workspace). Redirects to /login or /onboarding when missing. */
export async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id,name,slug,timezone,require_approval)")
    .eq("user_id", user.id);

  const list = (memberships ?? [])
    .filter((m: any) => m.workspaces)
    .map((m: any) => ({ role: m.role as Role, workspace: m.workspaces as Workspace }))
    .sort((a, b) => a.workspace.name.localeCompare(b.workspace.name));

  if (!list.length) redirect("/onboarding");

  const wanted = (await cookies()).get(WS_COOKIE)?.value;
  const current = list.find((m) => m.workspace.id === wanted) ?? list[0];
  return { supabase, user, workspace: current.workspace, role: current.role, workspaces: list };
}

export function canEdit(role: Role) {
  return role !== "viewer";
}
export function isAdmin(role: Role) {
  return role === "owner" || role === "admin";
}
