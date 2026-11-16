import { after } from "next/server";
import { appUrl } from "./platforms/http";
import { runPublisher } from "./publisher";

/**
 * Kick the publisher right away (used by "Post now").
 * On Netlify we hand off to the background function (15-minute limit, fine for video uploads);
 * elsewhere we run it after the response is sent.
 */
export async function triggerPublisher() {
  if (process.env.NETLIFY || process.env.NETLIFY_BACKGROUND_TRIGGER === "true") {
    try {
      await fetch(`${appUrl()}/.netlify/functions/publish-background`, {
        method: "POST",
        headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
      });
      return;
    } catch {
      /* fall through */
    }
  }
  after(async () => {
    await runPublisher({ deadlineMs: 50_000 }).catch((e) => console.error("publisher", e));
  });
}
