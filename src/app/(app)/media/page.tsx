import { getContext } from "@/lib/workspace";
import { MediaLibrary } from "./MediaLibrary";

export default async function MediaPage() {
  const { supabase, workspace } = await getContext();
  const { data } = await supabase
    .from("media_assets")
    .select("id,public_url,kind,mime_type,bytes,created_at,storage_path")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="masthead">
        <div>
          <h1>Media library</h1>
          <p>Logos, photos and videos for {workspace.name}. Upload once, reuse in any post.</p>
        </div>
      </header>
      <MediaLibrary workspaceId={workspace.id} initial={(data ?? []) as any} />
    </div>
  );
}
