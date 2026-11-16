"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-11 items-center gap-3.5 rounded-xl px-4 text-[15px] font-medium transition ${
        active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
      }`}
    >
      {active && <span className="absolute inset-y-2.5 left-0 w-1 rounded-r bg-brand" aria-hidden />}
      <span className={active ? "text-white" : "text-white/55"}>{icon}</span>
      {children}
    </Link>
  );
}
