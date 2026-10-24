// Static FAQs: quick replies in the support widget and the /faq page.
// Answers mirror the AgenticOrg knowledge base, so they work even if the agent is down.
export type Faq = { q: string; a: string; tags?: string[] };

export const FAQS: Faq[] = [
  { q: "What is FrontRow?", a: "FrontRow alerts you the moment an artist you love announces a show in India, with the exact ticket page and whether tickets are live. FrontRow alerts you; you buy your own tickets.", tags: ["about"] },
  { q: "Is FrontRow free?", a: "Yes. FrontRow is currently a free, personal, non-commercial project.", tags: ["about", "pricing"] },
  { q: "How do I sign up?", a: "Click “Continue with Google” on the home page; there's no separate password. Google also asks for optional calendar access, and you can untick it. The beta is invite-only, so if you're blocked, ask the FrontRow team to add your Google email.", tags: ["account"] },
  { q: "Google says the app isn't verified", a: "FrontRow is in Google's testing mode, so Google shows this warning. On the official site (frontrow-pi-three.vercel.app), click Continue or Advanced → Go to FrontRow.", tags: ["account"] },
  { q: "How do I add artists?", a: "Connect Spotify (read-only import of followed and top artists), search by name, or paste a list of names or open.spotify.com/artist links. Spotify import is invite-only during beta; search or paste works for everyone.", tags: ["artists"] },
  { q: "What do Follow, Must-see and Muted mean?", a: "Tap an artist card to cycle. Follow = normal alerts. Must-see = always a high-priority alert and checked first. Muted = no alerts (or send /mute <artist> on Telegram).", tags: ["artists"] },
  { q: "How do I get alerts on Telegram?", a: "Profile → Connections → Connect Telegram. Scan the QR code on your phone (or tap the button on the same device), then press Start in Telegram. The page updates once you're linked.", tags: ["alerts"] },
  { q: "How do I change my city?", a: "Profile → Cities. Your home city gets the loudest alerts. Add other cities, or choose “Alert me for any Indian city”.", tags: ["settings"] },
  { q: "What do the ticket colours mean?", a: "🔴 Tickets live · 🟣 Tickets go live soon (confirmed, sale date announced) · 🟠 Announced, tickets not live · ⚫ Sold out · ⚪ Rumour.", tags: ["tickets"] },
  { q: "Can I buy tickets or get a refund on FrontRow?", a: "No. FrontRow doesn't sell tickets, take payments or issue refunds. Use “Get tickets” to open the official ticketing page, and contact that platform about orders or refunds.", tags: ["tickets"] },
  { q: "How do I delete my account?", a: "Profile → Delete account → type DELETE. This permanently removes your artists, alerts and Telegram link.", tags: ["account", "privacy"] },
];

export const QUICK_REPLIES = [
  "How do I get alerts on Telegram?",
  "How do I add artists?",
  "What do the ticket colours mean?",
  "Is FrontRow free?",
];
