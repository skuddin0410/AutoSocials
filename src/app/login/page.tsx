"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BrandLogo, ProductTag } from "@/components/Brand";
import { PLATFORMS } from "@/lib/platforms/registry";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ tone: "error", text: error.message });
      else router.replace(params.get("next") || "/calendar");
    } else {
      const allowed = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? "")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      if (allowed.length && !allowed.includes(email.split("@")[1]?.toLowerCase())) {
        setMsg({ tone: "error", text: `Use your ${allowed.join(" or ")} email address to create an account.` });
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setMsg({ tone: "error", text: error.message });
      else if (data.session) router.replace("/calendar");
      else setMsg({ tone: "info", text: "Check your inbox and click the confirmation link, then sign in here." });
    }
    setBusy(false);
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-navy p-14 text-white lg:flex lg:flex-col">
        <BrandLogo light className="h-10" />
        <div className="my-auto max-w-lg">
          <h1 className="text-[44px] leading-[1.08] font-bold">
            Every CanadianSME channel. One publish button.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            Write once, schedule for the right moment, and let AutoSocials post to Facebook, Instagram, LinkedIn, X and more.
          </p>
          <ul className="mt-10 flex flex-wrap gap-2" aria-label="Supported channels">
            {PLATFORMS.map((p) => (
              <li key={p.id} className="rounded-full bg-white/8 px-3.5 py-1.5 text-sm text-white/80 ring-1 ring-white/12">
                {p.name}
              </li>
            ))}
          </ul>
        </div>
        <div className="h-1.5 w-24 rounded-full bg-brand" aria-hidden />
      </section>

      {/* Form */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 lg:hidden">
            <BrandLogo className="h-10" />
          </div>
          <ProductTag />
          <h2 className="mt-3 text-[30px] font-bold text-navy">{mode === "signin" ? "Sign in" : "Create your account"}</h2>
          <p className="mt-1.5 text-muted">
            {mode === "signin" ? "Welcome back. Your calendar is waiting." : "For the CanadianSME team. Use your work email."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="label" htmlFor="email">Work email</label>
              <input id="email" type="email" required autoComplete="email" placeholder="you@canadiansme.ca" className="input min-h-12" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} className="input min-h-12" value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode === "signup" && <p className="hint mt-1.5">At least 8 characters.</p>}
            </div>
            {msg && (
              <p role="alert" className={`rounded-xl px-4 py-3 text-sm ${msg.tone === "error" ? "bg-brand-soft text-brand-dark" : "bg-harbour-soft text-harbour"}`}>
                {msg.text}
              </p>
            )}
            <button className="btn-primary btn-lg w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-[15px] text-muted">
            {mode === "signin" ? "New to the team? " : "Already have an account? "}
            <button type="button" className="font-semibold text-harbour hover:underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
