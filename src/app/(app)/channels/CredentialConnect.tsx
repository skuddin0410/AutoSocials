"use client";
import { useActionState, useState } from "react";
import type { PlatformMeta } from "@/lib/platforms/registry";
import { connectCredentials, type ActionState } from "./actions";

export function CredentialConnect({ platform, disabled }: { platform: PlatformMeta; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(connectCredentials, {});

  if (!open) {
    return (
      <button className="btn-primary w-full" disabled={disabled} onClick={() => setOpen(true)}>
        Connect
      </button>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="platform" value={platform.id} />
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
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-700">{state.ok}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={pending}>{pending ? "Checking…" : "Connect"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
