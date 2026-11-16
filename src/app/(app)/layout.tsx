import { BrandSwitcher } from "@/components/BrandSwitcher";
import { NavLink } from "@/components/NavLink";
import { getContext } from "@/lib/workspace";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, workspaces } = await getContext();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-white p-4">
        <div className="mb-6 flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">A</div>
          <span className="font-semibold">AutoSocials</span>
        </div>
        <div className="mb-6">
          <div className="label px-1">Brand</div>
          <BrandSwitcher current={workspace.id} options={workspaces.map((w) => ({ id: w.workspace.id, name: w.workspace.name }))} />
        </div>
        <nav className="space-y-1">
          <NavLink href="/compose">✏️ <span>Create post</span></NavLink>
          <NavLink href="/calendar">📅 <span>Calendar</span></NavLink>
          <NavLink href="/posts">📋 <span>All posts</span></NavLink>
          <NavLink href="/channels">🔗 <span>Channels</span></NavLink>
          <NavLink href="/settings">⚙️ <span>Settings</span></NavLink>
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <div className="truncate px-1 text-xs text-muted">{user.email}</div>
          <form action={signOut}>
            <button className="mt-2 px-1 text-xs text-muted hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
