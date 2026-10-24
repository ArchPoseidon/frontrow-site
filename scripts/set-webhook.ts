// Registers the Telegram webhook. Usage: tsx scripts/set-webhook.ts [https://your-domain]
import { config } from "dotenv";
config({ path: ".env.local" });
import { tg } from "@/lib/notify/telegram";

async function main() {
  const url = `${(process.argv[2] ?? process.env.APP_URL ?? "").replace(/\/$/, "")}/api/telegram/webhook`;
  if (!url.startsWith("https://")) throw new Error("Pass an https URL (Telegram only calls https)");
  await tg("setWebhook", { url, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  await tg("setMyCommands", { commands: [
    { command: "new", description: "Newest shows for your artists" },
    { command: "tickets", description: "Ticket info for those shows" },
    { command: "upcoming", description: "Your next shows" },
    { command: "artists", description: "Who you follow" },
    { command: "mute", description: "Mute an artist" },
    { command: "help", description: "What I can do" },
  ] });
  console.log("webhook set:", url, await tg("getWebhookInfo", {}));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
