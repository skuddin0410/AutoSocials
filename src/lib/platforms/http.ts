import { PublishError } from "./types";

/** fetch + JSON with error classification (429/5xx retryable, 401/403 auth). */
export async function api<T = any>(url: string, init: RequestInit & { form?: Record<string, string> } = {}): Promise<T> {
  const { form, ...rest } = init;
  const req: RequestInit = { ...rest };
  if (form) {
    req.method = req.method ?? "POST";
    req.body = new URLSearchParams(form);
    req.headers = { "Content-Type": "application/x-www-form-urlencoded", ...(req.headers ?? {}) };
  }
  let res: Response;
  try {
    res = await fetch(url, req);
  } catch (e) {
    throw new PublishError(`Network error calling ${new URL(url).host}: ${(e as Error).message}`, { retryable: true });
  }
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg =
      body?.error?.message ??
      body?.error_description ??
      body?.detail ??
      body?.message ??
      body?.error?.code ??
      body?.title ??
      (typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300));
    throw new PublishError(`${new URL(url).host} ${res.status}: ${msg}`, {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
      auth: res.status === 401 || (res.status === 403 && /token|auth|permission|scope/i.test(String(msg))),
      body,
    });
  }
  return body as T;
}

export async function download(url: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new PublishError(`Could not download media (${res.status})`, { retryable: res.status >= 500 });
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "application/octet-stream" };
}

export function basicAuth(user: string, pass: string) {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function appUrl(): string {
  const url = process.env.APP_URL ?? process.env.URL ?? "http://localhost:3000";
  return url.replace(/\/$/, "");
}

export function redirectUri(platform: string) {
  return `${appUrl()}/api/connect/${platform}/callback`;
}

export function requireEnv(...names: string[]): string[] {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  return names.map((n) => process.env[n]!);
}
