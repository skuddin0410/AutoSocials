import { runFeeds } from "../../src/lib/feeds";
import { runPublisher } from "../../src/lib/publisher";

/**
 * Netlify Background Function (the "-background" suffix gives it a 15-minute limit
 * and an immediate 202 to the caller). Triggered every minute by publish-cron and
 * instantly by "Post now".
 */
export default async (req: Request) => {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const feeds = await runFeeds().catch((e) => ({ error: String(e) }));
  const summary = await runPublisher({ deadlineMs: 12 * 60_000 });
  console.log("feeds", JSON.stringify(feeds), "publisher", JSON.stringify(summary));
};
