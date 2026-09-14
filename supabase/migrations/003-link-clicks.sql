-- ---------------------------------------------------------------------------
-- Link clicks: how often a listing's outbound link is actually opened.
--
-- The point is the bidder's side of the deal: they paid to be on the map, so
-- the profile page shows them how many visitors tapped through to their site.
-- One row per click — the profile reads the totals from the view below.
--
-- Written only by /api/click with the service-role key (RLS is on with no
-- policies, like every other table here). Raw IPs are never stored: only a
-- salted hash, so repeat visitors can be counted without identifying anyone.
-- ---------------------------------------------------------------------------

create table if not exists link_clicks (
  id         bigserial primary key,
  -- the listing the click belongs to: the same slug /pin/<slug> uses
  slug       text        not null,
  org_name   text,
  link       text,
  -- which surface the click came from: profile | card | map | cities
  source     text,
  ip_hash    text,
  created_at timestamptz not null default now()
);

create index if not exists link_clicks_slug_idx on link_clicks (slug, created_at desc);

create or replace view link_click_totals as
  select
    slug,
    count(*)::bigint                                                        as clicks,
    count(*) filter (where created_at > now() - interval '7 days')::bigint   as clicks_7d,
    count(distinct ip_hash)::bigint                                         as visitors,
    max(created_at)                                                         as last_click_at
  from link_clicks
  group by slug;

alter table link_clicks enable row level security;
