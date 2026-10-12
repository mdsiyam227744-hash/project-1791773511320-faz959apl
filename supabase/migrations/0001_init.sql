-- ============================================================================
-- 0001_init.sql — extensions, enums, core schema
-- Idempotent: safe to re-run.
-- Dollar-quote tags are named ($do$, $fn$) to avoid collisions with the
-- bodies they wrap.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enumerated domain types
-- ---------------------------------------------------------------------------
do $do$ begin
  create type user_role as enum ('super_admin','application_manager','content_manager','support_agent');
exception when duplicate_object then null; end $do$;

do $do$ begin
  create type visa_category_code as enum (
    'tourist','work','student','business','family','transit','medical','residence','other'
  );
exception when duplicate_object then null; end $do$;

do $do$ begin
  create type content_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $do$;

do $do$ begin
  create type doc_kind as enum (
    'passport_scan','photo','bank_statement','employment_letter','invitation_letter',
    'admission_letter','police_clearance','medical_certificate','marriage_certificate',
    'birth_certificate','other'
  );
exception when duplicate_object then null; end $do$;

do $do$ begin
  create type fee_kind as enum ('official_government','agency_service','third_party','optional_service');
exception when duplicate_object then null; end $do$;

do $do$ begin
  create type job_status as enum ('pending_review','approved','suspended','rejected','archived','closed');
exception when duplicate_object then null; end $do$;

do $do$ begin
  create type consult_status as enum ('new','contacted','scheduled','converted','closed');
exception when duplicate_object then null; end $do$;

do $do$ begin
  create type payment_status as enum ('requires_confirmation','confirmed','failed','refunded','partially_refunded');
exception when duplicate_object then null; end $do$;

-- ---------------------------------------------------------------------------
-- Staff (created early: other tables hold FKs to it)
-- ---------------------------------------------------------------------------
create table if not exists staff (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Countries (worldwide directory, extensible at runtime — no code changes)
-- ---------------------------------------------------------------------------
create table if not exists countries (
  id uuid primary key default gen_random_uuid(),
  iso2 char(2) not null unique,
  iso3 char(3),
  name_en text not null,
  name_bn text,
  nationality_en text,
  nationality_bn text,
  region text,
  is_origin boolean not null default true,
  is_destination boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Visa categories (rows, not hardcoded UI arrays)
-- ---------------------------------------------------------------------------
create table if not exists visa_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- mirrors visa_category_code or custom codes
  label_en text not null,
  label_bn text,
  description_en text,
  description_bn text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Visa listings (the catalog)
-- ---------------------------------------------------------------------------
create table if not exists visa_listings (
  id uuid primary key default gen_random_uuid(),
  destination_country_id uuid not null references countries(id) on delete restrict,
  origin_country_id uuid references countries(id) on delete restrict,
  category_code text not null,
  official_name_en text not null,
  official_name_bn text,
  summary_en text,
  summary_bn text,
  nationality_restrictions text,
  residence_restrictions text,
  eligibility_en text,
  eligibility_bn text,
  required_documents_en text,
  required_documents_bn text,
  application_steps_en text,
  application_steps_bn text,
  official_url text,
  validity text,
  permitted_stay text,
  work_authorization text,
  refund_conditions text,
  processing_time_estimate text,
  processing_time_source text,
  fee_currency char(3),
  last_verified date,
  verified_by uuid references staff(id) on delete set null,
  status content_status not null default 'draft',
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visa_listing_category_fk foreign key (category_code) references visa_categories(code)
);

create index if not exists idx_visa_listings_dest on visa_listings(destination_country_id, origin_country_id);
create index if not exists idx_visa_listings_status on visa_listings(status);
create index if not exists idx_visa_listings_cat on visa_listings(category_code);

-- ---------------------------------------------------------------------------
-- Fees — official government fees are SEPARATE from agency-controlled fees
-- ---------------------------------------------------------------------------
create table if not exists visa_fees (
  id uuid primary key default gen_random_uuid(),
  visa_listing_id uuid not null references visa_listings(id) on delete cascade,
  kind fee_kind not null,
  label_en text not null,
  label_bn text,
  amount numeric(12,2),
  currency char(3) not null,
  is_verified boolean not null default false,
  source_url text,
  last_verified date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_visa_fees_listing on visa_fees(visa_listing_id);

create table if not exists service_fees (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_en text not null,
  label_bn text,
  amount numeric(12,2) not null,
  currency char(3) not null,
  active boolean not null default true,
  updated_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_fee_history (
  id uuid primary key default gen_random_uuid(),
  service_fee_id uuid not null references service_fees(id) on delete cascade,
  changed_by uuid references staff(id) on delete set null,
  previous_amount numeric(12,2),
  new_amount numeric(12,2) not null,
  currency char(3) not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Employers & overseas employment listings
-- ---------------------------------------------------------------------------
create table if not exists employers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_id uuid references countries(id) on delete set null,
  workplace text,
  verification_status content_status not null default 'draft',
  source_url text,
  recruitment_partner text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_listings (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references employers(id) on delete cascade,
  title_en text not null,
  title_bn text,
  description_en text not null,
  description_bn text,
  salary_amount numeric(12,2),
  salary_currency char(3),
  salary_period text,
  qualifications_en text,
  contract_duration_months integer,
  application_deadline date,
  work_permit_notes text,
  lawful_recruitment_fees text,
  positions integer,
  status job_status not null default 'pending_review',
  review_notes text,
  reviewed_by uuid references staff(id) on delete set null,
  reviewed_at timestamptz,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_job_listings_status on job_listings(status, application_deadline);

-- ---------------------------------------------------------------------------
-- Customers, staff, profiles
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  country_id uuid references countries(id) on delete set null,
  locale text not null default 'en' check (locale in ('en','bn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Applications
-- status is text + CHECK (not an enum) so workflow states can evolve without a
-- locked enum migration. form_data holds the purpose-specific structured
-- answers; form_kind records which guided form produced the application.
-- ---------------------------------------------------------------------------
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  customer_id uuid not null references profiles(id) on delete cascade,
  visa_listing_id uuid references visa_listings(id) on delete set null,
  destination_country_id uuid references countries(id) on delete set null,
  origin_country_id uuid references countries(id) on delete set null,
  category_code text,
  status text not null default 'draft'
    check (status in ('draft','submitted','under_review','awaiting_documents','awaiting_customer',
                      'in_progress','submitted_to_authority','approved','refused','withdrawn','closed')),
  status_note text,
  assigned_staff_id uuid references staff(id) on delete set null,
  travel_date date,
  form_data jsonb not null default '{}'::jsonb,
  form_kind text not null default 'tourist',
  submitted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_applications_customer on applications(customer_id, created_at desc);
create index if not exists idx_applications_status on applications(status);
create index if not exists idx_applications_assigned on applications(assigned_staff_id);
create index if not exists idx_applications_form_gin on applications using gin (form_data);

create table if not exists application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  old_status text,
  new_status text not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  customer_id uuid not null references profiles(id) on delete cascade,
  kind doc_kind not null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_app_docs_app on application_documents(application_id);

-- ---------------------------------------------------------------------------
-- Consultations, messages
-- ---------------------------------------------------------------------------
create table if not exists consultation_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id) on delete set null,
  guest_name text,
  guest_email text,
  guest_phone text,
  destination_country_id uuid references countries(id) on delete set null,
  category_code text,
  message text,
  status consult_status not null default 'new',
  handled_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete cascade,
  consultation_id uuid references consultation_requests(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('customer','staff')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_app on messages(application_id, created_at);

-- ---------------------------------------------------------------------------
-- Route queries & flight quote records
-- ---------------------------------------------------------------------------
create table if not exists route_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  origin_country_id uuid references countries(id) on delete set null,
  origin_city text,
  destination_country_id uuid references countries(id) on delete set null,
  destination_city text,
  travel_date date,
  category_code text,
  currency char(3),
  distance_km numeric(10,1),
  distance_source text not null,
  created_at timestamptz not null default now()
);

create table if not exists flight_quote_records (
  id uuid primary key default gen_random_uuid(),
  route_query_id uuid not null references route_queries(id) on delete cascade,
  provider text not null,
  airline text,
  price numeric(12,2),
  currency char(3),
  stops integer,
  retrieved_at timestamptz not null default now(),
  source_url text
);

-- ---------------------------------------------------------------------------
-- Payments & refunds (records only; provider integration boundary in code)
-- ---------------------------------------------------------------------------
create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete set null,
  customer_id uuid references profiles(id) on delete set null,
  service_fee_id uuid references service_fees(id) on delete set null,
  amount numeric(12,2) not null,
  currency char(3) not null,
  status payment_status not null default 'requires_confirmation',
  provider text,
  provider_ref text,
  idempotency_key text unique,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_app on payment_transactions(application_id);

create table if not exists refund_records (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payment_transactions(id) on delete cascade,
  amount numeric(12,2) not null,
  currency char(3) not null,
  reason text,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'requested',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Configurable platform settings & content
-- ---------------------------------------------------------------------------
create table if not exists contact_settings (
  id integer primary key default 1 check (id = 1),
  whatsapp_number text,
  whatsapp_default_message text,
  imo_contact text,
  imo_mode text not null default 'profile_url' check (imo_mode in ('profile_url','fallback_notice')),
  phone_display text,
  email_display text,
  whatsapp_button_label text,
  imo_button_label text,
  updated_by uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists brand_settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null default 'VisaBridge Global',
  tagline_en text not null default 'Your Journey. Our Guidance.',
  tagline_bn text,
  logo_svg text,
  logo_dark_svg text,
  favicon_svg text,
  primary_color text not null default '#0A1F44',
  secondary_color text not null default '#C9A227',
  default_locale text not null default 'en' check (default_locale in ('en','bn')),
  updated_by uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists site_content (
  id uuid primary key default gen_random_uuid(),
  page text not null,
  section_key text not null,
  locale text not null default 'en' check (locale in ('en','bn')),
  title text,
  body text,
  sort_order integer not null default 100,
  active boolean not null default true,
  updated_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page, section_key, locale)
);

create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  question_en text not null,
  question_bn text,
  answer_en text not null,
  answer_bn text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists legal_documents (
  id uuid primary key default gen_random_uuid(),
  doc_key text not null unique,
  title_en text not null,
  title_bn text,
  body_en text not null,
  body_bn text,
  updated_by uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_actor on audit_logs(actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Updated-at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end $fn$;

do $do$
declare t text;
begin
  foreach t in array array[
    'countries','visa_categories','visa_listings','visa_fees','service_fees','employers',
    'job_listings','profiles','staff','applications','consultation_requests','contact_settings',
    'brand_settings','site_content','legal_documents'
  ] loop
    execute format('drop trigger if exists set_updated_at_%1$s on public.%1$s', t);
    execute format(
      'create trigger set_updated_at_%1$s before update on public.%1$s
       for each row execute function public.set_updated_at()', t);
  end loop;
end $do$;
