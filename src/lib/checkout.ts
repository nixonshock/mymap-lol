import type { CheckoutRequest, CheckoutResult } from "./types";

/**
 * Payment gateway abstraction.
 *
 * DEMO mode (default): simulates a successful checkout and returns paid
 * immediately — lets the whole product work end-to-end without any keys.
 *
 * LIVE mode: set NEXT_PUBLIC_PAYMENT_MODE=live and provide the matching
 * provider env vars (e.g. Bitcoin Lightning via LNbits / Whop / Stripe).
 * See README.md -> "Real payments" for the exact env vars + webhook wiring.
 * Real keys are NEVER written by this codebase; they come from the environment.
 */
export async function checkout(req: CheckoutRequest): Promise<CheckoutResult> {
  const mode = process.env.NEXT_PUBLIC_PAYMENT_MODE ?? "demo";

  // In live mode this would call the provider (create invoice, wait for webhook)
  // and only mark paid once funds confirm. Demo mode short-circuits.
  if (mode !== "live") {
    await new Promise((r) => setTimeout(r, 700)); // simulate processing
    return {
      status: "paid",
      txId: `demo_${Math.random().toString(36).slice(2, 10)}`,
      message: "Paid (demo mode — no real payment was taken).",
    };
  }

  // Live path: delegate to the configured provider.
  const provider = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
  if (!provider) {
    return { status: "failed", message: "Payment provider not configured (env NEXT_PUBLIC_PAYMENT_PROVIDER)." };
  }
  return providerCheckout(req, provider);
}

async function providerCheckout(_req: CheckoutRequest, _provider: string): Promise<CheckoutResult> {
  // Implementation lives in src/lib/payments/<provider>.ts. For now this is the
  // documented hook point — flip on once you've wired your gateway.
  return { status: "pending", message: `Live payment via ${_provider} not yet wired. See README.` };
}
