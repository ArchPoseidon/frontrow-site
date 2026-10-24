import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { sleep } from "@/lib/util/retry";

let client: GoogleGenAI | null = null;
function ai() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}
export const geminiModel = () => process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

export class RetryableLlmError extends Error {}

function isRetryable(e: unknown) {
  const s = String((e as { status?: number })?.status ?? "") + " " + String((e as Error)?.message ?? e);
  return /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|fetch failed/i.test(s);
}

// Exponential backoff (1s, 4s, 16s) on 429 / 5xx, then give up so the item stays `new`.
async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1000, 4000, 16000];
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRetryable(e)) throw e;
      if (i >= delays.length) throw new RetryableLlmError(e instanceof Error ? e.message : "Gemini unavailable");
      await sleep(delays[i]);
    }
  }
}

// Structured output, validated again with zod; one retry with a "valid JSON only" nudge, then throw.
export async function generateJson<S extends z.ZodType>(prompt: string, schema: S): Promise<z.infer<S>> {
  const responseJsonSchema = z.toJSONSchema(schema);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const contents = attempt === 0 ? prompt : `${prompt}\n\nReturn valid JSON only, matching the schema exactly.`;
    const res = await withBackoff(() =>
      ai().models.generateContent({
        model: geminiModel(),
        contents,
        config: { responseMimeType: "application/json", responseJsonSchema, temperature: 0 },
      }),
    );
    try {
      return schema.parse(JSON.parse(res.text ?? ""));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Gemini returned malformed JSON: ${lastErr instanceof Error ? lastErr.message.slice(0, 200) : "unknown"}`);
}

export type Grounded = { text: string; sources: { url: string; title?: string }[] };

// Gemini with Google Search. Grounding and structured output are not combined (separate calls).
export async function generateGrounded(prompt: string): Promise<Grounded> {
  const res = await withBackoff(() =>
    ai().models.generateContent({ model: geminiModel(), contents: prompt, config: { tools: [{ googleSearch: {} }] } }),
  );
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks.flatMap((c) => (c.web?.uri ? [{ url: c.web.uri, title: c.web.title }] : []));
  return { text: (res.text ?? "").trim(), sources };
}

export async function yesNo(question: string): Promise<boolean> {
  const out = await generateJson(question, z.object({ answer: z.boolean() }));
  return out.answer;
}
