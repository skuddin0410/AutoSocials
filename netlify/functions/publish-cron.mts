import type { Config } from "@netlify/functions";

/** Runs every minute and hands off to the background publisher (up to 15 minutes, enough for video uploads). */
export default async () => {
  const base = (process.env.URL ?? process.env.APP_URL ?? "").replace(/\/$/, "");
  await fetch(`${base}/.netlify/functions/publish-background`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  return new Response("ok");
};

export const config: Config = { schedule: "* * * * *" };
