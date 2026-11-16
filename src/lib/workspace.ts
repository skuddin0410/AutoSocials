import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export const WS_COOKIE = "as_ws";

export type Workspace = { id: string; name: string; slug: string; timezone: string; require_approval: boolean; brand_voice: string | null };
export type Role = "owner" | "admin" | "editor" | "viewer";

/** Signed-in user + current brand (workspace). Redirects to /login or /onboarding when missing. */
/** Deduplicated per request (layout + page + actions share one lookup). */
export const getContext = cache(async () => {
  const supabase = await createClient();
  // Local JWT verification (no network hop); the middleware already rejected bad sessions.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const user = { id: claims.sub as string, email: (claims.email as string | undefined) ?? null };

  const [{ data: memberships }, cookieStore] = await Promise.all([
    supabase.from("workspace_members").select("role, workspaces(id,name,slug,timezone,require_approval,brand_voice)").eq("user_id", user.id),
    cookies(),
  ]);

  const list = (memberships ?? [])
    .filter((m: any) => m.workspaces)
    .map((m: any) => ({ role: m.role as Role, workspace: m.workspaces as Workspace }))
    .sort((a, b) => a.workspace.name.localeCompare(b.workspace.name));

  if (!list.length) redirect("/onboarding");

  const wanted = cookieStore.get(WS_COOKIE)?.value;
  const current = list.find((m) => m.workspace.id === wanted) ?? list[0];
  return { supabase, user, workspace: current.workspace, role: current.role, workspaces: list };
});

export function canEdit(role: Role) {
  return role !== "viewer";
}
export function isAdmin(role: Role) {
  return role === "owner" || role === "admin";
}
