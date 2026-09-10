-- Migration 002 — city stakes (mymap.lol)
--
-- Run this if your Supabase project was created with the earlier schema
-- (state stakes only). A fresh project can just run supabase/schema.sql, which
-- already contains everything here.
--
-- Safe to re-run. City stakes are stored with city_id set and are excluded from
-- the state views, so staking a city never claims the surrounding state.

alter table claims add column if not exists city_id   text;
alter table claims add column if not exists city_name text;
create index if not exists claims_city_idx on claims(city_id);

-- Dropped rather than replaced: the state views change their WHERE clause and
-- recent_activity gains columns, which CREATE OR REPLACE cannot always do.
drop view if exists city_totals;
drop view if exists city_holders;
drop view if exists state_holders;
drop view if exists state_totals;
drop view if exists recent_activity;
drop view if exists top_orgs;

create view state_holders as
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

create view state_totals as
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

create view recent_activity as
select
  c.state_code, s.name as state_name, c.org_name,
  c.amount_cents, c.created_at,
  c.city_id, c.city_name
from claims c
join states s on s.code = c.state_code
where c.status = 'paid'
order by c.created_at desc
limit 200;

create view top_orgs as
select
  org_name,
  sum(amount_cents)::bigint                          as total_cents,
  count(distinct coalesce(city_id, state_code))::int as states
from claims
where status = 'paid'
group by org_name
order by total_cents desc
limit 100;

create view city_holders as
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

create view city_totals as
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

-- Refresh the cached per-state totals (the trigger keeps them current from here on).
select refresh_state_totals(code) from states;
