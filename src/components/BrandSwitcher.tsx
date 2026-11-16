"use client";
import { useTransition } from "react";
import { switchWorkspace } from "@/app/(app)/actions";

export function BrandSwitcher({ current, options }: { current: string; options: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  if (options.length < 2) {
    return <div className="truncate text-sm font-semibold">{options[0]?.name}</div>;
  }
  return (
    <select
      aria-label="Brand"
      className="input py-1.5 font-semibold"
      value={current}
      disabled={pending}
      onChange={(e) => start(() => switchWorkspace(e.target.value))}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
