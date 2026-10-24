import { initials } from "@/lib/identity/normalize";

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// Photo, or initials on a coloured tile when there is no photo.
export function ArtistAvatar({ name, imageUrl, size = 56 }: { name: string; imageUrl?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.36 };
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name} width={size} height={size} loading="lazy" className="shrink-0 rounded-card object-cover" style={style} />;
  }
  return (
    <div
      aria-label={name}
      className="flex shrink-0 items-center justify-center rounded-card font-semibold text-white"
      style={{ ...style, background: `hsl(${hue(name)} 45% 38%)` }}
    >
      {initials(name)}
    </div>
  );
}
