"use client";
import { useTransition } from "react";
import { switchWorkspace } from "@/app/(app)/actions";

export function BrandSwitcher({ current, options }: { current: string; options: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const name = options.find((o) => o.id === current)?.name ?? options[0]?.name;
  return (
    <div className="rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
      <div className="text-xs text-white/50">Publishing for</div>
      {options.length < 2 ? (
        <div className="truncate font-display text-base font-semibold text-white">{name}</div>
      ) : (
        <select
          aria-label="Brand"
          className="mt-0.5 w-full cursor-pointer appearance-none bg-transparent font-display text-base font-semibold text-white outline-none"
          value={current}
          disabled={pending}
          onChange={(e) => start(() => switchWorkspace(e.target.value))}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id} className="text-ink">
              {o.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
