# mymap.lol — own the Malaysia map

A public, interactive map of Malaysia's 16 divisions (13 states + 3 federal
territories) where **organizations claim and stake states**. Every state is an
open leaderboard ranked by **total stake**. Claim an open state, stake to climb,
and top up the difference to take the #1 spot.

> Built as a Malaysia take on worldmap.lol. Same mechanic, Malaysia map.

---

## How it works

1. **Claim your flag** — plant your organization on any open state from a small
   fee. Your card (name, pitch, link) holds the spot.
2. **Or stake a single city** — a city stake is recorded against that city only:
   it shows in the Cities panel (with your name and link) and never claims the
   state around it. Visitors can add a city that isn't in the catalogue.
3. **Stake to climb** — your rank is your total stake on that state or city.
   Out-stake the current #1 to take the top spot.
4. **Reclaim anytime** — get passed? Just top up the difference. Your past stake
   still counts, so nothing is wasted.

Every state is **white until it is taken** — white reads as "open for claiming".
Once a state is claimed it takes its own colour (each state has a different hue,
deeper and more saturated the more has been staked on it), so a coloured state is
an owned one and no two owned states look alike. Hover shows the tooltip; click a
state on the map, a chip, a city in the panel, or a World Order row to open its
leaderboard + stake form. City pins on the map turn dark once a city is held.

## Making money (the model)

Every payment is **revenue** — it's an ad buy, not a bet. There is no payout, no
bet, no "loser". You keep what you charge:

- `minClaim` — the floor to claim an open state (default **$10**).
- Stake/top-up amounts — the amount an org pays to hold or take the top spot.
- Add a `fee` (in `src/lib/states.ts`) if you want a **platform cut** on top.

Your daily/weekly revenue = the sum of every claim + top-up payment. Tune
`minClaim` / `fee` up to capture more; keep them low to drive volume.

The mechanic is already live in **demo mode** (browser-local state + fake
checkout), so the whole funnel works end-to-end today. See below to flip it to
real money + a shared leaderboard.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

## Going live

### 1. Real payments — Whop (worldmap.lol's flow)

The stake modal hands the buyer to Whop's hosted checkout ("Opening secure
checkout…"): the server parks the stake as `pending`, creates a one-time Whop
plan for exactly that amount, and the buyer pays on Whop's page. Whop is the
merchant of record (cards, Apple/Google Pay, GrabPay, crypto), and its webhook
is what flips the claim to `paid`.

```bash
# .env.local  (never commit real values)
NEXT_PUBLIC_PAYMENT_MODE=live
WHOP_API_KEY=            # Dashboard > Settings > API keys (account key)
WHOP_COMPANY_ID=biz_     # the account the money lands in
WHOP_PRODUCT_ID=prod_    # the product the per-stake plans hang off
WHOP_CURRENCY=usd        # plan currency — usd charges the card in dollars
WHOP_USD_MYR=4.04        # display-only rate for the "≈ RM…" next to every price
WHOP_ADAPTIVE_PRICING=false  # true → Whop shows the buyer's local currency
WHOP_WEBHOOK_SECRET=ws_  # verifies inbound webhooks (Standard Webhooks HMAC)
WHOP_SANDBOX=true        # optional: hit sandbox-api.whop.com while testing
WHOP_SUPPORT_EMAIL=      # optional: shown on the checkout ("contact … first")
```

**Currency:** the site quotes dollars and shows the ringgit equivalent next to
every price (`$10 ≈ RM40`, `NEXT_PUBLIC_USD_MYR`). The plan is created in **USD**,
so the buyer's card is charged US dollars — the RM figure is a conversion shown
for local shoppers, not a charge. (Worldmap.lol does the same: "payments are
whole US dollars".) Setting `WHOP_CURRENCY=myr` instead charges ringgit at
`WHOP_USD_MYR` if that's ever wanted.

Point a Whop webhook at `https://www.mymap.lol/api/whop/webhook` for
`payment.succeeded` (+ `payment.failed`), and paste its signing secret into
`WHOP_WEBHOOK_SECRET`. Verification lives in `src/lib/payments/whop.ts`
(`verifyWhopWebhook`): HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{body}`,
base64, 5-minute tolerance. The claim is matched by the `claim_id` metadata
stamped on the plan (falling back to the plan id stored on the pending row).

Demo mode (`NEXT_PUBLIC_PAYMENT_MODE` unset) still simulates the payment so the
whole funnel works without any keys.

### 2. Shared, multi-user leaderboard (Supabase) — Phase 1, DONE in code

The board is now server-backed by default, with a browser-local fallback so the
product keeps working before/without a Supabase project:

- **Unconfigured** → `/api/board` answers `{mode:"demo"}`, the client store keeps
  using localStorage, and `/api/stake` returns 503 (nothing pretends to be shared).
- **Configured** → `/api/board` returns the shared snapshot, the client polls it
  (15s, and on tab focus) and stakes write through `/api/stake`.

To switch it on:

1. Create a Supabase project (any region close to Malaysia, e.g. Singapore).
2. SQL Editor → paste `supabase/schema.sql` → Run. It creates `states`, `claims`,
   `stake_events`, the views (`state_holders`, `state_totals`, `recent_activity`,
   `top_orgs`) and lock RLS down with no policies — only the service role (our
   server routes) can read or write. The browser never talks to Supabase.
3. Vercel → Project Settings → Environment Variables (and `.env.local` for dev):

   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key — server only>
   IP_SALT=<any long random string>
   NEXT_PUBLIC_USD_MYR=4.04
   ```

4. Redeploy. The stats pill switches from "demo board" to "shared board" and
   every visitor now sees the same map.

API surface: `GET /api/board` (shared snapshot), `POST /api/stake` (validated,
rate-limited per hashed IP, writes a `paid` claim in demo payment mode).

### 3. Deploy

This is a standard Next.js (App Router) app:

1. Push to a **new** GitHub repo (own repo + own deploy, per convention).
2. In Vercel: **Add New → Project → Import** the repo. It auto-detects Next.js.
3. Set the env vars above in the Vercel project's **Project Settings → Environment
   Variables**.
4. Every push to `main` auto-deploys.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript · d3-geo (Mercator
projection, computed from raw projected points so simplified near-equator rings
render correctly).

Map data: Malaysia state boundaries (slimmed + winding-normalized to ~22 KB).
