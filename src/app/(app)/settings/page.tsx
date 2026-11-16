import { createAdminClient } from "@/lib/supabase/admin";
import { getContext, isAdmin } from "@/lib/workspace";
import { addMember, createBrand, removeMember, updateBrand } from "./actions";

const TIMEZONES = ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/St_Johns", "Asia/Kolkata", "Europe/London", "UTC"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, workspace, role, user } = await getContext();
  const admin = isAdmin(role);
  const { data: members } = await supabase.from("workspace_members").select("user_id,role").eq("workspace_id", workspace.id);

  // Resolve member emails (server-side only).
  const emails = new Map<string, string>();
  if (admin && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const svc = createAdminClient();
    for (const m of members ?? []) {
      const { data } = await svc.auth.admin.getUserById(m.user_id);
      if (data.user?.email) emails.set(m.user_id, data.user.email);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="masthead !mb-0">
        <div>
          <h1>Settings</h1>
          <p>Brand details, team access and more brands for {workspace.name}.</p>
        </div>
      </header>
      {sp.error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{sp.error}</div>}

      <section className="card p-7">
        <h2 className="mb-5 text-xl font-bold text-navy">Brand</h2>
        <form action={updateBrand} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" name="name" className="input" defaultValue={workspace.name} disabled={!admin} />
            </div>
            <div>
              <label className="label" htmlFor="timezone">Time zone</label>
              <select id="timezone" name="timezone" className="input" defaultValue={workspace.timezone} disabled={!admin}>
                {Array.from(new Set([workspace.timezone, ...TIMEZONES])).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="brand_voice">Brand voice for AI captions</label>
            <textarea
              id="brand_voice"
              name="brand_voice"
              rows={4}
              className="input"
              disabled={!admin}
              defaultValue={workspace.brand_voice ?? ""}
              placeholder="e.g. Canada's leading platform for small business insights. Professional, warm, practical. Canadian spelling. Tag @CanadianSME. Hashtags we use: #CanadianSME #SmallBusiness #CanadianBusiness"
            />
            <p className="hint mt-1.5">Leave blank to use the built-in CanadianSME voice.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="require_approval" defaultChecked={workspace.require_approval} disabled={!admin} />
            Posts by editors need admin approval before they go out
          </label>
          {admin && <button className="btn-primary">Save</button>}
        </form>
      </section>

      <section className="card p-7">
        <h2 className="mb-5 text-xl font-bold text-navy">Team</h2>
        <ul className="mb-4 divide-y divide-line">
          {(members ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">{emails.get(m.user_id) ?? (m.user_id === user.id ? user.email : m.user_id)}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs capitalize">{m.role}</span>
              {admin && m.user_id !== user.id && m.role !== "owner" && (
                <form action={removeMember}>
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <button className="text-xs text-red-700 hover:underline">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {admin && (
          <form action={addMember} className="flex flex-wrap gap-2">
            <input name="email" type="email" required placeholder="colleague@canadiansme.ca" className="input min-w-56 flex-1" />
            <select name="role" className="input w-32" defaultValue="editor">
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button className="btn-ghost">Add</button>
          </form>
        )}
        <p className="mt-2 text-xs text-muted">Teammates sign up on the login page first, then you add them here.</p>
      </section>

      <section className="card p-7">
        <h2 className="mb-1 text-xl font-bold text-navy">Add another brand</h2>
        <p className="mb-4 text-sm text-muted">Each website gets its own channels, calendar and team. Switch brands from the sidebar.</p>
        <form action={createBrand} className="flex gap-2">
          <input name="name" required placeholder="e.g. She & Success" className="input flex-1" />
          <button className="btn-ghost">Create brand</button>
        </form>
      </section>
    </div>
  );
}
