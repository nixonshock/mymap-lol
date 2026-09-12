import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Whop payments — server-only.
 *
 * The worldmap.lol pattern: every stake gets its OWN one-time plan, created on
 * the fly for the exact amount, and the buyer is handed to Whop's hosted
 * checkout page ("Opening secure checkout…"). Whop is the merchant of record:
 * it charges the card (or Apple/Google Pay, GrabPay, crypto…), handles tax and
 * refunds, and pays the balance out in the currency of the account's country.
 *
 * Env (set in Vercel — never committed):
 *   WHOP_API_KEY           account API key (Dashboard > Settings > API keys)
 *   WHOP_COMPANY_ID        biz_…  — the account the money lands in
 *   WHOP_PRODUCT_ID        prod_… — the product the per-stake plans hang off
 *   WHOP_CURRENCY          usd (default) | myr | … base currency of the plan.
 *                          Keep it usd: the card is charged US dollars and the
 *                          ringgit figure on the site is only a display conversion.
 *   WHOP_ADAPTIVE_PRICING  "true" → Whop shows the buyer's local currency
 *   WHOP_USD_MYR           rate used when the plan currency is MYR (default 4.04)
 *   WHOP_SANDBOX           "true" → sandbox-api.whop.com
 *   WHOP_RETURN_URL        where the buyer lands after paying (default
 *                          https://www.mymap.lol/) — carried by the checkout
 *                          configuration, which is what avoids Whop's /joined page
 *   WHOP_WEBHOOK_SECRET    ws_… — verifies inbound webhooks
 */

const PROD_API = "https://api.whop.com/api/v1";
const SANDBOX_API = "https://sandbox-api.whop.com/api/v1";

export const whopApiBase = () => (process.env.WHOP_SANDBOX === "true" ? SANDBOX_API : PROD_API);
export const whopCurrency = () => (process.env.WHOP_CURRENCY ?? "usd").toLowerCase();

/**
 * Where the buyer lands after paying.
 *
 * Whop's *plan* checkout ends on its own receipt page (`/joined/<route>/`), which
 * is not where we want a buyer to finish. A checkout configuration for the plan
 * takes a `redirect_url`, so that's what the stake flow hands over instead.
 */
export const whopReturnUrl = () => process.env.WHOP_RETURN_URL ?? "https://www.mymap.lol/";

export function whopConfigured(): boolean {
  return Boolean(
    process.env.WHOP_API_KEY && process.env.WHOP_COMPANY_ID && process.env.WHOP_PRODUCT_ID,
  );
}

/** Rate used to turn the site's dollar-denominated amounts into MYR charges. */
export function usdMyrRate(): number {
  const raw = Number(process.env.WHOP_USD_MYR ?? process.env.NEXT_PUBLIC_USD_MYR);
  return Number.isFinite(raw) && raw > 0 ? raw : 4.04;
}

/**
 * What the buyer is actually charged, in the plan's currency.
 *
 * With the default `usd`, this is simply the dollar amount the site showed —
 * the price is quoted in US dollars and the card is charged in US dollars, and
 * the "≈ RM…" figure next to it is a display conversion only.
 */
export function whopChargeAmount(amountUsd: number): number {
  return whopCurrency() === "myr" ? Math.round(amountUsd * usdMyrRate()) : amountUsd;
}

export interface WhopCheckoutInput {
  /** amount in the plan currency, major units (e.g. 40 for RM40) */
  amountMajor: number;
  title: string;
  description: string;
  metadata: Record<string, string>;
}

export interface WhopCheckout {
  planId: string;
  purchaseUrl: string;
  currency: string;
  /** set when a checkout configuration (the redirect-aware link) was used */
  checkoutConfigId: string;
}

/** Create a one-time plan for this exact stake and return its hosted checkout. */
export async function createWhopCheckout(input: WhopCheckoutInput): Promise<WhopCheckout> {
  const res = await fetch(`${whopApiBase()}/plans`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.WHOP_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_id: process.env.WHOP_COMPANY_ID,
      product_id: process.env.WHOP_PRODUCT_ID,
      plan_type: "one_time",
      release_method: "buy_now",
      currency: whopCurrency(),
      initial_price: input.amountMajor,
      renewal_price: 0,
      title: input.title,
      description: input.description,
      metadata: input.metadata,
      ...(process.env.WHOP_ADAPTIVE_PRICING === "true" ? { adaptive_pricing_enabled: true } : {}),
    }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as
    | { id?: string; purchase_url?: string; currency?: string; message?: string; error?: string }
    | null;

  if (!res.ok || !body?.purchase_url) {
    const detail = body?.message ?? body?.error ?? `HTTP ${res.status}`;
    throw new Error(`Whop plan creation failed: ${detail}`);
  }

  const planId = body.id ?? "";
  const currency = (body.currency ?? whopCurrency()).toLowerCase();

  // A plan checkout finishes on Whop's own receipt page; wrap it in a checkout
  // configuration so the buyer comes back to mymap.lol after paying.
  try {
    const config = await createWhopCheckoutConfig({
      planId,
      redirectUrl: whopReturnUrl(),
      metadata: input.metadata,
    });
    return {
      planId,
      purchaseUrl: config.purchase_url as string,
      checkoutConfigId: config.id ?? "",
      currency,
    };
  } catch (err) {
    // Never lose the sale over the redirect: the plan's own checkout still works.
    console.warn("[whop] checkout configuration unavailable — using the plan checkout:", err);
  }

  return {
    planId,
    purchaseUrl: body.purchase_url,
    checkoutConfigId: "",
    currency,
  };
}

export interface WhopCheckoutConfig {
  id?: string;
  purchase_url?: string;
  redirect_url?: string;
  message?: string;
  error?: string;
}

/**
 * Wrap the plan in a checkout configuration that returns the buyer to our site.
 *
 * The plan's own `purchase_url` finishes on Whop's `/joined/…` receipt page; a
 * configuration's `purchase_url` (`/checkout/ch_…/`) sends the buyer to
 * `redirect_url` instead. Metadata rides along too, so a payment event still
 * carries `claim_id` even if the plan metadata ever comes back empty.
 *
 * Trap: this endpoint takes `plan_id` only — sending `account_id` fails with
 * "Cannot provide company_id for this configuration".
 */
export async function createWhopCheckoutConfig(input: {
  planId: string;
  redirectUrl: string;
  metadata: Record<string, string>;
}): Promise<WhopCheckoutConfig> {
  const res = await fetch(`${whopApiBase()}/checkout_configurations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.WHOP_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      plan_id: input.planId,
      redirect_url: input.redirectUrl,
      metadata: input.metadata,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as WhopCheckoutConfig | null;
  if (!res.ok || !body?.purchase_url) {
    throw new Error(
      `Whop checkout configuration failed: ${body?.message ?? body?.error ?? `HTTP ${res.status}`}`,
    );
  }
  return body;
}

/* ------------------------------------------------------------------ webhooks */

export interface WhopEvent {
  id?: string;
  type?: string;
  api_version?: string;
  account_id?: string;
  company_id?: string;
  timestamp?: string;
  data?: Record<string, unknown> & {
    id?: string;
    metadata?: Record<string, string> | null;
    plan?: { id?: string; metadata?: Record<string, string> | null } | null;
  };
}

type VerifyResult = { ok: true; event: WhopEvent } | { ok: false; reason: string };

/** Candidate HMAC keys: the raw secret, or the base64 part after a `ws_`/`whsec_` prefix. */
function secretCandidates(): Buffer[] {
  const secret = process.env.WHOP_WEBHOOK_SECRET ?? "";
  if (!secret) return [];
  const out = [Buffer.from(secret, "utf8")];
  const m = /^(?:ws|whsec|whop)_(.+)$/.exec(secret);
  if (m) {
    try {
      out.push(Buffer.from(m[1], "base64"));
    } catch {
      /* not base64 — the raw form is the only candidate */
    }
  }
  return out;
}

const safeEqual = (sigB64: string, digest: Buffer) => {
  const sig = Buffer.from(sigB64, "base64");
  return sig.length === digest.length && timingSafeEqual(sig, digest);
};

/**
 * Verify a Standard Webhooks request: HMAC-SHA256 over
 * `{webhook-id}.{webhook-timestamp}.{raw body}`, base64, inside `v1,…`.
 * Rejects anything older than 5 minutes so a captured request can't be replayed.
 */
export function verifyWhopWebhook(rawBody: string, headers: Headers): VerifyResult {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return { ok: false, reason: "missing webhook headers" };

  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "timestamp outside tolerance" };

  const keys = secretCandidates();
  if (keys.length === 0) return { ok: false, reason: "no webhook secret configured" };

  const signed = `${id}.${ts}.${rawBody}`;
  const signatures = sigHeader
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice(3));

  const match = keys.some((key) => {
    const expected = createHmac("sha256", key).update(signed, "utf8").digest();
    return signatures.some((sig) => safeEqual(sig, expected));
  });

  if (!match) return { ok: false, reason: "signature mismatch" };

  try {
    return { ok: true, event: JSON.parse(rawBody) as WhopEvent };
  } catch {
    return { ok: false, reason: "body is not JSON" };
  }
}

/** Claim id we attached at checkout time, whichever place Whop echoed it back in. */
export function claimIdFromEvent(event: WhopEvent): string | null {
  const meta = event.data?.metadata ?? event.data?.plan?.metadata ?? null;
  const id = meta?.claim_id;
  return typeof id === "string" && id ? id : null;
}

export function planIdFromEvent(event: WhopEvent): string | null {
  const plan = event.data?.plan?.id;
  return typeof plan === "string" && plan ? plan : null;
}
