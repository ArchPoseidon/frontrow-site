import Link from "next/link";
import { FAQS } from "@/lib/support/faqs";

export const metadata = { title: "FAQ · FrontRow" };

export default function Faq() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 pb-28">
      <Link href="/" className="font-display text-3xl font-black tracking-wide text-wordmark">FrontRow</Link>
      <h1 className="font-display mt-6 text-6xl leading-[0.9] font-black">FAQ</h1>
      <div className="mt-6 space-y-2">
        {FAQS.map((f) => (
          <details key={f.q} className="group rounded-card border border-surface-border bg-surface/80 px-4 py-3 backdrop-blur">
            <summary className="cursor-pointer list-none font-semibold group-open:text-magenta">{f.q}</summary>
            <p className="mt-2 text-sm text-muted">{f.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">Still stuck? Tap the chat bubble and ask Encore.</p>
    </main>
  );
}
