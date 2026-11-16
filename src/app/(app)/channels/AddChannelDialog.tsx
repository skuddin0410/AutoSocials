"use client";
import { useEffect, useRef, useState } from "react";
import { PlatformBadge } from "@/components/PlatformBadge";
import { IconPlus } from "@/components/Icons";
import { REGIONS, type PlatformMeta } from "@/lib/platforms/registry";
import { CredentialConnect } from "./CredentialConnect";

export type PickerPlatform = PlatformMeta & { ready: boolean; missing: string[]; connected: number };

/**
 * "Add channel" picker. Every OAuth option is a plain link that sends the browser straight
 * to that platform's own login screen (Facebook, LinkedIn, X, TikTok, Google…).
 */
export function AddChannelDialog({ platforms, metaReady }: { platforms: PickerPlatform[]; metaReady: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [region, setRegion] = useState<string>("Canada");
  const [credFor, setCredFor] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add") === "1") ref.current?.showModal();
  }, []);

  const open = () => {
    setCredFor(null);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();
  const q = `?region=${encodeURIComponent(region)}`;
  const cred = platforms.find((p) => p.id === credFor);

  return (
    <>
      <button className="btn-primary btn-lg" onClick={open}>
        <IconPlus /> Add channel
      </button>

      <dialog
        ref={ref}
        className="m-auto w-[min(920px,94vw)] rounded-3xl p-0 backdrop:bg-navy/60 backdrop:backdrop-blur-sm"
        onClick={(e) => e.target === ref.current && close()}
      >
        <div className="max-h-[88vh] overflow-y-auto">
          <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-line bg-white px-8 py-6">
            <div>
              <h2 className="text-2xl font-bold text-navy">Add a channel</h2>
              <p className="hint mt-1">Pick a platform. You&apos;ll go straight to its login page to approve access, then come back here.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-ink" htmlFor="region">Region</label>
              <select id="region" className="input w-36" value={region} onChange={(e) => setRegion(e.target.value)}>
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button className="btn-ghost px-3" onClick={close} aria-label="Close">✕</button>
            </div>
          </header>

          {cred ? (
            <div className="px-8 py-7">
              <button className="mb-5 text-sm font-semibold text-harbour hover:underline" onClick={() => setCredFor(null)}>
                ← All platforms
              </button>
              <div className="mb-5 flex items-center gap-3">
                <PlatformBadge platform={cred.id} size={44} />
                <div>
                  <div className="font-display text-lg font-semibold text-navy">Connect {cred.name}</div>
                  <div className="hint">{cred.connectsAs} · tagged {region}</div>
                </div>
              </div>
              <div className="max-w-md">
                <CredentialConnect platform={cred} region={region} startOpen />
              </div>
            </div>
          ) : (
            <div className="space-y-6 px-8 py-7">
              {/* Meta Business Suite: one login, Facebook + Instagram */}
              <a
                href={metaReady ? `/api/connect/meta${q}` : undefined}
                aria-disabled={!metaReady}
                className={`flex items-center gap-5 rounded-2xl border-2 p-5 transition ${
                  metaReady ? "border-[#1877F2]/30 bg-[#1877F2]/5 hover:border-[#1877F2]" : "cursor-not-allowed border-line opacity-60"
                }`}
              >
                <span className="flex -space-x-2">
                  <PlatformBadge platform="facebook" size={44} />
                  <PlatformBadge platform="instagram" size={44} />
                </span>
                <span className="flex-1">
                  <span className="block font-display text-lg font-semibold text-navy">Meta Business Suite</span>
                  <span className="hint block">One Facebook login connects all your Facebook Pages and their linked Instagram accounts.</span>
                </span>
                <span className={metaReady ? "btn-blue" : "text-sm text-muted"}>{metaReady ? "Log in with Facebook" : "Needs Meta app setup"}</span>
              </a>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {platforms.map((p) => {
                  const body = (
                    <>
                      <PlatformBadge platform={p.id} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-display font-semibold text-navy">{p.name}</span>
                        <span className={`block truncate text-sm ${p.ready ? "text-muted" : "text-brand-dark"}`}>
                          {!p.ready ? "Needs developer app setup" : p.connected ? `${p.connected} connected · add another` : p.auth === "oauth" ? "Log in to connect" : "Connect with a key"}
                        </span>
                      </span>
                    </>
                  );
                  const cls = `flex min-h-[76px] items-center gap-3.5 rounded-2xl border p-4 text-left transition ${
                    p.ready ? "border-line bg-white hover:border-navy/40 hover:shadow-md" : "cursor-not-allowed border-dashed border-line bg-paper"
                  }`;
                  if (!p.ready) {
                    return (
                      <div key={p.id} className={cls} title={`Add ${p.missing.join(", ")} to the app's environment`}>
                        {body}
                      </div>
                    );
                  }
                  return p.auth === "oauth" ? (
                    <a key={p.id} href={`/api/connect/${p.id}${q}`} className={cls}>
                      {body}
                    </a>
                  ) : (
                    <button key={p.id} className={cls} onClick={() => setCredFor(p.id)}>
                      {body}
                    </button>
                  );
                })}
              </div>
              <p className="hint">
                Greyed-out platforms need a one-time developer app before anyone can log in through AutoSocials. Bluesky, Mastodon and Telegram work right away.
              </p>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
