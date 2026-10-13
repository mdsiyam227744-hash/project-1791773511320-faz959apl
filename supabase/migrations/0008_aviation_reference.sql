-- ============================================================================
-- 0008_aviation_reference.sql — aviation & fare reference data foundation
--   1. airports: provenance + verification columns (source id, region,
--      scheduled_service, links, dataset version, verification state, merge).
--   2. airlines — carrier records with code + source + verification status.
--   3. airline_routes — airport-to-airport route records; never inferred from
--      airport existence; each row carries evidence and a verification state.
--   4. fare_observations — admin-maintained INDICATIVE fare references with
--      full provenance and automatic staleness labelling.
--   5. service_corridors — admin-controlled corridor enablement.
--   6. preferred_airports — admin-configured default airports per country/city.
--   7. visa_packages — per-destination/category/tier packages with the
--      government-fee vs service-fee split (never merged into one price).
--   8. airport_distance_cache — cached on-demand great-circle distances.
--   9. import_batches — airport CSV import provenance + rejected rows.
-- All statements idempotent; dollar-quote tags named ($do$, $fn$).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. airports — provenance + verification columns
-- ---------------------------------------------------------------------------
do $do$ begin
  alter table public.airports add column source_ident text;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column iso_region text;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column scheduled_service text;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column home_link text;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column wikipedia_link text;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column keywords text;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column data_source text not null default 'ourairports';
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column dataset_version text;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column verification_status text not null default 'unverified'
    check (verification_status in ('unverified','verified','rejected'));
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column verified_at timestamptz;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column verified_by uuid references public.staff(id) on delete set null;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column data_quality_note text;
exception when duplicate_column then null; end $do$;

do $do$ begin
  alter table public.airports add column duplicate_of uuid references public.airports(id) on delete set null;
exception when duplicate_column then null; end $do$;

-- An admin-verified row keeps its verification data even when a later import
-- or partial form leaves those columns null (the seed upsert never touches
-- them at all; this is the in-database backstop).
create or replace function public.airports_guard_verification() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.verification_status = 'verified' and old.verification_status = 'verified' then
    if new.verified_at is null then new.verified_at := old.verified_at; end if;
    if new.verified_by is null then new.verified_by := old.verified_by; end if;
  end if;
  return new;
end $fn$;

do $do$ begin
  drop trigger if exists trg_airports_guard on public.airports;
  create trigger trg_airports_guard before update on public.airports
    for each row execute function public.airports_guard_verification();
exception when duplicate_object then null; end $do$;


create index if not exists idx_airports_verification on public.airports(verification_status) where verification_status <> 'verified';
create index if not exists idx_airports_country_active on public.airports(iso_country, active);

-- ---------------------------------------------------------------------------
-- 2. airlines
-- ---------------------------------------------------------------------------
create table if not exists public.airlines (
  id uuid primary key default gen_random_uuid(),
  iata_code char(2),                      -- null when the carrier has none
  icao_code char(3),
  name text not null,
  country_code char(2),
  active boolean not null default true,   -- operating / defunct flag
  source text not null default 'manual_entry',
  source_url text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','verified','rejected')),
  verified_at timestamptz,
  verified_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_airlines_iata on public.airlines(iata_code) where iata_code is not null;
create index if not exists idx_airlines_name on public.airlines(name);

-- ---------------------------------------------------------------------------
-- 3. airline routes — evidence-based, never inferred
-- ---------------------------------------------------------------------------
create table if not exists public.airline_routes (
  id uuid primary key default gen_random_uuid(),
  origin_airport_id uuid not null references public.airports(id) on delete cascade,
  destination_airport_id uuid not null references public.airports(id) on delete cascade,
  airline_id uuid references public.airlines(id) on delete set null,
  flight_no text,                          -- only when a real, sourced number exists
  route_class text not null default 'direct'
    check (route_class in ('direct','connecting')),
  operating_status text not null default 'unverified'
    check (operating_status in ('unverified','current','seasonal','suspended','discontinued')),
  valid_from date,
  valid_to date,
  operating_days text,                     -- only from a sourced schedule; free text
  evidence_source text not null,           -- URL or named authority — required
  evidence_note text,
  verified_by uuid references public.staff(id) on delete set null,
  verified_at timestamptz,
  created_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airline_routes_no_self_route check (origin_airport_id <> destination_airport_id)
);
create index if not exists idx_routes_origin on public.airline_routes(origin_airport_id);
create index if not exists idx_routes_dest on public.airline_routes(destination_airport_id);
create index if not exists idx_routes_status on public.airline_routes(operating_status);

-- A route may only become 'current'/'seasonal' through explicit verification.
create or replace function public.route_guard_verification() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.operating_status in ('current','seasonal') and old.operating_status = 'unverified'
     and new.verified_at is null and new.verified_by is null then
    raise exception 'Route must record verified_by and verified_at to become %', new.operating_status
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

do $do$ begin
  drop trigger if exists trg_route_guard on public.airline_routes;
  create trigger trg_route_guard before update on public.airline_routes
    for each row execute function public.route_guard_verification();
exception when duplicate_object then null; end $do$;

-- ---------------------------------------------------------------------------
-- 4. fare observations — indicative references, never live fares
-- ---------------------------------------------------------------------------
create table if not exists public.fare_observations (
  id uuid primary key default gen_random_uuid(),
  origin_airport_id uuid not null references public.airports(id) on delete cascade,
  destination_airport_id uuid not null references public.airports(id) on delete cascade,
  airline_id uuid references public.airlines(id) on delete set null,
  trip_type text not null check (trip_type in ('one_way','return')),
  cabin_class text not null default 'economy'
    check (cabin_class in ('economy','premium_economy','business','first')),
  travel_date_from date not null,
  travel_date_to date,
  passengers integer not null default 1 check (passengers between 1 and 9),
  observed_price numeric(12,2) not null check (observed_price >= 0),
  taxes_included boolean not null default false,
  baggage_note text,
  currency char(3) not null,
  journey_type text not null default 'direct'
    check (journey_type in ('direct','connecting','unspecified')),
  source_url text not null,
  observation_date date not null,
  valid_until date,                        -- null = no stated expiry (still date-gated)
  verification_status text not null default 'draft'
    check (verification_status in ('draft','pending_review','published','rejected','expired','withdrawn')),
  reviewed_by uuid references public.staff(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid not null references public.staff(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fare_observation_dates check (
    travel_date_to is null or travel_date_to >= travel_date_from
  )
);
create index if not exists idx_fare_obs_pair on public.fare_observations(origin_airport_id, destination_airport_id);
create index if not exists idx_fare_obs_status on public.fare_observations(verification_status);

-- ---------------------------------------------------------------------------
-- 5. service corridors — admin-controlled enablement
-- ---------------------------------------------------------------------------
create table if not exists public.service_corridors (
  id uuid primary key default gen_random_uuid(),
  origin_country_id uuid not null references public.countries(id) on delete cascade,
  destination_country_id uuid not null references public.countries(id) on delete cascade,
  enabled boolean not null default false,
  note text,
  configured_by uuid references public.staff(id) on delete set null,
  configured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corridor_not_self check (origin_country_id <> destination_country_id),
  constraint corridor_unique_pair unique (origin_country_id, destination_country_id)
);

-- ---------------------------------------------------------------------------
-- 6. preferred airports — admin-configured defaults per country (or city)
-- ---------------------------------------------------------------------------
create table if not exists public.preferred_airports (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null,
  city_municipality text,
  airport_id uuid not null references public.airports(id) on delete cascade,
  configured_by uuid references public.staff(id) on delete set null,
  configured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- one default per country, or per country+city when city is set
  constraint preferred_airports_scope unique (country_code, city_municipality)
);

-- ---------------------------------------------------------------------------
-- 7. visa packages — DB-backed, admin-priced
-- ---------------------------------------------------------------------------
create table if not exists public.visa_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_bn text,
  description_en text,
  description_bn text,
  visa_listing_id uuid references public.visa_listings(id) on delete cascade,
  destination_country_id uuid not null references public.countries(id) on delete restrict,
  origin_country_id uuid references public.countries(id) on delete restrict,
  category_code text not null,
  constraint visa_packages_category_fk foreign key (category_code) references public.visa_categories(code),
  tier text not null default 'standard' check (tier in ('basic','standard','premium')),
  included_services_en text,
  included_services_bn text,
  excluded_services_en text,
  excluded_services_bn text,
  required_documents_en text,
  required_documents_bn text,
  official_gov_fee_amount numeric(12,2),
  official_gov_fee_currency char(3),
  official_gov_fee_verified boolean not null default false,
  official_gov_fee_source_url text,
  third_party_costs_en text,
  third_party_costs_bn text,
  service_fee_amount numeric(12,2) not null default 0 check (service_fee_amount >= 0),
  service_fee_currency char(3) not null,
  tax_note text,
  timeline_en text,                        -- OUR service timeline, never the visa decision time
  timeline_bn text,
  refund_terms_en text,
  refund_terms_bn text,
  eligibility_note_en text,
  eligibility_note_bn text,
  status content_status not null default 'draft',
  effective_from date,
  effective_to date,
  last_verified date,
  verified_by uuid references public.staff(id) on delete set null,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_visa_packages_dest on public.visa_packages(destination_country_id, category_code, status);
create index if not exists idx_visa_packages_listing on public.visa_packages(visa_listing_id);

-- ---------------------------------------------------------------------------
-- 8. airport distance cache — on-demand, symmetric by construction
-- ---------------------------------------------------------------------------
create table if not exists public.airport_distance_cache (
  id uuid primary key default gen_random_uuid(),
  origin_airport_id uuid not null references public.airports(id) on delete cascade,
  destination_airport_id uuid not null references public.airports(id) on delete cascade,
  distance_km numeric(12,3) not null check (distance_km >= 0),
  method text not null default 'haversine',
  method_version text not null default '1',
  earth_radius_km numeric(8,3) not null default 6371.0088,
  calculated_at timestamptz not null default now(),
  -- Canonical orientation (lexicographically smaller id = origin) keeps the
  -- cache free of mirrored duplicates and makes A→B and B→A one row.
  constraint distance_cache_canonical_pair unique (origin_airport_id, destination_airport_id)
);

-- ---------------------------------------------------------------------------
-- 9. airport import batches — provenance + rejected rows
-- ---------------------------------------------------------------------------
create table if not exists public.airport_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  imported_by uuid not null references public.staff(id) on delete restrict,
  rows_total integer not null default 0,
  rows_inserted integer not null default 0,
  rows_updated integer not null default 0,
  rows_rejected integer not null default 0,
  rejected_sample jsonb not null default '[]'::jsonb,
  conflict_policy text not null default 'preserve_verified'
    check (conflict_policy in ('preserve_verified','replace_all')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS — enable + policies, mirroring 0002/0004 style
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array[
    'airlines','airline_routes','fare_observations','service_corridors',
    'preferred_airports','visa_packages','airport_distance_cache','airport_import_batches'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $do$;

-- Public reads: only approval states the mission allows to be public.
do $do$ begin
  create policy airports_verification_read on public.airports for select
    using (true); -- column-level visibility is enforced by views/queries; row readable
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy airlines_public_read on public.airlines for select
    using (verification_status = 'verified' and active or public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy routes_public_read on public.airline_routes for select
    using (operating_status in ('current','seasonal') or public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy fare_obs_public_read on public.fare_observations for select
    using (verification_status = 'published' or public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy corridors_public_read on public.service_corridors for select
    using (enabled or public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy preferred_airports_public_read on public.preferred_airports for select using (true);
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy visa_packages_public_read on public.visa_packages for select
    using (status = 'published' or public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy distance_cache_read on public.airport_distance_cache for select using (true);
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy import_batches_staff_read on public.airport_import_batches for select
    using (public.is_staff());
exception when duplicate_object then null; end $do$;

-- Staff-only writes on the new reference tables.
do $do$
declare t text; pol text;
begin
  foreach t in array array[
    'airlines','airline_routes','fare_observations','service_corridors',
    'preferred_airports','visa_packages','airport_import_batches'
  ] loop
    pol := t || '_staff_all';
    if public._policy_absent(t, pol) then
      execute format(
        'create policy %I on public.%I for all to authenticated
         using (public.is_staff()) with check (public.is_staff())', pol, t);
    end if;
  end loop;
end $do$;

-- -----------------------------------------------------------------------
-- Fare-observation review integrity (mirrors 0005's payment-submission
-- trigger): a review decision must carry the reviewer identity; only staff
-- may move a row through review; expiry is automatic, not opinion.
-- -----------------------------------------------------------------------
create or replace function public.fare_observation_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- lifecycle: draft -> pending_review -> published | rejected | withdrawn
  if old.verification_status not in ('draft','pending_review')
     and new.verification_status in ('draft','pending_review') then
    raise exception 'A decided fare observation cannot re-enter the draft/review state'
      using errcode = 'check_violation';
  end if;
  if new.verification_status in ('published','rejected','withdrawn')
     and new.verification_status <> old.verification_status then
    if new.reviewed_by is null or new.reviewed_at is null then
      raise exception 'A review decision must record reviewed_by and reviewed_at'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $fn$;

do $do$ begin
  drop trigger if exists trg_fare_observation_guard on public.fare_observations;
  create trigger trg_fare_observation_guard before update on public.fare_observations
    for each row execute function public.fare_observation_guard();
exception when duplicate_object then null; end $do$;

-- Automatic staleness: published observations older than their validity or
-- 90 days become 'expired' without anyone touching them.
create or replace function public.expire_stale_fare_observations() returns integer
language plpgsql security definer set search_path = public as $fn$
declare changed integer;
begin
  update public.fare_observations
     set verification_status = 'expired'
   where verification_status = 'published'
     and (valid_until is not null and valid_until < current_date
          or valid_until is null and observation_date < current_date - interval '90 days');
  get diagnostics changed = row_count;
  return changed;
end $fn$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance for the new tables
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array[
    'airlines','airline_routes','fare_observations','service_corridors','visa_packages'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I;', t, t);
    execute format($trg$create trigger trg_%s_updated_at before update on public.%I
      for each row execute function public.set_updated_at();$trg$, t, t);
  end loop;
end $do$;
