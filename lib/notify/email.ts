import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Gmail API: sends as a connected Gmail account with a refresh token (no app password, no domain).
// Obtained once with `scripts/connect-gmail-sender.ts`; needs the gmail.send permission.
const gmailApiReady = () => !!(process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_SENDER && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

// Brevo (free tier, 300 emails a day): sends from a verified single sender address, no domain needed.
const brevoReady = () => !!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER);

export function emailConfigured() {
  if (brevoReady() || gmailApiReady()) return true;
  if (process.env.EMAIL_PROVIDER === "resend") return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

// Signed unsubscribe token: HMAC of the user id, so nobody can unsubscribe someone else.
const sign = (userId: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`unsub:${userId}`).digest("hex").slice(0, 32);
export const unsubscribeUrl = (userId: string) => `${appUrl()}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
export function verifyUnsubscribe(userId: string, token: string) {
  const a = Buffer.from(sign(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

let gmailToken: { token: string; exp: number } | null = null;
async function gmailAccessToken(): Promise<string> {
  if (gmailToken && gmailToken.exp > Date.now() + 60_000) return gmailToken.token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!, grant_type: "refresh_token", refresh_token: process.env.GMAIL_REFRESH_TOKEN! }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Gmail sign-in expired (${j.error_description ?? r.status}). Run scripts/connect-gmail-sender.ts again.`);
  gmailToken = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return gmailToken.token;
}

async function sendViaGmailApi(to: string, subject: string, html: string, text: string, headers: Record<string, string>) {
  const { default: MailComposer } = await import("nodemailer/lib/mail-composer");
  const sender = process.env.GMAIL_SENDER!;
  const raw = await new Promise<Buffer>((resolve, reject) =>
    new MailComposer({ from: process.env.EMAIL_FROM || `FrontRow <${sender}>`, to, subject, text, html, headers }).compile().build((e, msg) => (e ? reject(e) : resolve(msg))),
  );
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${await gmailAccessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: raw.toString("base64url") }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Gmail API ${r.status}: ${(await r.text()).slice(0, 160)}`);
}

async function sendViaBrevo(to: string, subject: string, html: string, text: string, headers: Record<string, string>) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: "FrontRow", email: process.env.BREVO_SENDER }, to: [{ email: to }], subject, htmlContent: html, textContent: text, headers }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export async function sendEmail(to: string, subject: string, html: string, text: string, unsubscribe: string) {
  const headers = { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  if (brevoReady()) return sendViaBrevo(to, subject, html, text, headers);
  if (gmailApiReady()) return sendViaGmailApi(to, subject, html, text, headers);
  if (process.env.EMAIL_PROVIDER === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html, text, headers }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return;
  }
  const user = process.env.GMAIL_USER!;
  const t = nodemailer.createTransport({ service: "gmail", auth: { user, pass: process.env.GMAIL_APP_PASSWORD } });
  await t.sendMail({ from: process.env.EMAIL_FROM || `FrontRow <${user}>`, to, subject, html, text, headers });
}
