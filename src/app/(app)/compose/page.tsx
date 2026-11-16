import { nowLocalInput } from "@/lib/time";
import { getContext } from "@/lib/workspace";
import { Composer } from "./Composer";

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ media?: string; category?: string }> }) {
  const { supabase, workspace } = await getContext();
  const sp = await searchParams;
  const mediaIds = (sp.media ?? "").split(",").filter(Boolean).slice(0, 10);
  const { data: categories } = await supabase.from("content_categories").select("id,name,color").eq("workspace_id", workspace.id).order("sort");
  const { data: initialMedia } = mediaIds.length
    ? await supabase.from("media_assets").select("id,public_url,kind,storage_path").in("id", mediaIds)
    : { data: [] as any[] };
  const { data } = await supabase
    .from("social_accounts")
    .select("id,platform,display_name,handle,avatar_url,status,settings,region")
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
        categories={categories ?? []}
        initialCategory={sp.category ?? ""}
        initialMedia={(initialMedia ?? []).map((m: any) => ({ id: m.id, public_url: m.public_url, kind: m.kind, name: m.storage_path }))}
      />
    </div>
  );
}
