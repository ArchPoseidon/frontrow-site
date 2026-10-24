// Store UTC, compute and display in IST (Asia/Kolkata).
const IST = "Asia/Kolkata";

export function todayIST(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isoWeekIST(now = new Date()): string {
  const [y, m, d] = todayIST(now).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((dt.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function formatShowDate(date: string | null): string {
  if (!date) return "Date TBA";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMonthYear(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "short", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, d || 1)));
}

// YYYY-MM-DD for `days` days after today (IST).
export function addDays(days: number, now = new Date()): string {
  const [y, m, d] = todayIST(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// "18:30:00+05:30" / "18:30" / "7 PM" -> "6:30 pm"; free text is returned as is.
export function formatShowTime(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(?:\+05:30|IST))?$/i.exec(t.trim());
  if (!m) return t.trim();
  const h = Number(m[1]);
  return `${h % 12 || 12}${m[2] === "00" ? "" : `:${m[2]}`} ${h >= 12 ? "pm" : "am"}`;
}
