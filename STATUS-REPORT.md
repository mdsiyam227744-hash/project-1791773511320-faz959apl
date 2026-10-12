# Implementation Status Report

Date: 2026-10-12
Scope: complete initial build of the visa / immigration / overseas employment / travel
services platform in this repository.

## A. Features implemented

| Area | Status |
|---|---|
| Public website (home, about, countries, visa categories, visa detail, route planner, jobs, job detail, process, documents, contact, FAQ, track, privacy, terms, refunds, complaints) | Built. Pages render from the database; unverified data is labelled. |
| Customer accounts (register with email+password, login, logout, password reset) | Built against Supabase Auth. |
| Customer dashboard (applications, status timeline, messaging, document upload, profile) | Built with owner-scoped queries. |
| Application workflow (submission with server-generated reference, staff updates, history trigger) | Built. |
| Admin control center (overview, applications, visas, countries, jobs, employers, consultations, pricing, content/branding, staff, audit) | Built with role-gated access. |
| WhatsApp / imo contact channels (admin-configurable, official formats only) | Built; links render only when configured. |
| Flight fare / route cost estimation | Built; distance works offline, live fares only via the real provider. |
| Payments (Stripe Checkout + signature-verified webhook, idempotent confirmation) | Built; disabled with 503 until credentials exist. |
| Outbound email (Resend boundary) | Built; reports skipped when unconfigured. |
| Role-based staff permissions (4 roles, grant matrix, DB-enforced) | Built. |
| Multilingual structure (English + Bangla dictionaries, per-profile language) | Built. |
| Configurable branding (name, colors, logo SVG, locale — all admin-editable) | Built. |

## B. Database and migrations

- `supabase/migrations/0001_init.sql` — schema (25+ tables, enums, FKs, indexes, triggers).
- `supabase/migrations/0002_rls.sql` — Row Level Security on every table, owner-scoped
  policies, security-definer helpers with pinned `search_path`, guarded grant/revoke RPCs,
  one-time super-admin bootstrap.
- `supabase/migrations/0003_functions.sql` — reference-number generation, status history
  trigger, service-fee audit trigger.
- `supabase/seed/reference_data.sql` — 43 real countries, 9 visa categories, default
  brand/contact rows, two DRAFT reference visa listings with real official source URLs
  (one fee marked verified with source+date, one explicitly unverified).
- Static SQL invariants (RLS coverage, owner scoping, grant guards, idempotency) are
  enforced by automated tests in `tests/unit/sql-invariants.test.ts` — all passing.
- Applying migrations + seed to a live database requires the connected project database;
  this run had no database connected, so persistence could not be exercised end-to-end yet.

## C. Authentication and permissions

- Registration is email + password only; no OTP in the flow. If the provider still
  requires email confirmation, the UI says so truthfully instead of pretending.
- Password strength (>= 10 chars, mixed) enforced server-side; login/forgot/register are
  rate-limited; reset responses never reveal whether an account exists.
- Customers are protected by middleware plus owner-scoped queries, and by RLS as the
  second boundary. Documents live in a private storage bucket scoped by user id.
- Admin roles can only be granted via the `grant_staff` RPC which re-validates the
  actor's role in the database and writes an audit entry. Bootstrap works once, then
  permanently refuses.

## D. External integrations

| Provider | Purpose | Credentials | Tested live? |
|---|---|---|---|
| Supabase | database + auth | via platform env | schema applied? pending DB connection |
| Amadeus Self-Service | live flight fares | not configured | no — UI shows "request a quote" |
| Stripe | service-fee payments | not configured | no — webhook returns 503 |
| Resend | outbound email | not configured | no — send reports skipped |

None of these are simulated. Each boundary reports its unavailability honestly and the
corresponding feature degrades (quote request / payment disabled / no email).

## E. Quality checks

- Unit + SQL-invariant tests: 28/28 passing (`pnpm test`).
- Strict TypeScript is configured; a full `tsc --noEmit` and production build must run
  after the platform installs dependencies (installer use is platform-managed).
- Lint: not run this turn (toolchain install pending).

## F. Deployment

- Not deployed. The project database must be connected, migrations + seed applied, and
  environment variables set per `.env.example`. Then register a customer account and run
  `select bootstrap_first_super_admin('<user-id>', 'Name');` once.

## G. Remaining tasks (in order)

1. Connect the database (platform-provided), then apply the three migrations and the seed.
2. Run `pnpm install`, `pnpm typecheck`, `pnpm build` to close the toolchain loop.
3. Bootstrap the first Super Administrator (one SQL call, see README).
4. To enable live fares: Amadeus account + `AMADEUS_*` env vars.
5. To enable payments: approved Stripe account + `STRIPE_*` env vars; webhook endpoint
   `/api/webhooks/stripe`.
6. To enable email: Resend account + `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`.
7. Publish the two draft visa listings only after staff re-verify them against the
   embedded official source URLs.
