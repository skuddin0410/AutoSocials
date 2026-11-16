"use server";
import { revalidatePath } from "next/cache";
import { triggerPublisher } from "@/lib/trigger";
import { canEdit, getContext } from "@/lib/workspace";

async function editor() {
  const ctx = await getContext();
  if (!canEdit(ctx.role)) throw new Error("Viewers can't change content.");
  return ctx;
}
const refresh = () => {
  revalidatePath("/content");
  revalidatePath("/dashboard");
};

export async function saveCategory(formData: FormData) {
  const { supabase, workspace } = await editor();
  const id = String(formData.get("id") || "");
  const row = {
    name: String(formData.get("name") || "").trim() || "Untitled",
    color: String(formData.get("color") || "#1e5aa8"),
    description: String(formData.get("description") || "").trim() || null,
    recycle: formData.get("recycle") === "on",
  };
  if (id) await supabase.from("content_categories").update(row).eq("id", id);
  else await supabase.from("content_categories").insert({ ...row, workspace_id: workspace.id, sort: 99 });
  refresh();
}

export async function deleteCategory(formData: FormData) {
  const { supabase } = await editor();
  await supabase.from("content_categories").delete().eq("id", String(formData.get("id")));
  refresh();
}

export async function removeFromLibrary(formData: FormData) {
  const { supabase } = await editor();
  await supabase.from("posts").update({ in_library: false }).eq("id", String(formData.get("post_id")));
  refresh();
}

export async function moveToCategory(formData: FormData) {
  const { supabase } = await editor();
  await supabase.from("posts").update({ category_id: String(formData.get("category_id")) || null }).eq("id", String(formData.get("post_id")));
  refresh();
}

/** Share a library post on its channels right now (outside the timetable). */
export async function shareNow(formData: FormData) {
  const { supabase, workspace, user } = await editor();
  const { data: post } = await supabase
    .from("posts")
    .select("id,base_text,link_url,media_ids,overrides,account_ids,share_count,title")
    .eq("id", String(formData.get("post_id")))
    .single();
  if (!post) return;
  let q = supabase.from("social_accounts").select("id,platform").eq("workspace_id", workspace.id).eq("status", "active");
  if (post.account_ids?.length) q = q.in("id", post.account_ids);
  const { data: accounts } = await q;
  const now = new Date().toISOString();
  const rows = (accounts ?? []).map((a) => ({
    post_id: post.id,
    workspace_id: workspace.id,
    account_id: a.id,
    body: (post.overrides as Record<string, string>)?.[a.platform] ?? post.base_text,
    title: post.title,
    link_url: post.link_url,
    media_ids: post.media_ids,
    status: "scheduled",
    scheduled_at: now,
    approved_by: user.id,
  }));
  if (rows.length) {
    await supabase.from("post_variants").insert(rows);
    await supabase.from("posts").update({ last_shared_at: now, share_count: (post.share_count ?? 0) + 1 }).eq("id", post.id);
    await triggerPublisher();
  }
  refresh();
  revalidatePath("/posts");
}
