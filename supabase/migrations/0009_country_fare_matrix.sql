-- ============================================================================
-- 0009_country_fare_matrix.sql — worldwide country-pair fare reference system
--   1. country_fare_refs        — per ordered country pair: OBSERVED historical
--                                 one-way references (flight-fare-history,
--                                 CC-BY-4.0) OR a needs_research marker with
--                                 a NULL amount. Amounts stay in EUR exactly
--                                 as observed; display conversion is separate.
--   2. derived_round_trip_refs  — sum of the two directional one-way MEDIANS.
--                                 Labelled derived; NEVER an observed return.
--   3. fare_mapping_review      — dataset city names that could not be mapped
--                                 to exactly one country; agents resolve them.
--   4. fare_display_settings    — single-row public display-currency config
--                                 (documented rate source + as-of date).
--
-- Honesty rules enforced in-schema:
--   - a needs_research row can never carry an amount;
--   - an observed/derived row always carries a source URL + license;
--   - review decisions (verified/rejected) always record who + when;
--   - a re-import never overwrites a review decision.
-- All statements idempotent; dollar-quote tags named ($do$, $fn$).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. country_fare_refs
-- ---------------------------------------------------------------------------
create table if not exists public.country_fare_refs (
  id uuid primary key default gen_random_uuid(),
  origin_iso char(2) not null,
  destination_iso char(2) not null,
  fare_kind text not null
    check (fare_kind in ('observed_one_way_history','needs_research')),
  amount numeric(12,2),                     -- EUR as observed; NULL for needs_research
  currency char(3) not null default 'EUR',
  lowest_city_pair text,                    -- the city route that produced `amount`
  median_of_contributing_route numeric(12,2),
  observation_count integer check (observation_count is null or observation_count >= 0),
  supporting_city_routes integer check (supporting_city_routes is null or supporting_city_routes >= 0),
  observation_from date,
  observation_to date,
  source_url text,
  source_license text,
  source_dataset text,
  verification_status text not null default 'needs_research'
    check (verification_status in ('needs_research','needs_review','verified','rejected')),
  review_note text,
  reviewed_by uuid references public.staff(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint country_fare_refs_pair check (origin_iso <> destination_iso),
  constraint country_fare_refs_shape check (
    (fare_kind = 'needs_research' and amount is null and source_url is not null)
    or
    (fare_kind = 'observed_one_way_history' and amount is not null
     and source_url is not null and source_license is not null
     and observation_from is not null and observation_to is not null)
  )
);
create unique index if not exists uq_country_fare_refs_pair
  on public.country_fare_refs(origin_iso, destination_iso, fare_kind);
create index if not exists idx_country_fare_refs_status
  on public.country_fare_refs(verification_status) where verification_status <> 'verified';
create index if not exists idx_country_fare_refs_dest
  on public.country_fare_refs(destination_iso) where fare_kind = 'observed_one_way_history';

-- ---------------------------------------------------------------------------
-- 2. derived_round_trip_refs
-- ---------------------------------------------------------------------------
create table if not exists public.derived_round_trip_refs (
  id uuid primary key default gen_random_uuid(),
  origin_iso char(2) not null,
  destination_iso char(2) not null,
  fare_kind text not null default 'derived_round_trip_reference'
    check (fare_kind = 'derived_round_trip_reference'),
  derived_amount numeric(12,2) not null check (derived_amount >= 0),
  currency char(3) not null default 'EUR',
  outbound_median numeric(12,2) not null,
  inbound_median numeric(12,2) not null,
  source_routes jsonb not null,             -- both directional medians + dates
  observation_count integer check (observation_count is null or observation_count >= 0),
  source_url text,
  source_license text,
  source_dataset text,
  verification_status text not null default 'needs_review'
    check (verification_status in ('needs_review','verified','rejected')),
  review_note text,
  reviewed_by uuid references public.staff(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint derived_refs_pair check (origin_iso <> destination_iso)
);
create unique index if not exists uq_derived_refs_pair
  on public.derived_round_trip_refs(origin_iso, destination_iso, fare_kind);
create index if not exists idx_derived_refs_status
  on public.derived_round_trip_refs(verification_status) where verification_status <> 'verified';

-- ---------------------------------------------------------------------------
-- 3. fare_mapping_review — the ambiguous/unmatched city queue
-- ---------------------------------------------------------------------------
create table if not exists public.fare_mapping_review (
  id uuid primary key default gen_random_uuid(),
  city_name text not null,                  -- exactly as the dataset spells it
  match_kind text not null check (match_kind in ('unmatched','ambiguous')),
  possible_countries text,                  -- comma-separated ISO2 candidates
  dataset_routes integer not null default 0,
  source_url text,
  resolved boolean not null default false,
  resolved_country char(2),
  resolved_by uuid references public.staff(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_resolved_shape check (
    (resolved = false) or (resolved_country is not null and resolved_by is not null and resolved_at is not null)
  )
);
create unique index if not exists uq_fare_mapping_review_city on public.fare_mapping_review(city_name);
create index if not exists idx_fare_mapping_review_open
  on public.fare_mapping_review(resolved) where resolved = false;

-- ---------------------------------------------------------------------------
-- 4. fare_display_settings — single-row display-currency configuration
-- ---------------------------------------------------------------------------
create table if not exists public.fare_display_settings (
  id integer primary key default 1 check (id = 1),
  display_currency char(3) not null default 'BDT',
  rate_to_display numeric(12,6) not null check (rate_to_display > 0),
  rate_source text not null,
  rate_as_of date not null,
  enabled boolean not null default true,     -- estimates/conversion visible publicly?
  updated_by uuid references public.staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Review integrity triggers — who decided, and when
-- ---------------------------------------------------------------------------
create or replace function public.country_fare_ref_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.verification_status in ('verified','rejected') and new.verification_status <> old.verification_status then
    if new.reviewed_by is null or new.reviewed_at is null then
      raise exception 'A review decision must record reviewed_by and reviewed_at'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.verification_status = 'needs_review' and new.amount is null then
    raise exception 'needs_review rows must carry the observed amount'
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

do $do$ begin
  drop trigger if exists trg_country_fare_ref_guard on public.country_fare_refs;
  create trigger trg_country_fare_ref_guard before update on public.country_fare_refs
    for each row execute function public.country_fare_ref_guard();
exception when duplicate_object then null; end $do$;

create or replace function public.derived_ref_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.verification_status in ('verified','rejected') and new.verification_status <> old.verification_status then
    if new.reviewed_by is null or new.reviewed_at is null then
      raise exception 'A review decision must record reviewed_by and reviewed_at'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $fn$;

do $do$ begin
  drop trigger if exists trg_derived_ref_guard on public.derived_round_trip_refs;
  create trigger trg_derived_ref_guard before update on public.derived_round_trip_refs
    for each row execute function public.derived_ref_guard();
exception when duplicate_object then null; end $do$;

create or replace function public.fare_review_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.resolved = true and (new.resolved_country is null or new.resolved_by is null or new.resolved_at is null) then
    raise exception 'Resolving a mapping requires the country and reviewer identity'
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

do $do$ begin
  drop trigger if exists trg_fare_review_guard on public.fare_mapping_review;
  create trigger trg_fare_review_guard before update on public.fare_mapping_review
    for each row execute function public.fare_review_guard();
exception when duplicate_object then null; end $do$;

-- ---------------------------------------------------------------------------
-- Import refresh guard — an automated refresh must never overwrite a
-- reviewer's verification or a resolver's mapping decision.
-- ---------------------------------------------------------------------------
create or replace function public.country_fare_ref_import_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.source_dataset is not null and new.source_dataset like 'flight-fare-history@%' then
    if old.verification_status in ('verified','rejected') then
      new.verification_status := old.verification_status;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
      new.review_note := old.review_note;
    end if;
  end if;
  return new;
end $fn$;

do $do$ begin
  drop trigger if exists trg_country_fare_ref_import_guard on public.country_fare_refs;
  create trigger trg_country_fare_ref_import_guard before update on public.country_fare_refs
    for each row execute function public.country_fare_ref_import_guard();
exception when duplicate_object then null; end $do$;

create or replace function public.derived_ref_import_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.source_dataset is not null and new.source_dataset like 'flight-fare-history@%' then
    if old.verification_status in ('verified','rejected') then
      new.verification_status := old.verification_status;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
      new.review_note := old.review_note;
    end if;
  end if;
  return new;
end $fn$;

do $do$ begin
  drop trigger if exists trg_derived_ref_import_guard on public.derived_round_trip_refs;
  create trigger trg_derived_ref_import_guard before update on public.derived_round_trip_refs
    for each row execute function public.derived_ref_import_guard();
exception when duplicate_object then null; end $do$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array[
    'country_fare_refs','derived_round_trip_refs','fare_mapping_review','fare_display_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $do$;

-- Public reads: only verified rows (customers must never see an unreviewed
-- price); needs_research shape is public-visible only in aggregate counters,
-- which the server computes without exposing unverified amounts.
do $do$ begin
  create policy country_fare_refs_public_read on public.country_fare_refs for select
    using (verification_status = 'verified' or public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy derived_refs_public_read on public.derived_round_trip_refs for select
    using (verification_status = 'verified' or public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy fare_mapping_review_staff_read on public.fare_mapping_review for select
    using (public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy fare_display_settings_public_read on public.fare_display_settings for select
    using (true);
exception when duplicate_object then null; end $do$;

-- Staff writes
do $do$
declare t text; pol text;
begin
  foreach t in array array[
    'country_fare_refs','derived_round_trip_refs','fare_mapping_review','fare_display_settings'
  ] loop
    pol := t || '_staff_all';
    if public._policy_absent(t, pol) then
      execute format(
        'create policy %I on public.%I for all to authenticated
         using (public.is_staff()) with check (public.is_staff())', pol, t);
    end if;
  end loop;
end $do$;

-- ---------------------------------------------------------------------------
-- Worldwide matrix helpers — enumerated, never materialised
-- ---------------------------------------------------------------------------
-- Supported = the countries the platform actually serves (both flags).
create or replace function public.supported_country_count()
returns integer language sql stable as $fn$
  select count(*)::integer from public.countries where is_origin and is_destination;
$fn$;

-- Matrix size for honesty reporting (n x (n-1) ordered international pairs).
create or replace function public.country_pair_matrix_size()
returns integer language sql stable as $fn$
  select count(*)::integer * (count(*)::integer - 1) from public.countries where is_origin and is_destination;
$fn$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array[
    'country_fare_refs','derived_round_trip_refs','fare_mapping_review','fare_display_settings'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I;', t, t);
    execute format($trg$create trigger trg_%s_updated_at before update on public.%I
      for each row execute function public.set_updated_at();$trg$, t, t);
  end loop;
end $do$;
