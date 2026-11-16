import { siBluesky, siFacebook, siGoogle, siInstagram, siMastodon, siPinterest, siTelegram, siThreads, siTiktok, siX, siYoutube } from "simple-icons";
import { PLATFORM_BY_ID, type PlatformId } from "@/lib/platforms/registry";

// Official platform marks from the Simple Icons set. LinkedIn isn't in that set, so it keeps a lettered badge.
const ICONS: Partial<Record<PlatformId, { path: string }>> = {
  facebook: siFacebook,
  instagram: siInstagram,
  threads: siThreads,
  x: siX,
  tiktok: siTiktok,
  youtube: siYoutube,
  pinterest: siPinterest,
  gbp: siGoogle,
  bluesky: siBluesky,
  mastodon: siMastodon,
  telegram: siTelegram,
};

const BG: Partial<Record<PlatformId, string>> = {
  instagram: "linear-gradient(45deg,#f9a825 0%,#e1306c 45%,#833ab4 100%)",
};

export function PlatformBadge({ platform, size = 20 }: { platform: PlatformId; size?: number }) {
  const p = PLATFORM_BY_ID[platform];
  const icon = ICONS[platform];
  return (
    <span
      title={p.name}
      className="inline-flex shrink-0 items-center justify-center font-bold text-white ring-2 ring-white"
      style={{ background: BG[platform] ?? p.color, width: size, height: size, fontSize: size * 0.42, borderRadius: size * 0.28 }}
    >
      {icon ? (
        <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="currentColor" aria-hidden>
          <path d={icon.path} />
        </svg>
      ) : (
        p.short
      )}
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
        <PlatformBadge platform={platform} size={Math.round(size * 0.5)} />
      </span>
    </span>
  );
}
