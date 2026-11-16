import { NextResponse, type NextRequest } from "next/server";
import { runPublisher } from "@/lib/publisher";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Publishes everything that's due. Call every minute from any scheduler
 * (Netlify scheduled function, Vercel cron, Supabase pg_cron + pg_net, GitHub Actions…).
 * Auth: header `x-cron-secret: $CRON_SECRET` or `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || given !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const summary = await runPublisher({ deadlineMs: 240_000 });
  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
