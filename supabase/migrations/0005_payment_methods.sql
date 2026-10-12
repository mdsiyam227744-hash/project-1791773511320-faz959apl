-- ============================================================================
-- 0005_payment_methods.sql — administrator-configurable payment methods and
-- the customer manual-payment submission ledger.
--
-- Design:
--   * payment_methods      — the merchant configuration (bKash / Nagad / bank /
--                            crypto / gateway). Enabled methods are readable by
--                            any authenticated user (customers need the
--                            instructions); writes are super-admin only and
--                            audited at the application layer.
--   * payment_submissions  — one customer submission per attempt (order,
--                            method, reference/tx id/proof). A database
--                            dedupe trigger plus a unique constraint prevent
--                            one transaction reference paying two orders.
--   * Zero-fee orders need no payment method; triggers refuse a submission
--     whose currency/amount does not match the order price snapshot, and
--     approval is the only path that moves an order past the money boundary.
--
-- No raw card data is ever stored: the gateway method holds only provider
-- names/notes; a CHECK fails on card-shaped digit runs. Customers can never
-- approve their own payment — the review trigger forbids any status change by
-- a non-staff session and pins reviewed_by to the acting staff member.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. payment_methods — merchant configuration (super-admin only writes)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bkash','nagad','bank','crypto','gateway')),
  label_en text not null check (length(btrim(label_en)) between 2 and 80),
  label_bn text,
  account_number text,
  account_name text,
  iban text,
  iban_alt text,
  swift text,
  routing_number text,
  branch text,
  wallet_number text,
  receiving_address text,
  network text,
  gateway_name text,
  instructions_en text,
  instructions_bn text,
  note text,
  -- At least one admin-visible reference detail:
  check (
    coalesce(account_number, iban, iban_alt, swift, routing_number, branch,
             wallet_number, receiving_address, network, gateway_name,
             instructions_en, instructions_bn, note) is not null
  ),
  -- No raw card data: fail fast on any card-shaped digit run (15+ digits).
  check (
    not (
      (coalesce(account_number,'') || coalesce(account_name,'') || coalesce(iban,'') ||
       coalesce(iban_alt,'') || coalesce(swift,'') || coalesce(routing_number,'') ||
       coalesce(branch,'') || coalesce(wallet_number,'') ||
       coalesce(receiving_address,'') || coalesce(network,'') ||
       coalesce(gateway_name,'') || coalesce(instructions_en,'') ||
       coalesce(instructions_bn,'') || coalesce(note,''))
      ~ '(?:^|\D)\d{15,}'
    )
  ),
  supported_currency char(3) not null default 'BDT',
  min_amount numeric(12,2) check (min_amount is null or min_amount >= 0),
  enabled boolean not null default true,
  sort_order integer not null default 100,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_methods_enabled
  on public.payment_methods(enabled, sort_order);
-- ---------------------------------------------------------------------------
-- 2. payment_submissions — customer manual-payment ledger
-- ---------------------------------------------------------------------------
create table if not exists public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.service_orders(id) on delete cascade,
  order_reference text not null,
  customer_id uuid not null references auth.users(id),
  payment_method_id uuid not null references public.payment_methods(id),
  method_kind text not null check (method_kind in ('bkash','nagad','bank','crypto')),
  submitted_reference text not null check (length(btrim(submitted_reference)) between 4 and 200),
  proof_path text,
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','approved','rejected')),
  note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (payment_method_id, submitted_reference)
);

create index if not exists idx_payment_submissions_order
  on public.payment_submissions(order_id);
create index if not exists idx_payment_submissions_customer
  on public.payment_submissions(customer_id, created_at desc);
create index if not exists idx_payment_submissions_method
  on public.payment_submissions(payment_method_id, status);

-- ---------------------------------------------------------------------------
-- 3. RLS — least privilege
--    * payment_methods: staff read full config; authenticated customers read
--      enabled methods (they need the live instructions to pay); anon: none.
--      Writes: super-admin only.
--    * payment_submissions: owner read; owner insert only pending rows for
--      themselves; staff update; nobody deletes.
-- ---------------------------------------------------------------------------
alter table public.payment_methods enable row level security;
alter table public.payment_submissions enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'payment_methods'
                   and policyname = 'payment_methods_staff_read') then
    create policy payment_methods_staff_read on public.payment_methods
      for select using (public.is_staff());
  end if;
exception when duplicate_object then null; end $do$;

do $do$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'payment_methods'
                   and policyname = 'payment_methods_public_read_enabled') then
    create policy payment_methods_public_read_enabled on public.payment_methods
      for select using (enabled or public.is_staff());
  end if;
exception when duplicate_object then null; end $do$;

do $do$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'payment_methods'
                   and policyname = 'payment_methods_superadmin_write') then
    create policy payment_methods_superadmin_write on public.payment_methods
      for all using (public.has_role('super_admin'))
      with check (public.has_role('super_admin'));
  end if;
exception when duplicate_object then null; end $do$;

do $do$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'payment_submissions'
                   and policyname = 'payment_submissions_owner_read') then
    create policy payment_submissions_owner_read on public.payment_submissions
      for select using (customer_id = auth.uid() or public.is_staff());
  end if;
exception when duplicate_object then null; end $do$;

do $do$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'payment_submissions'
                   and policyname = 'payment_submissions_owner_insert') then
    create policy payment_submissions_owner_insert on public.payment_submissions
      for insert with check (
        customer_id = auth.uid()
        and status = 'pending_verification'
        and reviewed_by is null and reviewed_at is null
      );
  end if;
exception when duplicate_object then null; end $do$;

do $do$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'payment_submissions'
                   and policyname = 'payment_submissions_staff_update') then
    create policy payment_submissions_staff_update on public.payment_submissions
      for update using (public.is_staff())
      with check (public.is_staff());
  end if;
exception when duplicate_object then null; end $do$;

-- ---------------------------------------------------------------------------
-- 4. Integrity triggers
-- ---------------------------------------------------------------------------

-- (a) Reference dedupe: one live submission per (method kind, reference).
-- A rejected submission's reference may be re-used (e.g. a customer retried
-- with a corrected order number) — only pending/approved ones block.
create or replace function public.guard_payment_submission_reference()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare dup int;
begin
  if new.status in ('pending_verification','approved') then
    select count(*) into dup
    from public.payment_submissions s
    where s.id <> new.id
      and s.method_kind = new.method_kind
      and lower(btrim(s.submitted_reference)) = lower(btrim(new.submitted_reference))
      and s.status in ('pending_verification','approved');
    if dup > 0 then
      raise exception 'duplicate_payment_reference'
        using errcode = '23505',
              detail = 'This transaction reference is already recorded against another order';
    end if;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_payment_submission_reference on public.payment_submissions;
create trigger trg_payment_submission_reference
  before insert or update of method_kind, submitted_reference, status
  on public.payment_submissions
  for each row execute function public.guard_payment_submission_reference();

-- (b) Review authorization: only staff may change a submission's status; the
-- recorded reviewer must be the acting staff member; a decided row must name
-- its reviewer; submissions can never be deleted.
create or replace function public.guard_payment_submission_review()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'Submissions are append-only' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.is_staff() then
      raise exception 'Only staff may change a submission status' using errcode = '42501';
    end if;
    if new.reviewed_by is null or new.reviewed_by is distinct from auth.uid() then
      raise exception 'reviewed_by must be the acting staff member' using errcode = '23514';
    end if;
    if new.status = 'approved'
       and not (public.has_role('super_admin')
                or public.has_role('application_manager')
                or public.has_role('support_agent')) then
      raise exception 'This role may not approve payments' using errcode = '42501';
    end if;
  end if;

  -- reviewed_by/reviewed_at may only be touched by staff.
  if (new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at)
     and not public.is_staff() then
    raise exception 'Only staff may record a review' using errcode = '42501';
  end if;

  -- A decided submission must record who reviewed it and when.
  if new.status <> 'pending_verification'
     and (new.reviewed_by is null or new.reviewed_at is null) then
    raise exception 'A review decision requires the reviewing staff member and time'
      using errcode = '23514';
  end if;
  return new;
end $fn$;

drop trigger if exists trg_payment_submission_review on public.payment_submissions;
create trigger trg_payment_submission_review
  before update of status, reviewed_by, reviewed_at on public.payment_submissions
  for each row execute function public.guard_payment_submission_review();

-- (c) Approval is the money boundary. A submission approval must match the
-- order's immutable price snapshot and moves the order pending_payment ->
-- payment_verified inside the same transaction as the approval itself, so an
-- approval can never exist without the order transition (and vice versa).
-- Mirrors guard_service_order_transition (0004): service-client context
-- (auth.uid() is null, i.e. the server webhook/action) or super-admin.
create or replace function public.on_payment_submission_approved()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_total numeric;
  v_currency char(3);
  v_order_status text;
begin
  if not (new.status = 'approved' and old.status is distinct from 'approved') then
    return new;
  end if;

  select coalesce(sum(ps.unit_amount * ps.quantity), 0), min(ps.currency)
    into v_total, v_currency
    from public.order_price_snapshots ps
    where ps.order_id = new.order_id;
  if v_currency is null then
    raise exception 'no_price_snapshot' using errcode = '23514';
  end if;
  if round(v_total, 2) <> round(new.amount, 2)
     or v_currency is distinct from new.currency then
    raise exception 'payment_amount_mismatch' using errcode = '23514';
  end if;

  update public.service_orders o
    set status = 'payment_verified'
    where o.id = new.order_id
      and o.status = 'pending_payment';
  if not found then
    select o.status into v_order_status
      from public.service_orders o
      where o.id = new.order_id;
    if v_order_status is distinct from 'payment_verified' then
      raise exception 'order_not_payable' using errcode = '23514';
    end if;
    -- Already payment_verified: idempotent re-approval (first approval won).
  end if;
  return new;
end $fn$;

drop trigger if exists trg_payment_submission_approved on public.payment_submissions;
create trigger trg_payment_submission_approved
  after update of status on public.payment_submissions
  for each row execute function public.on_payment_submission_approved();

-- ---------------------------------------------------------------------------
-- 5. updated_at maintenance
-- ---------------------------------------------------------------------------
drop trigger if exists trg_payment_methods_updated_at on public.payment_methods;
create trigger trg_payment_methods_updated_at
  before update on public.payment_methods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Private payment-proof storage
--    Path layout: {customer_id}/{order_id}/{timestamp}.{ext}
--    * Customers may upload ONLY into their own first-level folder and may
--      read their own proofs back. No overwrite, no delete.
--    * Staff may read proofs (signed URLs are minted server-side). No public
--      access, ever.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

do $do$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'payment_proofs_owner_upload') then
    create policy payment_proofs_owner_upload on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'payment-proofs'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
exception when duplicate_object then null; end $do$;

do $do$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'payment_proofs_owner_read') then
    create policy payment_proofs_owner_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'payment-proofs'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
exception when duplicate_object then null; end $do$;

do $do$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'payment_proofs_staff_read') then
    create policy payment_proofs_staff_read on storage.objects
      for select to authenticated
      using (bucket_id = 'payment-proofs' and public.is_staff());
  end if;
exception when duplicate_object then null; end $do$;
