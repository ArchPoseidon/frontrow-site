const ALIASES: Record<string, string> = {
  bangalore: "bengaluru",
  bombay: "mumbai",
  gurgaon: "gurugram",
  "new delhi": "delhi",
  "delhi ncr": "delhi",
  ncr: "delhi",
  calcutta: "kolkata",
  madras: "chennai",
  poona: "pune",
  baroda: "vadodara",
  "navi mumbai": "mumbai",
  noida: "delhi",
  "delhi ncr gurugram": "gurugram",
};

export function normalizeCity(c: string | null | undefined): string {
  const base = (c ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[base] ?? base;
}

export function displayCity(c: string | null | undefined): string {
  const n = normalizeCity(c);
  return n.replace(/\b\w/g, (m) => m.toUpperCase());
}
