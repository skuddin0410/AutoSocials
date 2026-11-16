"use server";
import { revalidatePath } from "next/cache";
import { canEdit, getContext } from "@/lib/workspace";

/** Starting-point times (brand time zone) based on common B2B engagement windows. */
const RECOMMENDED: Record<string, { days: number[]; times: string[] }> = {
  linkedin: { days: [1, 2, 3, 4, 5], times: ["08:45", "12:15"] },
  x: { days: [1, 2, 3, 4, 5], times: ["08:30", "12:30", "17:00"] },
  facebook: { days: [1, 2, 3, 4, 5, 6], times: ["09:30", "13:00"] },
  instagram: { days: [1, 2, 3, 4, 5, 6], times: ["11:30", "18:30"] },
  threads: { days: [1, 2, 3, 4, 5], times: ["10:00", "16:30"] },
  bluesky: { days: [1, 2, 3, 4, 5], times: ["09:00", "15:00"] },
  default: { days: [1, 2, 3, 4, 5], times: ["10:00"] },
};

async function editor() {
  const ctx = await getContext();
  if (!canEdit(ctx.role)) throw new Error("Viewers can't change posting times.");
  return ctx;
}

export async function addSlots(formData: FormData) {
  const { supabase } = await editor();
  const time = String(formData.get("time") || "");
  if (!/^\d{2}:\d{2}$/.test(time)) return;
  const days = formData.getAll("day").map(Number).filter((d) => d >= 0 && d <= 6);
  const accounts = formData.getAll("account").map(String);
  const rows = accounts.flatMap((account_id) => days.map((day_of_week) => ({ account_id, day_of_week, local_time: time })));
  if (rows.length) await supabase.from("posting_slots").upsert(rows, { onConflict: "account_id,day_of_week,local_time", ignoreDuplicates: true });
  revalidatePath("/times");
}

export async function removeSlot(formData: FormData) {
  const { supabase } = await editor();
  await supabase.from("posting_slots").delete().eq("id", String(formData.get("id")));
  revalidatePath("/times");
}

export async function clearSlots(formData: FormData) {
  const { supabase } = await editor();
  await supabase.from("posting_slots").delete().eq("account_id", String(formData.get("account")));
  revalidatePath("/times");
}

export async function applyRecommended() {
  const { supabase, workspace } = await editor();
  const { data: accounts } = await supabase.from("social_accounts").select("id,platform").eq("workspace_id", workspace.id);
  const rows = (accounts ?? []).flatMap((a) => {
    const r = RECOMMENDED[a.platform] ?? RECOMMENDED.default;
    return r.days.flatMap((d) => r.times.map((t) => ({ account_id: a.id, day_of_week: d, local_time: t })));
  });
  if (rows.length) await supabase.from("posting_slots").upsert(rows, { onConflict: "account_id,day_of_week,local_time", ignoreDuplicates: true });
  revalidatePath("/times");
}
