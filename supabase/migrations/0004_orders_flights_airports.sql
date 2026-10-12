-- ============================================================================
-- 0004_orders_flights_airports.sql
--   1. airports — maintained global reference data (OurAirports public domain),
--      admin-correctable, deactivatable, never destroyed while orders refer to it.
--   2. service_orders + service_order_events — flight-ticketing and other
--      paid assistance requests with an append-only lifecycle audit trail.
--   3. order_price_snapshots — the exact lines the customer saw; immutable once
--      written. Checkout re-prices server-side from the snapshot, never from
--      client input.
--   4. payment_event_log — append-only provider webhook log (raw payload id +
--      type only; no secrets), enforcing idempotent processing via unique
--      provider_event_id.
-- Idempotent: safe to re-run. Dollar-quote tags are named ($do$, $fn$).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Airports
-- ---------------------------------------------------------------------------
create table if not exists public.airports (
  id uuid primary key default gen_random_uuid(),
  ident text not null unique,              -- OurAirports identifier (stable external key)
  iata_code char(3),                       -- null where the airport has none
  icao_code char(4),
  name text not null,
  city_municipality text,
  iso_country char(2) not null,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  elevation_ft integer,
  airport_type text not null,              -- large/medium/small airport etc.
  active boolean not null default true,    -- deactivate, never delete, once used
  source text not null default 'ourairports',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_airports_iata on public.airports(iata_code) where active;
create index if not exists idx_airports_country on public.airports(iso_country) where active;
create index if not exists idx_airports_name_trgm on public.airports
  using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Service orders (flight assistance now; other purchasable services later)
-- ---------------------------------------------------------------------------
create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  service_key text not null references public.service_fees(key) on delete restrict,
  -- Denormalized service label captured at order time (the fee row may change later)
  service_label text not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment','payment_verified','accepted','info_requested',
                      'rejected','booking_confirmed','ticketed','completed','cancelled','refunded')),
  status_note text,
  -- Trip snapshot (what the customer requested — never overwritten by later edits)
  trip_json jsonb not null default '{}'::jsonb,
  origin_country char(2),
  destination_country char(2),
  origin_airport text references public.airports(id) on delete restrict,
  destination_airport text references public.airports(id) on delete restrict,
  depart_date date,
  return_date date,
  trip_type text check (trip_type in ('one_way','return')),
  passengers integer check (passengers between 1 and 9),
  cabin_class text check (cabin_class in ('economy','premium_economy','business','first')),
  contact_phone text,
  contact_whatsapp text,
  contact_imo text,
  notes text,
  accepted_by uuid references public.staff(id) on delete set null,
  accepted_at timestamptz,
  -- Manually confirmed external booking: the operator records the real PNR/reference
  -- obtained from the provider. The system never generates or fabricates these.
  external_booking_ref text,
  ticketed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_orders_customer on public.service_orders(customer_id, created_at desc);
create index if not exists idx_service_orders_status on public.service_orders(status);

-- Payment records may reference an order (the existing application linkage
-- from 0001 is unchanged). Guarded so a re-run never duplicates the column,
-- and order payments are pinned to their customer so the owner-visibility
-- policy in 0002 applies to them too.
do $do$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_transactions' and column_name = 'order_id'
  ) then
    alter table public.payment_transactions
      add column order_id uuid references public.service_orders(id) on delete set null;
  end if;
end $do$;
create index if not exists idx_payments_order on public.payment_transactions(order_id);

-- ---------------------------------------------------------------------------
-- Append-only order lifecycle events (who, what, when — never updated/deleted)
-- ---------------------------------------------------------------------------
create table if not exists public.service_order_events (
  id bigserial primary key,
  order_id uuid not null references public.service_orders(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  actor_id uuid,                           -- FK to auth.users added below (guarded)
  created_at timestamptz not null default now()
);
create index if not exists idx_order_events_order on public.service_order_events(order_id, created_at);

-- ---------------------------------------------------------------------------
-- Immutable price snapshot per order — the exact breakdown the customer saw.
-- Checkout re-prices from these rows; nothing is accepted from the browser.
-- ---------------------------------------------------------------------------
create table if not exists public.order_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.service_orders(id) on delete cascade,
  line_key text not null,
  label_en text not null,
  label_bn text,
  kind text not null check (kind in ('agency_service','official_government','third_party','optional_service')),
  unit_amount numeric(12,2) not null check (unit_amount >= 0),
  quantity integer not null default 1 check (quantity between 1 and 9),
  currency char(3) not null,
  price_source text not null,              -- e.g. 'service_fees:<key>@<iso-timestamp>'
  created_at timestamptz not null default now(),
  unique (order_id, line_key)
);
create index if not exists idx_price_snapshots_order on public.order_price_snapshots(order_id);

-- ---------------------------------------------------------------------------
-- Append-only provider webhook log. One row per received event id; the unique
-- constraint is what makes webhook processing idempotent at the storage layer.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_event_log (
  id bigserial primary key,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  order_reference text,
  payload_digest text,                     -- sha256 of raw body; raw payload never stored
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

-- ---------------------------------------------------------------------------
-- Audit logs reference staff/auth users generically; order events need the
-- same. Reuse audit_logs-style actor linkage without widening permissions:
-- service_order_events.actor_id points at auth.users via a dedicated FK added
-- through a DO block (auth schema is managed by Supabase Auth).
-- ---------------------------------------------------------------------------
do $do$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_order_events_actor_fk'
      and conrelid = 'public.service_order_events'::regclass
  ) then
    alter table public.service_order_events
      add constraint service_order_events_actor_fk
      foreign key (actor_id) references auth.users(id) on delete set null;
  end if;
end $do$;

-- ---------------------------------------------------------------------------
-- Order lifecycle guard: mirrors the application transition guard. Enforced in
-- the database so no code path (or RPC abuse) can skip the payment→accept→
-- fulfil boundary or forge a confirmed-booking state.
-- ---------------------------------------------------------------------------
create or replace function public.guard_service_order_transition()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    -- Orders are always born pending_payment; only the verified payment path
    -- may move them onward (see src/lib/payments.ts, which runs with the
    -- server-only service client).
    if new.status <> 'pending_payment' then
      raise exception 'Orders must be created as pending_payment' using errcode = '23514';
    end if;
    return new;
  end if;

  -- pending_payment -> payment_verified is the money boundary. It is allowed
  -- ONLY from the payment-confirmation context: the webhook/service client
  -- (no interactive user) or an explicit super-admin internal confirmation
  -- (zero-fee orders). An ordinary customer or staff session is refused.
  if old.status = 'pending_payment' and new.status = 'payment_verified' then
    if auth.uid() is null or public.is_super_admin() then
      return new;
    end if;
    raise exception 'Payment confirmation must go through the verified webhook path' using errcode = '42501';
  end if;

  if public.is_staff() then
    -- A confirmed booking requires a real external reference supplied by the operator.
    if new.status = 'booking_confirmed' and coalesce(new.external_booking_ref, '') = ''
       and coalesce(old.external_booking_ref, '') = '' then
      raise exception 'A confirmed booking requires the provider booking reference' using errcode = '23514';
    end if;
    return new;
  end if;

  -- Customers may only cancel their own order while it is still unpaid or
  -- awaiting info; every other customer transition is refused.
  if old.status in ('pending_payment','info_requested') and new.status = 'cancelled' then
    return new;
  end if;
  raise exception 'This order can no longer be modified by the customer' using errcode = '42501';
end $fn$;

drop trigger if exists trg_service_order_guard on public.service_orders;
create trigger trg_service_order_guard
  before insert or update of status on public.service_orders
  for each row execute function public.guard_service_order_transition();

-- ---------------------------------------------------------------------------
-- Append-only event writer: every status change is journalled automatically.
-- ---------------------------------------------------------------------------
create or replace function public.record_service_order_event()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.service_order_events (order_id, event_type, from_status, to_status, note, actor_id)
    values (new.id,
            case when tg_op = 'INSERT' then 'order_created' else 'status_changed' end,
            case when tg_op = 'INSERT' then null else old.status end,
            new.status,
            new.status_note,
            auth.uid());
  end if;
  return new;
end $fn$;

drop trigger if exists trg_service_order_events on public.service_orders;
create trigger trg_service_order_events
  after insert or update of status on public.service_orders
  for each row execute function public.record_service_order_event();

-- ---------------------------------------------------------------------------
-- Order reference numbers: SO-YY-XXXXXX (collision-safe, same pattern as VX-)
-- ---------------------------------------------------------------------------
create or replace function public.next_service_order_reference()
returns text language plpgsql as $fn$
declare seq bigint; yy text := to_char(now(), 'YY');
begin
  loop
    seq := (floor(random() * 900000) + 100000)::bigint;
    if not exists (select 1 from public.service_orders where reference_no = 'SO-' || yy || '-' || seq) then
      return 'SO-' || yy || '-' || seq;
    end if;
  end loop;
end $fn$;

-- ---------------------------------------------------------------------------
-- RLS: enable on every new table, then scope policies.
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array['airports','service_orders','service_order_events',
                           'order_price_snapshots','payment_event_log'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $do$;

-- Airports: world-readable reference data; staff may maintain it.
do $do$ begin
  create policy airports_public_read on public.airports for select using (active or public.is_staff());
exception when duplicate_object then null; end $do$;

-- Service fees: active prices are public information (the customer must see
-- the price before ordering). Inactive and historical rows stay staff-only.
do $do$ begin
  create policy service_fees_public_read on public.service_fees for select
    using (active or public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy airports_staff_all on public.airports for all to authenticated
    using (public.is_staff()) with check (public.is_staff());
exception when duplicate_object then null; end $do$;

-- Orders: strictly owner or staff.
do $do$ begin
  create policy service_orders_owner on public.service_orders for select
    using (customer_id = auth.uid() or public.is_staff());
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy service_orders_customer_insert on public.service_orders for insert to authenticated
    with check (customer_id = auth.uid() and status = 'pending_payment');
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy service_orders_owner_update on public.service_orders for update to authenticated
    using (customer_id = auth.uid() or public.is_staff())
    with check (customer_id = auth.uid() or public.is_staff());
exception when duplicate_object then null; end $do$;

-- Order events: owner-readable, staff-readable; inserts only by the definer
-- triggers / staff (customers cannot forge history).
do $do$ begin
  create policy order_events_read on public.service_order_events for select
    using (public.is_staff() or exists (
      select 1 from public.service_orders o
      where o.id = order_id and o.customer_id = auth.uid()));
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy order_events_staff_insert on public.service_order_events for insert to authenticated
    with check (public.is_staff());
exception when duplicate_object then null; end $do$;

-- Price snapshots: owner-readable; written only by server code (no direct
-- customer inserts — the insert policy is staff-only, server paths use the
-- service client or the definer trigger context).
do $do$ begin
  create policy price_snapshots_read on public.order_price_snapshots for select
    using (public.is_staff() or exists (
      select 1 from public.service_orders o
      where o.id = order_id and o.customer_id = auth.uid()));
exception when duplicate_object then null; end $do$;

do $do$ begin
  create policy price_snapshots_staff_insert on public.order_price_snapshots for insert to authenticated
    with check (public.is_staff());
exception when duplicate_object then null; end $do$;

-- Webhook log: staff read-only; inserts happen from the webhook (service client).
do $do$ begin
  create policy payment_event_log_staff_read on public.payment_event_log for select
    using (public.is_staff());
exception when duplicate_object then null; end $do$;

-- Audit trail: staff may append rows for their own sensitive actions
-- (booking confirmations, refunds); the log remains append-only because no
-- update or delete policy exists for anyone.
do $do$ begin
  create policy audit_staff_insert on public.audit_logs for insert to authenticated
    with check (public.is_staff());
exception when duplicate_object then null; end $do$;

-- ---------------------------------------------------------------------------
-- updated_at triggers for the new mutable tables
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array['airports','service_orders'] loop
    execute format('drop trigger if exists set_updated_at_%1$s on public.%1$s', t);
    execute format(
      'create trigger set_updated_at_%1$s before update on public.%1$s
       for each row execute function public.set_updated_at()', t);
  end loop;
end $do$;
