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
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Create post</h1>
        <p className="text-sm text-muted">Write once, publish to every {workspace.name} channel.</p>
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
