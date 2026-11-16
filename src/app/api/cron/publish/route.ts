import { fillCategorySlots } from "@/lib/categories";
import { NextResponse, type NextRequest } from "next/server";
import { runFeeds } from "@/lib/feeds";
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
  const feeds = await runFeeds().catch((e) => ({ error: String(e) }));
  const categories = await fillCategorySlots().catch((e) => ({ error: String(e) }));
  const summary = await runPublisher({ deadlineMs: 200_000 });
  return NextResponse.json({ ...summary, feeds, categories });
}

export const GET = handle;
export const POST = handle;
