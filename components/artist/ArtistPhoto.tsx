import { initials } from "@/lib/identity/normalize";

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// Artist photo (from Spotify or wherever we found one) filling its box; initials on a coloured tile when there is none.
export function ArtistPhoto({ name, imageUrl, className = "", rounded = true }: { name: string; imageUrl?: string | null; className?: string; rounded?: boolean }) {
  const r = rounded ? "rounded-card" : "";
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name} loading="lazy" referrerPolicy="no-referrer" className={`h-full w-full object-cover ${r} ${className}`} />;
  }
  return (
    <div aria-label={name} className={`flex h-full w-full items-center justify-center font-display text-4xl font-extrabold text-white ${r} ${className}`} style={{ background: `hsl(${hue(name)} 42% 34%)` }}>
      {initials(name)}
    </div>
  );
}
