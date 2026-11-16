import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { WS_COOKIE } from "@/lib/workspace";

async function createBrand(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: name, p_slug: slug });
  if (error) throw new Error(error.message);
  (await cookies()).set(WS_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/channels");
}

export default async function Onboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-xl font-semibold">Set up your first brand</h1>
        <p className="mt-1 text-sm text-muted">
          A brand holds its own social channels, calendar and team. Start with CanadianSME; add your other websites later from Settings.
        </p>
        <form action={createBrand} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="name">Brand name</label>
            <input id="name" name="name" className="input" defaultValue="CanadianSME" required />
          </div>
          <button className="btn-primary w-full">Create brand</button>
        </form>
        <p className="mt-6 text-xs text-muted">
          Joining an existing brand instead? Ask its admin to add {user.email} under Settings → Team.
        </p>
      </div>
    </main>
  );
}
