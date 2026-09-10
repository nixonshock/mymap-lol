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

`Total staked` per state drives the colour: every state has its own hue (open
states are pale, staked ones go deep and saturated). Hover shows the tooltip;
click a state on the map, a chip, a city in the panel, or a World Order row to
open its leaderboard + stake form. City pins on the map turn dark once a city is
held.

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

### 1. Real payments

The checkout is abstracted in `src/lib/checkout.ts`. In demo mode it simulates a
successful payment. To charge real money:

```bash
# .env.local
NEXT_PUBLIC_PAYMENT_MODE=live
NEXT_PUBLIC_PAYMENT_PROVIDER=whop | lnbits | stripe
# provider env vars (e.g. LNbits URL + admin key, Whop API key, Stripe keys)
```

Wire the provider call in `src/lib/checkout.ts` -> `providerCheckout()` (or add
`src/lib/payments/<provider>.ts`), and add the payment webhook that credits the
claim on confirmation. **Never commit real keys** — they come from the
environment / Vercel project settings.

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
