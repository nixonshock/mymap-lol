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
2. **Stake to climb** — your rank is your total stake on that state. Out-stake
   the current #1 to take the top spot.
3. **Reclaim anytime** — get passed? Just top up the difference. Your past stake
   still counts, so nothing is wasted.

`Total staked` per state drives the color (empty = slate, claimed = green,
deeper green = larger stake). Hover shows the tooltip; click a state on the map
or a chip to open its leaderboard + claim form.

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

### 2. Shared, multi-user leaderboard (Supabase)

Today the leaderboard is browser-local (localStorage), so each visitor sees their
own world. To make it a real shared map:

- Run `supabase/schema.sql` in a Supabase project.
- Swap the `localStorage` adapter in `src/lib/store.ts` for the Supabase adapter
  (points at `states`, `claims` tables; server route or the supabase client).

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
