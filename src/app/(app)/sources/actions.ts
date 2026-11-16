"use server";
import { revalidatePath } from "next/cache";
import { getContext, isAdmin } from "@/lib/workspace";

async function admin() {
  const ctx = await getContext();
  if (!isAdmin(ctx.role)) throw new Error("Only brand admins can manage auto-posting.");
  return ctx;
}

export async function addSource(formData: FormData) {
  const { supabase, workspace } = await admin();
  let url = String(formData.get("url") || "").trim();
  if (!url) return;
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  await supabase.from("content_sources").insert({
    workspace_id: workspace.id,
    name: String(formData.get("name") || new URL(url).hostname),
    url,
    mode: formData.get("mode") === "queue" ? "queue" : "draft",
    use_ai: formData.get("use_ai") === "on",
    account_ids: formData.getAll("account").map(String),
  });
  revalidatePath("/sources");
}

export async function updateSource(formData: FormData) {
  const { supabase } = await admin();
  await supabase
    .from("content_sources")
    .update({
      mode: formData.get("mode") === "queue" ? "queue" : "draft",
      use_ai: formData.get("use_ai") === "on",
      active: formData.get("active") === "on",
      account_ids: formData.getAll("account").map(String),
    })
    .eq("id", String(formData.get("id")));
  revalidatePath("/sources");
}

export async function deleteSource(formData: FormData) {
  const { supabase } = await admin();
  await supabase.from("content_sources").delete().eq("id", String(formData.get("id")));
  revalidatePath("/sources");
}
