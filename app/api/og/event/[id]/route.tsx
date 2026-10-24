import { formatShowTime } from "@/lib/util/ist";
import { ImageResponse } from "next/og";
import { getDb } from "@/lib/db";
import { loadEventCard, reasonLine } from "@/lib/notify/content";
import { STAGE_HEX, STAGE_LABEL } from "@/lib/stage";

// Public 1200x630 poster. Shared by Telegram alerts and email. The border and band colour follow the ticket stage:
// live red, go-live date announced purple, announced / not live orange.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  void req;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const ev = await loadEventCard(getDb(), id).catch(() => null);
  if (!ev) return new Response("Not found", { status: 404 });

  const color = STAGE_HEX[ev.stage];
  const [y, m, d] = (ev.date ?? "").split("-").map(Number);
  const dt = ev.date ? new Date(Date.UTC(y, m - 1, d)) : null;
  const dow = dt ? new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(dt).toUpperCase() : "TBA";
  const mon = dt ? new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(dt).toUpperCase() : "";
  const reason = reasonLine(ev) ?? "";
  const tiers = ev.tiers.slice(0, 5);
  const label = ev.isSample ? "SAMPLE" : ev.isFestival ? "FESTIVAL" : "NEW SHOW";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0c0a09", color: "#fafaf9", fontFamily: "sans-serif", border: `12px solid ${color}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: color, color: "#fff", padding: "20px 40px", fontSize: 34, fontWeight: 700 }}>
          <span>{`${label}${ev.city ? ` · ${ev.city.toUpperCase()}` : ""}`}</span>
          <span style={{ fontSize: 28, fontWeight: 500 }}>{reason || STAGE_LABEL[ev.stage]}</span>
        </div>
        <div style={{ display: "flex", flex: 1, padding: "40px 48px", gap: 40, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 220, height: 260, borderRadius: 24, background: "#1c1917", border: `3px solid ${color}` }}>
            <span style={{ fontSize: 34, color: "#a8a29e" }}>{dow}</span>
            <span style={{ fontSize: 120, fontWeight: 800, lineHeight: 1 }}>{dt ? d : "?"}</span>
            <span style={{ fontSize: 40, fontWeight: 700 }}>{mon}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 14 }}>
            <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>{ev.artistName}</span>
            <span style={{ fontSize: 34, color: "#d6d3d1" }}>{[ev.venue, ev.city].filter(Boolean).join(" · ")}</span>
            {ev.time ? <span style={{ fontSize: 28, color: "#a8a29e" }}>{formatShowTime(ev.time)}</span> : null}
            {tiers.length > 0 ? (
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                {tiers.map((t, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", padding: "10px 16px", borderRadius: 12, fontSize: 22, background: t.status === "open" ? color : "#1c1917", color: t.status === "open" ? "#fff" : t.status === "sold_out" || t.status === "closed" ? "#57534e" : "#a8a29e", textDecoration: t.status === "sold_out" ? "line-through" : "none" }}>
                    <span>{t.name}</span>
                    {t.priceInr ? <span>{`₹${t.priceInr.toLocaleString("en-IN")}`}</span> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {ev.artistImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.artistImage} width={260} height={260} alt="" style={{ borderRadius: 24, objectFit: "cover" }} />
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 48px 26px", fontSize: 22, color: "#78716c" }}>
          <span>FrontRow</span>
          <span>{ev.platforms.slice(0, 3).join(" · ")}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } },
  );
}
