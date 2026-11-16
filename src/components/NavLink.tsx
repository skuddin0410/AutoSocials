"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-ink text-white" : "text-ink/80 hover:bg-stone-100"
      }`}
    >
      {children}
    </Link>
  );
}
