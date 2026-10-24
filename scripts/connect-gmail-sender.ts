// One-time: connect the Gmail account FrontRow sends email from, with no app password.
// Usage (stop the dev server first, it uses port 3000): npx tsx scripts/connect-gmail-sender.ts [sender@gmail.com]
// It prints a Google link; sign in as the SENDER account and allow "Send email on your behalf".
// Then it saves GMAIL_SENDER and GMAIL_REFRESH_TOKEN to .env.local and Vercel, and sends a test to OWNER_EMAIL.
import { config } from "dotenv";
config({ path: ".env.local" });
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const REDIRECT = "http://localhost:3000/api/auth/callback/google"; // already an authorised redirect for sign-in
const SCOPE = "openid email https://www.googleapis.com/auth/gmail.send";

function setEnvLocal(k: string, v: string) {
  const f = ".env.local";
  const lines = readFileSync(f, "utf8").split("\n").filter((l) => !l.startsWith(`${k}=`));
  lines.push(`${k}=${v}`);
  writeFileSync(f, lines.join("\n").replace(/\n+$/, "\n"));
}
function setVercel(k: string, v: string) {
  spawnSync("npx", ["vercel", "env", "rm", k, "production", "-y"], { stdio: "ignore" });
  const r = spawnSync("npx", ["vercel", "env", "add", k, "production"], { input: v, encoding: "utf8" });
  if (r.status !== 0) console.error(`Could not set ${k} on Vercel:`, r.stderr?.slice(0, 200));
}

async function main() {
  const hint = process.argv[2];
  const state = randomBytes(12).toString("hex");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID!, redirect_uri: REDIRECT, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", state, ...(hint ? { login_hint: hint } : {}) })}`;
  const code = await new Promise<string>((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://localhost:3000");
      if (u.pathname !== "/api/auth/callback/google") return void res.writeHead(404).end();
      const err = u.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" }).end(`<body style="font-family:system-ui;padding:40px"><h2>${err ? "Not connected: " + err : "Connected. You can close this tab."}</h2></body>`);
      srv.close();
      if (err) reject(new Error(err));
      else if (u.searchParams.get("state") !== state) reject(new Error("state mismatch"));
      else resolve(u.searchParams.get("code")!);
    });
    srv.listen(3000, () => {
      console.log("\nOpen this link, sign in as the SENDER Gmail account, and allow it:\n\n" + url + "\n");
      try { execFileSync("open", [url]); } catch {}
    });
    setTimeout(() => reject(new Error("timed out after 10 minutes")), 600_000);
  });
  const tr = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!, redirect_uri: REDIRECT, grant_type: "authorization_code" }) });
  const t = (await tr.json()) as { refresh_token?: string; id_token?: string; scope?: string; error_description?: string };
  if (!tr.ok || !t.refresh_token) throw new Error(`No refresh token (${t.error_description ?? tr.status}). Remove FrontRow at myaccount.google.com/permissions and try again.`);
  if (!t.scope?.includes("gmail.send")) throw new Error("The send permission was not granted. Tick the box for sending email and try again.");
  const email = JSON.parse(Buffer.from(t.id_token!.split(".")[1], "base64url").toString()).email as string;
  setEnvLocal("GMAIL_SENDER", email);
  setEnvLocal("GMAIL_REFRESH_TOKEN", t.refresh_token);
  console.log("Saved to .env.local. Sender:", email);
  setVercel("GMAIL_SENDER", email);
  setVercel("GMAIL_REFRESH_TOKEN", t.refresh_token);
  console.log("Saved to Vercel (production). Redeploy to apply.");
  process.env.GMAIL_SENDER = email;
  process.env.GMAIL_REFRESH_TOKEN = t.refresh_token;
  const { sendEmail } = await import("@/lib/notify/email");
  const to = process.env.OWNER_EMAIL!;
  await sendEmail(to, "FrontRow email is connected", "<p>This test email came from FrontRow through your connected Gmail. Alerts and the daily digest can now reach users by email.</p>", "This test email came from FrontRow through your connected Gmail.", "https://frontrow-pi-three.vercel.app/profile");
  console.log("Test email sent to", to);
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
