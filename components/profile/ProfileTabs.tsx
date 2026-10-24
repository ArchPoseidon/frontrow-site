import Link from "next/link";

// Big two-way switch at the top of Profile and Connections.
export function ProfileTabs({ active }: { active: "profile" | "connections" }) {
  const t = (on: boolean) => `font-display flex-1 rounded-md px-2 py-3.5 text-center text-2xl leading-none font-extrabold sm:text-3xl ${on ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"}`;
  return (
    <nav aria-label="Profile sections" className="flex gap-1 rounded-card border border-surface-border bg-surface/80 p-1.5 backdrop-blur">
      <Link href="/profile" aria-current={active === "profile" ? "page" : undefined} className={t(active === "profile")}>Profile</Link>
      <Link href="/connections" aria-current={active === "connections" ? "page" : undefined} className={t(active === "connections")}>Connections</Link>
    </nav>
  );
}
