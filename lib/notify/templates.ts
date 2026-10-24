import { formatShowTime } from "@/lib/util/ist";
import { appUrl } from "./email";
import { headline, reasonLine, showDay, type EventCard, type Urgency } from "./content";
import { STAGE_EMOJI, STAGE_HEX } from "@/lib/stage";

const e = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shell = (inner: string, unsub: string) => `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917">
<div style="max-width:560px;margin:0 auto;padding:16px">${inner}
<p style="font-size:12px;color:#78716c;text-align:center;margin:24px 0 0">You get this because you follow these artists on FrontRow.<br><a href="${unsub}" style="color:#78716c">Unsubscribe from email</a></p></div></body></html>`;

function card(ev: EventCard, urgency: Urgency, kind: "alert" | "test" = "alert") {
  const poster = `${appUrl()}/api/og/event/${ev.id}?u=${urgency}`;
  const reason = reasonLine(ev);
  const btn = ev.ticketUrl
    ? `<a href="${e(ev.ticketUrl)}" style="display:inline-block;background:${STAGE_HEX[ev.stage]};color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">Get tickets</a>`
    : "";
  return `<div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4">
<img src="${poster}" width="560" alt="${e(ev.artistName)}" style="display:block;width:100%;height:auto">
<div style="padding:16px 20px">
<p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.04em;color:${STAGE_HEX[ev.stage]}">${STAGE_EMOJI[ev.stage]} ${e(headline(ev, kind))}</p>
<h2 style="margin:6px 0 2px;font-size:22px">${e(ev.artistName)}</h2>
<p style="margin:0;color:#57534e">${e([ev.venue, ev.city].filter(Boolean).join(" · "))}</p>
<p style="margin:4px 0 0">${e([showDay(ev.date), formatShowTime(ev.time)].filter(Boolean).join(", "))}</p>
${reason ? `<p style="margin:8px 0 0;font-weight:600">${e(reason)}</p>` : ""}
<p style="margin:12px 0 0;font-size:13px;color:#78716c">Sources: ${e(ev.platforms.slice(0, 4).join(", ") || "see links")}</p>
<p style="margin:16px 0 0">${btn} <a href="${appUrl()}/api/ics/${ev.id}" style="margin-left:10px;color:#57534e">Add to calendar</a></p>
</div></div>`;
}

export function alertEmail(ev: EventCard, urgency: Urgency, unsub: string, kind: "alert" | "test" = "alert") {
  const subject = `${STAGE_EMOJI[ev.stage]} ${kind === "test" ? "Test: " : ""}${ev.artistName}${ev.city ? ` in ${ev.city}` : ""}, ${showDay(ev.date)}`;
  const text = [headline(ev, kind), ev.artistName, [ev.venue, ev.city].filter(Boolean).join(" · "), showDay(ev.date), reasonLine(ev) ?? "", ev.ticketUrl ? `Tickets: ${ev.ticketUrl}` : "", `Unsubscribe: ${unsub}`].filter(Boolean).join("\n");
  return { subject, html: shell(card(ev, urgency, kind), unsub), text };
}

export type DigestGroup = { title: string; items: { ev: EventCard; urgency: Urgency }[] };

export function digestEmail(groups: DigestGroup[], unsub: string) {
  const n = groups.reduce((a, g) => a + g.items.length, 0);
  const rows = groups
    .filter((g) => g.items.length)
    .map(
      (g) => `<h3 style="margin:24px 0 8px">${e(g.title)}</h3>` +
        g.items.map(({ ev, urgency }) => `<div style="background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:12px 16px;margin:0 0 8px"><p style="margin:0;font-weight:700">${e(ev.artistName)} <span style="color:${STAGE_HEX[ev.stage]};font-weight:500">· ${e(reasonLine(ev) ?? "")}</span></p><p style="margin:2px 0 0;color:#57534e">${e([showDay(ev.date), ev.venue, ev.city].filter(Boolean).join(" · "))}</p>${ev.ticketUrl ? `<p style="margin:6px 0 0"><a href="${e(ev.ticketUrl)}">Tickets</a> · <a href="${appUrl()}/api/ics/${ev.id}">Calendar</a></p>` : ""}</div>`).join(""),
    )
    .join("");
  const text = groups.flatMap((g) => [g.title, ...g.items.map(({ ev }) => `- ${ev.artistName}, ${ev.city ?? ""}, ${showDay(ev.date)}${ev.ticketUrl ? ` ${ev.ticketUrl}` : ""}`)]).join("\n");
  return { subject: `FrontRow daily digest: ${n} new show${n === 1 ? "" : "s"}`, html: shell(`<h1 style="font-size:22px;margin:8px 0">Your daily digest</h1><p style="margin:0;color:#57534e">${n} new in the last 24 hours</p>${rows}`, unsub), text: `${text}\n\nUnsubscribe: ${unsub}` };
}
