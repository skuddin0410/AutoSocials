/* eslint-disable @next/next/no-img-element */

/** CanadianSME logo, served from canadiansme.ca. `light` = for dark backgrounds. */
export function BrandLogo({ light = false, className = "h-9" }: { light?: boolean; className?: string }) {
  return (
    <img
      src={light ? "https://canadiansme.ca/assets/canadiansme-logo-light.webp" : "https://canadiansme.ca/assets/canadiansme-logo-520.webp"}
      alt="CanadianSME"
      className={`w-auto max-w-full object-contain object-left ${className}`}
    />
  );
}

/** Small maple-red wordmark for the product name under the logo. */
export function ProductTag({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${dark ? "text-white/70" : "text-muted"}`}>
      <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
      AutoSocials
    </span>
  );
}
