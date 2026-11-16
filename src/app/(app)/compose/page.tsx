import { nowLocalInput } from "@/lib/time";
import { getContext } from "@/lib/workspace";
import { Composer } from "./Composer";

export default async function ComposePage() {
  const { supabase, workspace } = await getContext();
  const { data } = await supabase
    .from("social_accounts")
    .select("id,platform,display_name,handle,avatar_url,status,settings")
    .eq("workspace_id", workspace.id)
    .order("platform");

  return (
    <div className="mx-auto max-w-6xl">
      <header className="masthead">
        <div>
          <h1>Create post</h1>
          <p>Write it once. Pick the channels. Publish now or schedule it for later.</p>
        </div>
      </header>
      <Composer
        accounts={(data ?? []) as any}
        workspaceId={workspace.id}
        timezone={workspace.timezone}
        defaultLocal={nowLocalInput(workspace.timezone, 60)}
      />
    </div>
  );
}
