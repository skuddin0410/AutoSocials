import Link from "next/link";
import { BrandLogo, ProductTag } from "@/components/Brand";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { IconCalendar, IconImage, IconLink, IconList, IconLogout, IconPlus, IconSettings } from "@/components/Icons";
import { NavLink } from "@/components/NavLink";
import { getContext } from "@/lib/workspace";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, workspaces } = await getContext();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[272px] shrink-0 flex-col bg-navy px-4 py-6">
        <Link href="/calendar" className="mb-7 block px-2" aria-label="AutoSocials home">
          <BrandLogo light className="h-8" />
          <div className="mt-2">
            <ProductTag dark />
          </div>
        </Link>

        <BrandSwitcher current={workspace.id} options={workspaces.map((w) => ({ id: w.workspace.id, name: w.workspace.name }))} />

        <Link href="/compose" className="btn-primary btn-lg mt-5 w-full">
          <IconPlus /> Create post
        </Link>

        <nav className="mt-6 space-y-1" aria-label="Main">
          <NavLink href="/calendar" icon={<IconCalendar />}>Calendar</NavLink>
          <NavLink href="/posts" icon={<IconList />}>Queue</NavLink>
          <NavLink href="/media" icon={<IconImage />}>Media library</NavLink>
          <NavLink href="/channels" icon={<IconLink />}>Channels</NavLink>
          <NavLink href="/settings" icon={<IconSettings />}>Settings</NavLink>
        </nav>

        <div className="mt-auto flex items-center gap-3 rounded-xl px-2 pt-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-sm font-semibold text-white">
            {(user.email ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 truncate text-sm text-white/70">{user.email}</div>
          <form action={signOut}>
            <button className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" title="Sign out" aria-label="Sign out">
              <IconLogout />
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-9">{children}</main>
    </div>
  );
}
