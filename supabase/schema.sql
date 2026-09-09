-- mymap.lol — shared leaderboard schema (Supabase / Postgres)
-- Run in your Supabase project SQL editor. Enables a real multi-user map.

create extension if not exists "pgcrypto";

-- The 16 Malaysian divisions (seed populated below).
create table if not exists states (
  code      text primary key,          -- ISO 3166-2, e.g. 'MY-10'
  name      text not null,
  total_stake bigint not null default 0,
  top_org   text,
  updated_at timestamptz not null default now()
);

-- Every stake an organization places on a state.
create table if not exists claims (
  id          uuid primary key default gen_random_uuid(),
  state_code  text not null references states(code),
  org_name    text not null,
  pitch       text,
  link        text,
  amount      bigint not null,          -- stake units (dollars or sats)
  status      text not null default 'pending',  -- pending | paid | expired
  tx_id       text,
  created_at  timestamptz not null default now()
);

create index if not exists claims_state_idx on claims(state_code);
create index if not exists claims_org_idx on claims(org_name);

-- Helper: recalculate a state's total from its paid claims.
create or replace function refresh_state_totals(p_state text)
returns void language plpgsql as $$
begin
  update states s
  set total_stake = coalesce((select sum(amount) from claims c
                              where c.state_code = p_state and c.status='paid'),0),
      top_org     = (select org_name from claims c
                     where c.state_code = p_state and c.status='paid'
                     group by c.org_name order by sum(amount) desc limit 1),
      updated_at  = now()
  where s.code = p_state;
end $$;

-- Seed the 16 divisions.
insert into states (code, name) values
 ('MY-01','Johor'),('MY-02','Kedah'),('MY-03','Kelantan'),('MY-04','Melaka'),
 ('MY-05','Negeri Sembilan'),('MY-06','Pahang'),('MY-07','Penang'),('MY-08','Perak'),
 ('MY-09','Perlis'),('MY-10','Selangor'),('MY-11','Terengganu'),('MY-12','Sabah'),
 ('MY-13','Sarawak'),('MY-14','Kuala Lumpur'),('MY-15','Labuan'),('MY-16','Putrajaya')
on conflict (code) do nothing;

-- Trigger to refresh totals after each claim write.
create or replace function claim_trigger() returns trigger language plpgsql as $$
begin
  refresh_state_totals(coalesce(new.state_code, old.state_code));
  return new;
end $$;

drop trigger if exists claims_refresh on claims;
create trigger claims_refresh
  after insert or update or delete on claims
  for each row execute function claim_trigger();
