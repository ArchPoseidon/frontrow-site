import { createHmac, timingSafeEqual } from "node:crypto";

// Pine Labs (Plural) payments: NOT ENABLED. Only used when PAYMENTS_ENABLED=true and the PINELABS_* settings exist.
// The order-creation call below is a skeleton: confirm the endpoint, auth and field names against Pine Labs' current docs
// and test in their UAT environment first. Never store card data.
export const pinelabsConfigured = () => !!(process.env.PINELABS_API_BASE && process.env.PINELABS_CLIENT_ID && process.env.PINELABS_CLIENT_SECRET && process.env.PINELABS_MERCHANT_ID);

export async function createOrder(input: { merchantOrderRef: string; amountInr: number; returnUrl: string; customerEmail?: string | null }): Promise<{ ok: true; orderId: string; checkoutUrl: string } | { ok: false; error: string }> {
  if (!pinelabsConfigured()) return { ok: false, error: "Payments are not set up yet." };
  // TODO(owner + builder): implement against Pine Labs' documented "create order" API (token, order, hosted checkout redirect).
  return { ok: false, error: "Pine Labs order creation is not implemented yet." };
}

// Webhook signature check: HMAC-SHA256 of the raw body with PINELABS_WEBHOOK_SECRET (hex). Confirm the exact scheme in Pine Labs' docs.
export function verifyWebhook(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PINELABS_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const want = createHmac("sha256", secret).update(rawBody).digest("hex");
  return signature.length === want.length && timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(want));
}
