export const metadata = { title: "Privacy Policy · AutoSocials" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-10 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p>AutoSocials is an internal publishing tool operated by CanadianSME for scheduling posts to social media accounts that CanadianSME and its brands own or manage.</p>
      <h2 className="pt-2 font-semibold">What we collect</h2>
      <p>When a team member connects a social account, we store the access tokens issued by that platform (encrypted at rest), the account&apos;s public profile details (name, handle, avatar, account ID), and the posts and media our team schedules. We do not collect data about other users of those platforms.</p>
      <h2 className="pt-2 font-semibold">How we use it</h2>
      <p>Solely to publish the content our team creates to the connected accounts at the scheduled time, and to show the result (status and post link) in the app. We never sell or share this data.</p>
      <h2 className="pt-2 font-semibold">Removal</h2>
      <p>Removing a channel in the app deletes its stored tokens immediately. You can also revoke access at any time from the platform&apos;s own settings. To request deletion of all data, email the CanadianSME team.</p>
    </main>
  );
}
