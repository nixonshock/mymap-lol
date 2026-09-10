-- mymap.lol — shared leaderboard schema (Supabase / Postgres)
-- Run this whole file in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent, and the ALTER lines upgrade a
-- database created before city stakes existed.
--
-- Two kinds of stake share the `claims` table:
--   • state stakes — city_id is null. They colour the state and drive the
--     state leaderboards + World Order.
--   • city stakes  — city_id is set ("my-06:kuantan"). They belong to that city
--     only: the state views below filter them out, so a city stake never claims
--     the surrounding state.
--
-- Security model: row level security is ON and there are NO policies, so the
-- public anon/authenticated keys can read nothing and write nothing. Only the
-- service-role key (server-only, used by our /api routes) can touch these tables.
-- The browser never talks to Supabase directly.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- states
create table if not exists states (
  code        text primary key,                       -- ISO 3166-2, e.g. 'MY-10'
  name        text not null,
  ordinal     int  not null default 0,                -- display order 1..16
  total_cents bigint not null default 0,              -- kept in sync by trigger
  top_org     text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- claims
-- One row per payment attempt. `amount_cents` is an integer (no floats).
create table if not exists claims (
  id              uuid primary key default gen_random_uuid(),
  state_code      text not null references states(code) on delete cascade,
  city_id         text,                               -- "<state>:<slug>" when the stake is for a city
  city_name       text,                               -- display name that travels with the claim
  org_name        text not null check (char_length(org_name) between 2 and 60),
  pitch           text not null default '' check (char_length(pitch) <= 140),
  link            text check (link is null or link = '' or link ~* '^https?://'),
  amount_cents    bigint not null check (amount_cents > 0),
  currency        text not null default 'USD',
  status          text not null default 'pending'
                    check (status in ('pending','paid','expired','refunded')),
  provider        text,                               -- stripe | lnbits | demo | ...
  tx_id           text,                               -- provider charge / payment hash
  org_email       text,                               -- receipt + contact
  edit_token_hash text,                               -- sha256 of the private edit link
  ip_hash         text,                               -- abuse control (never the raw IP)
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);

-- Upgrade path for databases created before city stakes:
alter table claims add column if not exists city_id   text;
alter table claims add column if not exists city_name text;

create index if not exists claims_state_idx  on claims(state_code);
create index if not exists claims_city_idx   on claims(city_id);
create index if not exists claims_org_idx    on claims(org_name);
create index if not exists claims_paid_idx   on claims(status, created_at desc);
create index if not exists claims_txid_idx   on claims(provider, tx_id);

-- ---------------------------------------------------------------- rate limiting
create table if not exists stake_events (
  id         bigserial primary key,
  ip_hash    text not null,
  kind       text not null default 'stake',
  created_at timestamptz not null default now()
);
create index if not exists stake_events_ip_idx on stake_events(ip_hash, created_at desc);

-- ---------------------------------------------------------------- state views
-- Per-org totals inside a state (the per-state leaderboard). City stakes are
-- excluded: they never claim the state.
create or replace view state_holders as
select
  c.state_code,
  c.org_name,
  sum(c.amount_cents)::bigint as total_cents,
  count(*)::int               as claims,
  (array_agg(c.pitch order by c.created_at desc))[1] as pitch,
  (array_agg(c.link  order by c.created_at desc))[1] as link
from claims c
where c.status = 'paid' and c.city_id is null
group by c.state_code, c.org_name;

-- One row per state with its live totals + current leader.
create or replace view state_totals as
select
  s.code,
  s.name,
  s.ordinal,
  coalesce(sum(c.amount_cents) filter (where c.status = 'paid' and c.city_id is null), 0)::bigint as total_cents,
  count(c.id) filter (where c.status = 'paid' and c.city_id is null)::int                        as claims,
  (select h.org_name from state_holders h
    where h.state_code = s.code order by h.total_cents desc limit 1)                             as top_org
from states s
left join claims c on c.state_code = s.code
group by s.code, s.name, s.ordinal;

-- Live activity feed (most recent paid stakes, state and city alike).
create or replace view recent_activity as
select
  c.state_code, s.name as state_name, c.org_name,
  c.amount_cents, c.created_at,
  c.city_id, c.city_name
from claims c
join states s on s.code = c.state_code
where c.status = 'paid'
order by c.created_at desc
limit 200;

-- Organizations ranked across every territory (the "board" modal).
create or replace view top_orgs as
select
  org_name,
  sum(amount_cents)::bigint                      as total_cents,
  count(distinct coalesce(city_id, state_code))::int as states
from claims
where status = 'paid'
group by org_name
order by total_cents desc
limit 100;

-- ---------------------------------------------------------------- city views
-- Per-org totals inside one city (the per-city leaderboard).
create or replace view city_holders as
select
  c.city_id,
  c.org_name,
  sum(c.amount_cents)::bigint as total_cents,
  count(*)::int               as claims,
  (array_agg(c.pitch order by c.created_at desc))[1] as pitch,
  (array_agg(c.link  order by c.created_at desc))[1] as link
from claims c
where c.status = 'paid' and c.city_id is not null
group by c.city_id, c.org_name;

-- One row per staked city with its totals + current leader.
create or replace view city_totals as
select
  c.city_id                                                     as id,
  (array_agg(c.city_name order by c.created_at desc))[1]        as name,
  c.state_code,
  s.name                                                        as state_name,
  sum(c.amount_cents)::bigint                                   as total_cents,
  count(*)::int                                                 as claims,
  (select h.org_name from city_holders h
    where h.city_id = c.city_id order by h.total_cents desc limit 1) as top_org
from claims c
join states s on s.code = c.state_code
where c.status = 'paid' and c.city_id is not null
group by c.city_id, c.state_code, s.name;

-- ---------------------------------------------------------------- trigger
-- Keep states.total_cents / top_org in sync so a future direct-read path
-- (map colours) never disagrees with the views above. State stakes only.
create or replace function refresh_state_totals(p_state text)
returns void language plpgsql as $$
begin
  update states s
  set total_cents = coalesce((
        select sum(amount_cents) from claims c
        where c.state_code = p_state and c.status = 'paid' and c.city_id is null), 0),
      top_org = (
        select org_name from claims c
        where c.state_code = p_state and c.status = 'paid' and c.city_id is null
        group by org_name order by sum(amount_cents) desc limit 1),
      updated_at = now()
  where s.code = p_state;
end $$;

create or replace function claim_trigger() returns trigger language plpgsql as $$
begin
  perform refresh_state_totals(coalesce(new.state_code, old.state_code));
  return new;
end $$;

drop trigger if exists claims_refresh on claims;
create trigger claims_refresh
  after insert or update or delete on claims
  for each row execute function claim_trigger();

-- ---------------------------------------------------------------- seed
insert into states (code, name, ordinal) values
 ('MY-01','Johor',1),('MY-02','Kedah',2),('MY-03','Kelantan',3),('MY-04','Melaka',4),
 ('MY-05','Negeri Sembilan',5),('MY-06','Pahang',6),('MY-07','Penang',7),('MY-08','Perak',8),
 ('MY-09','Perlis',9),('MY-10','Selangor',10),('MY-11','Terengganu',11),('MY-12','Sabah',12),
 ('MY-13','Sarawak',13),('MY-14','Kuala Lumpur',14),('MY-15','Labuan',15),('MY-16','Putrajaya',16)
on conflict (code) do update set name = excluded.name, ordinal = excluded.ordinal;

-- ---------------------------------------------------------------- lock down
alter table states       enable row level security;
alter table claims       enable row level security;
alter table stake_events enable row level security;
-- Intentionally no policies: anon/authenticated get nothing. The service role
-- bypasses RLS, so our server routes keep full access.
