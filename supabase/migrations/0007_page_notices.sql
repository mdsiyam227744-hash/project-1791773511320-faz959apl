-- ============================================================================
-- 0007_page_notices.sql — honest platform-status banner for the public site.
--
-- When the platform's database integration is not connected, the site must say
-- so plainly instead of showing empty catalogs that look like a broken shop.
-- The banner text is data, not code: after the database is connected and the
-- real content is in place, an administrator updates or hides this notice from
-- the admin panel — no redeploy needed.
--
-- RLS: public read (the banner is public by definition); no insert/update/
-- delete policy exists, so writes go through the server-side privileged path.
-- ============================================================================

create table if not exists public.page_notices (
  key text primary key,
  message_en text not null,
  message_bn text not null,
  severity text not null default 'info' check (severity in ('info', 'warning')),
  active boolean not null default true,
  updated_by uuid references public.staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.page_notices enable row level security;

do $do$ begin
  create policy page_notices_public_read on public.page_notices for select using (true);
exception when duplicate_object then null; end $do$;
