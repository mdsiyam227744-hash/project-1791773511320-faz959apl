# VisaBridge Global — International Visa & Travel Services Platform

Tagline: **Your Journey. Our Guidance.**

A database-backed, multilingual visa assistance / immigration / overseas employment / travel
services platform built with Next.js (App Router), TypeScript (strict), Tailwind CSS v4,
Supabase Postgres (with Row Level Security) and Supabase Auth.

## Brand assets

`public/brand/` holds the first-party identity: the navy/gold globe-and-checkmark icon
(`logo-icon.svg`, `favicon.svg`, PNG exports at 16/32/48/192/512), and the full wordmark in
light (`logo-full.svg`) and dark (`logo-full-dark.svg`) variants. Everything is regenerable:
`node scripts/render-brand-png.cjs` rebuilds the PNGs from the shared geometry. An
administrator can override the logo and favicon at any time from Content & branding — the
bundled assets are the defaults, not hardcodes.

## Ground rules baked into the code

- No demo mode, mock data, or simulated integrations. Every integration (flight data, payments,
  email) is implemented against the provider's documented API and degrades to an explicit
  "unavailable — request a quote" state when credentials are not configured.
- Official government fees are stored separately from agency-controlled service fees and are
  labelled with source + last-verified date. Unverified fees are shown as "Not verified".
- All authorization is enforced server-side (RLS policies + server component/action guards).
  Roles can only be granted by existing staff through the protected staff API.
- Brand, contact channels, colors, and legal content are database-driven and editable in the
  admin control center.

## Project layout

```
supabase/migrations/   SQL migrations (schema, RLS, functions)
supabase/seed/         Reference data (countries, visa categories, verified fee records, i18n strings)
src/lib/               Auth, RBAC, i18n, settings, fees, integration boundaries
src/app/(site)         Public website
src/app/(auth)         Registration, login, password reset
src/app/account        Customer dashboard
src/app/admin          Admin control center
tests/unit             Node test runner suites (business logic + security invariants)
```

## Applying migrations and seed data

Apply the SQL files in `supabase/migrations/` in filename order against the project database,
then `supabase/seed/reference_data.sql`. All statements are idempotent.

## Bootstrapping the first Super Administrator

Register a normal customer account, then (as database owner / via the SQL console) execute:

```sql
select bootstrap_first_super_admin('<auth.users.id>', 'Full Name');
```

The function refuses to run once any staff record exists, so the window is limited to first
setup. Afterwards, only the Super Administrator can grant staff roles through the admin UI.

## Environment

See `.env.example`. Missing optional integrations (flights, payments, email) keep the
corresponding features disabled rather than simulated.
