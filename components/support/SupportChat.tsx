"use client";

// Floating support chat, backed by the Encore agent on AgenticOrg via /api/support.
import { useEffect, useRef, useState } from "react";
import { QUICK_REPLIES } from "@/lib/support/faqs";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content: "Hey! I'm Encore, FrontRow's support assistant. Ask me about alerts, artists, tickets or your account.",
};

// Tiny, safe formatter: **bold**, `code`, and line breaks. Everything else is plain text.
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="rounded-sm bg-surface-border/60 px-1 font-mono text-[0.85em]">{p.slice(1, -1)}</code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = msgs.filter((m) => m !== GREETING);
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const j = await r.json().catch(() => ({}));
      setMsgs((m) => [...m, { role: "assistant", content: j.reply ?? "Sorry, something went wrong. Try again?" }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "I couldn't connect. Check your internet and try again." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="FrontRow support chat"
          className="fixed inset-x-3 bottom-36 z-50 flex max-h-[min(70vh,34rem)] flex-col overflow-hidden rounded-card border border-surface-border bg-surface text-foreground shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-24 sm:w-[380px]"
        >
          <header className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <div>
              <p className="font-display text-xl leading-none font-extrabold text-wordmark">Encore</p>
              <p className="mt-1 text-xs text-muted">FrontRow support · replies in a few seconds</p>
            </div>
            <button onClick={() => { setOpen(false); launcherRef.current?.focus(); }} aria-label="Close chat" className="rounded-card p-2 text-muted hover:text-foreground">✕</button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.role === "user" ? "max-w-[85%] rounded-card bg-magenta px-3 py-2 text-white" : "max-w-[85%] rounded-card bg-background px-3 py-2"}>
                  <Rich text={m.content} />
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted">Encore is typing…</p>}
            {msgs.length === 1 && !busy && (
              <div className="flex flex-wrap gap-2 pt-1">
                {QUICK_REPLIES.map((q) => (
                  <button key={q} onClick={() => send(q)} className="rounded-full border border-surface-border px-3 py-1.5 text-xs hover:border-magenta hover:text-magenta">{q}</button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-surface-border p-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about alerts, artists, tickets…"
              aria-label="Your message"
              maxLength={1000}
              className="min-w-0 flex-1 rounded-card border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-magenta"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send message" className="rounded-card bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-50">Send</button>
          </form>
          <p className="px-4 pb-2 text-[11px] text-muted">FrontRow never asks for passwords, OTPs or payment details.</p>
        </div>
      )}

      <button
        ref={launcherRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
        className="fixed right-3 bottom-20 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-surface-border bg-magenta text-xl text-white shadow-lg transition hover:scale-105 sm:right-5 sm:bottom-5 sm:h-14 sm:w-14"
      >
        {open ? "✕" : "💬"}
      </button>
    </>
  );
}
