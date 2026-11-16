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

/** Drafts → each channel's next free posting time. */
export async function queueDraftPost(formData: FormData) {
  const { supabase, user } = await editable();
  const postId = String(formData.get("post_id"));
  const { data: vs } = await supabase.from("post_variants").select("id,account_id").eq("post_id", postId).eq("status", "draft");
  for (const v of vs ?? []) {
    const { data: slot } = await supabase.rpc("next_free_slot", { p_account: v.account_id });
    if (slot) await supabase.from("post_variants").update({ status: "scheduled", scheduled_at: slot, approved_by: user.id }).eq("id", v.id);
  }
  refresh();
}

/** Drafts → publish on every channel right now. */
export async function publishDraftPostNow(formData: FormData) {
  const { supabase, user } = await editable();
  await supabase
    .from("post_variants")
    .update({ status: "scheduled", scheduled_at: new Date().toISOString(), approved_by: user.id })
    .eq("post_id", String(formData.get("post_id")))
    .eq("status", "draft");
  await triggerPublisher();
  refresh();
}
