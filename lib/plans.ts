// Plans. Everything is free while PAYMENTS_ENABLED is not "true": the product never depends on a payment.
export const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === "true";

export type Plan = { id: "free" | "plus"; name: string; priceInr: number; blurb: string; features: string[] };
export const PLANS: Plan[] = [
  { id: "free", name: "Free", priceInr: 0, blurb: "Everything you need to never miss a show.", features: ["Alerts on Telegram", "Radar, calendar and My shows", "City priorities (P1 / P2)", "Your artists with news"] },
  // Placeholder copy and price: the owner will confirm what Plus unlocks and what it costs.
  { id: "plus", name: "Plus", priceInr: 99, blurb: "For fans who want first-in-line extras.", features: ["Everything in Free", "Phone-call reminders for your top 5", "More instant alerts per day", "Merch perks"] },
];
