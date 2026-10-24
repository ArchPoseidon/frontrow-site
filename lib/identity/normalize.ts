// Lowercase, strip accents and punctuation, drop a leading "the" and the word "live".
export function normalizeName(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = base
    .split(/\s+/)
    .filter(Boolean)
    .filter((w, i) => !(i === 0 && w === "the") && w !== "live");
  return words.join(" ") || input.trim().toLowerCase();
}

// Deterministic aliases only (no LLM): without a leading "The", and "&" <-> "and".
export function derivedAliases(name: string): string[] {
  const out = new Set<string>();
  const trimmed = name.trim();
  if (/^the\s+/i.test(trimmed)) out.add(trimmed.replace(/^the\s+/i, ""));
  if (trimmed.includes("&")) out.add(trimmed.replace(/\s*&\s*/g, " and "));
  if (/\band\b/i.test(trimmed)) out.add(trimmed.replace(/\s+and\s+/gi, " & "));
  out.delete(trimmed);
  return [...out];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
