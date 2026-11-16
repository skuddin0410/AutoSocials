import { PLATFORM_BY_ID, type PlatformId } from "@/lib/platforms/registry";

export function PlatformBadge({ platform, size = 20 }: { platform: PlatformId; size?: number }) {
  const p = PLATFORM_BY_ID[platform];
  return (
    <span
      title={p.name}
      className="inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white"
      style={{ background: p.color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {p.short}
    </span>
  );
}

export function AccountAvatar({
  platform,
  name,
  avatar,
  size = 36,
}: {
  platform: PlatformId;
  name: string | null;
  avatar: string | null;
  size?: number;
}) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-full w-full rounded-full border border-line object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-ink/70">
          {(name ?? "?").slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="absolute -bottom-1 -right-1">
        <PlatformBadge platform={platform} size={Math.round(size * 0.48)} />
      </span>
    </span>
  );
}
