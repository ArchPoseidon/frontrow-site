const base = () => {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return `https://api.telegram.org/bot${t}`;
};

export class TelegramError extends Error {
  constructor(message: string, public code: number) {
    super(message);
  }
  // User blocked the bot or deleted the chat: stop trying, fall back to email.
  get blocked() {
    return this.code === 403 || (this.code === 400 && /chat not found/i.test(this.message));
  }
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${base()}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
  if (!j.ok) throw new TelegramError(j.description ?? `Telegram ${r.status}`, j.error_code ?? r.status);
  return j.result as T;
}

export type Button = { text: string; url?: string; callback_data?: string };

export async function sendPhoto(chatId: number, photoUrl: string, caption: string, buttons: Button[][]) {
  return tg<{ message_id: number }>("sendPhoto", { chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
}

export async function sendMessage(chatId: number, text: string, buttons?: Button[][]) {
  return tg<{ message_id: number }>("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) });
}

export const answerCallback = (id: string, text?: string) => tg("answerCallbackQuery", { callback_query_id: id, text }).catch(() => {});
export const editCaption = (chatId: number, messageId: number, caption: string, buttons: Button[][]) =>
  tg("editMessageCaption", { chat_id: chatId, message_id: messageId, caption, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
export const editText = (chatId: number, messageId: number, text: string, buttons: Button[][]) =>
  tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Swap just the buttons under a message (used after "Wrong link": the ticket button disappears at once).
export const editReplyMarkup = (chatId: number, messageId: number, buttons: Button[][]) =>
  tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: buttons } });
