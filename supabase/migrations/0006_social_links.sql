-- ============================================================================
-- 0006_social_links.sql — floating WhatsApp / imo / Facebook contact buttons.
--
-- Adds the Facebook page URL and per-button enable switches to the existing
-- public.contact_settings row (id = 1). No new table is created, so the table's
-- existing RLS (public read, staff-only write) applies to the new columns
-- unchanged. The https-only check keeps a malformed URL out of the database
-- rather than out of the browser, so every reader sees the same guarantee.
-- ============================================================================

alter table public.contact_settings
  add column if not exists facebook_url text,
  add column if not exists whatsapp_enabled boolean not null default true,
  add column if not exists imo_enabled boolean not null default true,
  add column if not exists facebook_enabled boolean not null default true;

alter table public.contact_settings
  drop constraint if exists contact_facebook_https;

alter table public.contact_settings
  add constraint contact_facebook_https
  check (facebook_url is null or facebook_url like 'https://%');

comment on column public.contact_settings.facebook_url is
  'Admin-verified https URL of the business Facebook page; null hides the button.';
