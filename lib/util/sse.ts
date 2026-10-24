// Minimal server-sent-events helper for streaming scan progress.
export type Emit = (event: string, data: unknown) => void;

export function sseResponse(run: (emit: Emit) => Promise<void>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit: Emit = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await run(emit);
      } catch (e) {
        emit("error", { message: e instanceof Error ? e.message : "Scan failed" });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
