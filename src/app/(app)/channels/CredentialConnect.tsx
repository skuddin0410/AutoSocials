"use client";
import { useActionState, useState } from "react";
import type { PlatformMeta } from "@/lib/platforms/registry";
import { connectCredentials, type ActionState } from "./actions";

export function CredentialConnect({
  platform,
  disabled,
  region = "Canada",
  startOpen = false,
}: {
  platform: PlatformMeta;
  disabled?: boolean;
  region?: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState<ActionState, FormData>(connectCredentials, {});

  if (!open) {
    return (
      <button className="btn-primary w-full" disabled={disabled} onClick={() => setOpen(true)}>
        Connect {platform.name}
      </button>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="platform" value={platform.id} />
      <input type="hidden" name="region" value={region} />
      {platform.fields?.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={`${platform.id}-${f.name}`}>{f.label}</label>
          <input
            id={`${platform.id}-${f.name}`}
            name={f.name}
            type={f.type === "password" ? "password" : "text"}
            placeholder={f.placeholder}
            required={!f.label.includes("optional")}
            className="input"
            autoComplete="off"
          />
          {f.help && <p className="hint mt-1.5">{f.help}</p>}
        </div>
      ))}
      {state.error && <p role="alert" className="rounded-xl bg-brand-soft p-3 text-sm text-brand-dark">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{state.ok}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={pending}>{pending ? "Checking…" : `Connect ${platform.name}`}</button>
        {!startOpen && (
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        )}
      </div>
    </form>
  );
}
