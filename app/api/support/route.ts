// POST /api/support: server-side proxy to the "Encore" support agent on AgenticOrg.
// Keeps the AgenticOrg API key on the server; the browser never sees it.
import { z } from "zod";

const BASE = (process.env.AGENTICORG_BASE_URL ?? "https://agenticorg.hackathon.pinelabs.com").replace(/\/$/, "");
const AGENT_ID = process.env.AGENTICORG_AGENT_ID ?? "de6450fd-07f9-48b3-af3d-13e078ad25c6";

const Body = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(20)
    .optional(),
});

const FALLBACK = "Sorry, I couldn't reach support right now. Please try again in a moment, or check the FAQ.";

export async function POST(req: Request) {
  const apiKey = process.env.AGENTICORG_API_KEY ?? "";
  if (!apiKey) return Response.json({ reply: FALLBACK, error: "AGENTICORG_API_KEY is not set" }, { status: 500 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid message" }, { status: 400 });
  const { message, history = [] } = parsed.data;

  try {
    const r = await fetch(`${BASE}/api/v1/agents/${AGENT_ID}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        action: "process",
        // Last 10 turns are enough context and keep the request small.
        inputs: { message, history: history.slice(-10) },
        context: { channel: "website_chat", source: "frontrow-web" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
      console.error("[support] AgenticOrg", r.status, (await r.text()).slice(0, 300));
      return Response.json({ reply: FALLBACK }, { status: 502 });
    }
    const j = await r.json();
    // In Shadow mode the status is "hitl_triggered", but the answer is still in output.raw_output.
    const reply: string =
      j?.output?.raw_output ?? j?.output?.answer ?? j?.output?.response ?? (typeof j?.output === "string" ? j.output : "");
    return Response.json({ reply: reply || FALLBACK, runId: j?.run_id ?? null, confidence: j?.confidence ?? null });
  } catch (e) {
    console.error("[support] request failed", e);
    return Response.json({ reply: FALLBACK }, { status: 504 });
  }
}
