import Link from "next/link";
import { BottomBar, DesktopNav } from "@/components/shell/NavTabs";
import { SeenPing } from "@/components/SeenPing";

// Signed-in shell: wordmark, tabs (bottom bar on phones), and the avatar that opens the profile.
export function AppHeader({ name, image }: { isOwner?: boolean; name?: string | null; image?: string | null }) {
  const initial = (name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  return (
    <>
    <header className="sticky top-0 z-20 border-b border-surface-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-4">
        <Link href="/radar" className="font-display text-3xl font-black tracking-wide text-wordmark">FrontRow</Link>
        <div className="flex flex-1 items-center">
          <DesktopNav />
        </div>
        <Link href="/profile" aria-label="Your profile" className="shrink-0">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={32} height={32} className="rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{initial}</span>
          )}
        </Link>
      </div>
    </header>
    <BottomBar />
    <SeenPing />
    </>
  );
}
