import { formatShowTime } from "@/lib/util/ist";
import { esc } from "./telegram";
import { headline, reasonLine, showDay, type EventCard, type Urgency } from "./content";
import { STAGE_EMOJI } from "@/lib/stage";

export function telegramCaption(ev: EventCard, urgency: Urgency, kind: "alert" | "test" = "alert") {
  const when = [showDay(ev.date), formatShowTime(ev.time)].filter(Boolean).join(", ");
  const reason = reasonLine(ev);
  const lines = [
    `${STAGE_EMOJI[ev.stage]} <b>${esc(headline(ev, kind))}</b>`,
    `<b>${esc(ev.artistName)}</b>${ev.venue ? ` · ${esc(ev.venue)}` : ""}`,
    esc(when),
    reason ? `${ev.stage === "live" ? "🟢" : "🕒"} ${esc(reason)}` : "",
    ev.platforms.length ? `Sources: ${esc(ev.platforms.slice(0, 4).join(", "))}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function telegramButtons(ev: EventCard, alertId: string | null, appUrl: string, acted?: "bought" | "dismissed") {
  if (acted === "bought") return [[{ text: "Going 🎉", callback_data: "noop" }]];
  if (acted === "dismissed") return [[{ text: "Dismissed", callback_data: "noop" }]];
  const row1 = [] as { text: string; url?: string; callback_data?: string }[];
  // Only a verified exact ticket page gets the ticket button. Otherwise point at the event page here, which lists
  // every verified source, so no button ever lands on a homepage or a dead page.
  const link = ev.ticketUrl ?? null;
  if (link) row1.push({ text: "🎟 Get tickets", url: link });
  else row1.push({ text: "🔗 Details & sources", url: `${appUrl}/event/${ev.id}` });
  if (ev.date) row1.push({ text: "📅 Calendar", url: `${appUrl}/api/ics/${ev.id}` });
  const row2 = [{ text: "💬 Ticket info", callback_data: `tix:${ev.id}` }] as { text: string; url?: string; callback_data?: string }[];
  if (link && alertId) row2.push({ text: "⚠️ Wrong link", callback_data: `wrong:${alertId}` });
  const rows = [row1, row2];
  if (alertId) rows.push([{ text: "✅ Bought it", callback_data: `bought:${alertId}` }, { text: "🙅 Not for me", callback_data: `dismiss:${alertId}` }]);
  return rows;
}

const TIER_WORD: Record<string, string> = { open: "on sale", sold_out: "sold out", upcoming: "not on sale yet", closed: "closed" };
const attr = (u: string) => u.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// The reply to "tickets please": what is on sale, the verified ticket page, or an honest "not confirmed yet" with sources.
export function ticketReplyText(ev: EventCard, appUrl: string) {
  const when = [showDay(ev.date), formatShowTime(ev.time)].filter(Boolean).join(", ");
  const reason = reasonLine(ev);
  const lines = [`🎟 <b>${esc(ev.artistName)}</b>${ev.venue ? ` · ${esc(ev.venue)}` : ""}${ev.city ? `, ${esc(ev.city)}` : ""}`, esc(when)];
  if (reason) lines.push(`${STAGE_EMOJI[ev.stage]} ${esc(reason)}`);
  if (ev.tiers.length) {
    lines.push("", "<b>Tickets</b>");
    for (const t of ev.tiers.slice(0, 6)) lines.push(`• ${esc(t.name)}${t.priceInr ? ` ₹${t.priceInr.toLocaleString("en-IN")}` : ""}: ${TIER_WORD[t.status ?? ""] ?? esc(t.status ?? "")}`);
  }
  lines.push("");
  if (ev.ticketUrl) lines.push(`<a href="${attr(ev.ticketUrl)}">Open the ticket page</a> (checked: this is the page for this show)`);
  else {
    lines.push("The exact ticket page isn't confirmed yet. I'll message you when it is. Where this was announced:");
    for (const s of ev.sourceLinks.slice(0, 4)) lines.push(`• <a href="${attr(s.url)}">${esc(s.platform ?? new URL(s.url).hostname.replace(/^www\./, ""))}</a>`);
    lines.push(`<a href="${appUrl}/event/${ev.id}">All details and sources</a>`);
  }
  return lines.join("\n");
}
