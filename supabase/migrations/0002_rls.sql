-- ============================================================================
-- 0002_rls.sql — Row Level Security: least-privilege authorization
-- Rules:
--   * Anonymous (anon) may read only published public catalog/content.
--   * Customers (authenticated, non-staff) may read/write ONLY their own rows.
--   * Staff permissions are enforced by helper functions marked SECURITY DEFINER
--     (search_path pinned) so RLS checks cannot be bypassed by clients.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, pinned search_path)
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s where s.id = auth.uid() and s.is_active);
$$;

create or replace function public.has_role(needed public.user_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.is_active and s.role = needed
  );
$$;

create or replace function public.staff_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select s.role from public.staff s where s.id = auth.uid() and s.is_active;
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('super_admin');
$$;

-- Roles a given role may grant to others (server-enforced).
create or replace function public.can_grant_role(granter_role public.user_role, target_role public.user_role)
returns boolean language sql immutable as $$
  select granter_role = 'super_admin'
     or (granter_role = 'application_manager' and target_role in ('application_manager','support_agent'));
$$;

-- ---------------------------------------------------------------------------
-- Grant management (callable only through the RPC guarded above)
-- ---------------------------------------------------------------------------
create or replace function public.grant_staff(target_user uuid, target_name text, target_role public.user_role)
returns void language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role;
begin
  if not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select s.role into actor_role from public.staff s where s.id = auth.uid();
  if not public.can_grant_role(actor_role, target_role) then
    raise exception 'Your role cannot grant this role' using errcode = '42501';
  end if;
  insert into public.staff (id, display_name, role) values (target_user, target_name, target_role)
  on conflict (id) do update set role = excluded.role, display_name = excluded.display_name, is_active = true;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'staff.grant', 'staff', target_user::text,
          jsonb_build_object('role', target_role, 'by_role', actor_role));
end $$;

create or replace function public.revoke_staff(target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role;
begin
  if not public.is_super_admin() then
    raise exception 'Only the Super Administrator may revoke staff access' using errcode = '42501';
  end if;
  delete from public.staff where id = target_user;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'staff.revoke', 'staff', target_user::text, jsonb_build_object());
end $$;

-- One-time bootstrap: refuses to run once any staff row exists.
create or replace function public.bootstrap_first_super_admin(target_user uuid, target_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.staff) then
    raise exception 'Bootstrap unavailable: staff already exist';
  end if;
  insert into public.staff (id, display_name, role) values (target_user, target_name, 'super_admin');
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (target_user, 'staff.bootstrap', 'staff', target_user::text, jsonb_build_object('role','super_admin'));
end $$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'countries','visa_categories','visa_listings','visa_fees','service_fees','service_fee_history',
    'employers','job_listings','profiles','staff','applications','application_status_history',
    'application_documents','consultation_requests','messages','route_queries','flight_quote_records',
    'payment_transactions','refund_records','contact_settings','brand_settings','site_content',
    'faqs','legal_documents','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Policies — public catalog (anon: read published only; staff: full control)
-- ---------------------------------------------------------------------------
do $$ begin
  create policy countries_public_read on public.countries for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy visa_categories_public_read on public.visa_categories for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy visa_listings_public_read on public.visa_listings for select
    using (status = 'published' or public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy visa_fees_public_read on public.visa_fees for select
    using (exists (select 1 from public.visa_listings v
                   where v.id = visa_listing_id and (v.status = 'published' or public.is_staff())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy faqs_public_read on public.faqs for select using (active or public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy legal_public_read on public.legal_documents for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy site_content_public_read on public.site_content for select using (active or public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy brand_public_read on public.brand_settings for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy contact_public_read on public.contact_settings for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy employers_public_read on public.employers for select
    using (verification_status = 'published' or public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy job_listings_public_read on public.job_listings for select
    using (
      (status = 'approved' and exists (
         select 1 from public.employers e
         where e.id = employer_id and e.verification_status = 'published'))
      or public.is_staff()
    );
exception when duplicate_object then null; end $$;

-- Staff-only write on catalog & settings tables (anon/authenticated: no write at all)
do $$
declare t text;
begin
  foreach t in array array[
    'countries','visa_categories','visa_listings','visa_fees','service_fees','service_fee_history',
    'employers','job_listings','contact_settings','brand_settings','site_content','faqs','legal_documents'
  ] loop
    execute format(
      'create policy %1$s_staff_all on public.%1$s for all to authenticated
       using (public.is_staff()) with check (public.is_staff())', t)
    ;
  end loop;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profiles: owner-only read/update; no self-service insert beyond trigger
-- ---------------------------------------------------------------------------
do $$ begin
  create policy profiles_owner_read on public.profiles for select using (id = auth.uid() or public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy profiles_owner_update on public.profiles for update
    using (id = auth.uid() or public.is_super_admin()) with check (id = auth.uid() or public.is_super_admin());
exception when duplicate_object then null; end $$;

-- Staff table: staff can read roster; nobody can write directly (only via RPC above)
do $$ begin
  create policy staff_read on public.staff for select using (public.is_staff());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Applications & owned records: strictly owner- or staff-scoped
-- ---------------------------------------------------------------------------
do $$ begin
  create policy applications_owner on public.applications for select
    using (customer_id = auth.uid() or public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy applications_customer_insert on public.applications for insert to authenticated
    with check (customer_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy applications_staff_update on public.applications for update to authenticated
    using (public.is_staff()) with check (public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy app_history_owner on public.application_status_history for select
    using (public.is_staff() or exists (
      select 1 from public.applications a
      where a.id = application_id and a.customer_id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy app_history_staff_write on public.application_status_history for insert to authenticated
    with check (public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy app_docs_owner on public.application_documents for select
    using (customer_id = auth.uid() or public.has_role('super_admin') or public.has_role('application_manager'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy app_docs_customer_insert on public.application_documents for insert to authenticated
    with check (customer_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy app_docs_owner_delete on public.application_documents for delete to authenticated
    using (customer_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Consultations, messages
-- ---------------------------------------------------------------------------
do $$ begin
  create policy consult_owner on public.consultation_requests for select
    using (customer_id = auth.uid() or public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy consult_insert on public.consultation_requests for insert to authenticated
    with check (customer_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy consult_staff_update on public.consultation_requests for update to authenticated
    using (public.is_staff()) with check (public.is_staff());
exception when duplicate_object then null; end $$;

-- Anonymous may create a guest consultation via the server route (service key), not directly.
do $$ begin
  create policy messages_read on public.messages for select
    using (
      public.is_staff()
      or (sender_id = auth.uid())
      or exists (select 1 from public.applications a
                 where a.id = application_id and a.customer_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy messages_customer_send on public.messages for insert to authenticated
    with check (
      sender_role = 'customer' and sender_id = auth.uid()
      and exists (select 1 from public.applications a
                  where a.id = application_id and a.customer_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy messages_staff_send on public.messages for insert to authenticated
    with check (sender_role = 'staff' and public.is_staff());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Route queries / quotes / payments / refunds / audit
-- ---------------------------------------------------------------------------
do $$ begin
  create policy route_queries_owner on public.route_queries for select using (user_id = auth.uid() or public.is_staff());
exception when duplicate_object then null; end $$;

do $ begin
  create policy route_queries_insert on public.route_queries for insert to authenticated
    with check (user_id = auth.uid());
exception when duplicate_object then null; end $;

do $$ begin
  create policy quotes_read on public.flight_quote_records for select using (public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy payments_owner_read on public.payment_transactions for select
    using (customer_id = auth.uid() or public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy refunds_staff_read on public.refund_records for select
    using (public.is_staff() or exists (
      select 1 from public.payment_transactions p
      where p.id = payment_id and p.customer_id = auth.uid()));
exception when duplicate_object then null; end $$;

-- Audit log: staff read-only; writes happen via security-definer functions.
do $$ begin
  create policy audit_staff_read on public.audit_logs for select using (public.is_staff());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- New-user profile creation trigger (owners of their own row only)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
