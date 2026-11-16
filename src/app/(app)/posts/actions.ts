"use server";
import { revalidatePath } from "next/cache";
import { triggerPublisher } from "@/lib/trigger";
import { canEdit, getContext } from "@/lib/workspace";

async function editable() {
  const ctx = await getContext();
  if (!canEdit(ctx.role)) throw new Error("Viewers can't change posts.");
  return ctx;
}
const refresh = () => {
  revalidatePath("/posts");
  revalidatePath("/calendar");
};

export async function cancelVariant(formData: FormData) {
  const { supabase } = await editable();
  await supabase
    .from("post_variants")
    .update({ status: "cancelled", next_attempt_at: null })
    .eq("id", String(formData.get("id")))
    .in("status", ["scheduled", "draft", "pending_approval", "failed"]);
  refresh();
}

export async function retryVariant(formData: FormData) {
  const { supabase, user } = await editable();
  await supabase
    .from("post_variants")
    .update({ status: "scheduled", scheduled_at: new Date().toISOString(), attempts: 0, last_error: null, next_attempt_at: null, approved_by: user.id })
    .eq("id", String(formData.get("id")))
    .in("status", ["failed", "cancelled", "draft", "pending_approval"]);
  await triggerPublisher();
  refresh();
}

export async function approvePost(formData: FormData) {
  const { supabase, user } = await editable();
  await supabase
    .from("post_variants")
    .update({ status: "scheduled", approved_by: user.id })
    .eq("post_id", String(formData.get("post_id")))
    .eq("status", "pending_approval");
  refresh();
}

export async function deletePost(formData: FormData) {
  const { supabase } = await editable();
  await supabase.from("posts").delete().eq("id", String(formData.get("post_id")));
  refresh();
}
