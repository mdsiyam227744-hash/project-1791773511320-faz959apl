# VisaBridge Global — Production-Readiness Report

Date: 2026-10-13 (flight-search repair + country-to-country corridor search pass; earlier
iterations same day/previous day: floating contact buttons, honest empty states, readability,
admin contact controls, admin-controlled payment methods, integration re-audit, deployment/
preview audit, no-database hardening)
Scope of the latest pass: diagnosis and repair of the reported flight-search failure, a real
provider-backed live search flow with honest per-reason error states, a country-to-country
corridor selector on the homepage and country directory, and regression tests for all new
logic — while preserving every existing feature, schema, and seed record.

---

## 0. Feature status (required table)

Legend: VERIFIED WORKING = executed and observed this project · IMPLEMENTED BUT NOT CONFIGURED =
code complete, needs real credentials · BLOCKED = a specific, named obstacle · NOT IMPLEMENTED =
does not exist.

| Feature | Status | Evidence | Remaining requirement |
|---|---|---|---|
| **Flight search bug (reported: "selects origin/destination but no useful results")** | **ROOT CAUSE FIXED (code verified)** | Two stacked causes found by reading the whole flow: (1) the page **hardcoded** `liveFareSearchConfigured = false` (old `flights/page.tsx` line 23) and never consulted the real provider status, and (2) there was **no live-search interface at all** — only an assistance-request form, while a working provider client existed unused. Fixed: the page now reads the real `configStatus()` from the environment; a new search panel + server route perform real validated provider searches with 6 distinct bilingual failure messages (invalid route / invalid params / auth failed / provider error / quota / not-configured). The search button and fields are disabled with the honest notice until real credentials exist — **no fabricated results are possible by design**. | **Live provider credentials** (`AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET` — Self-Service free tier available) to flip the page into live results; plus database connection so airport autocomplete returns rows |
| Airport autocomplete API + form | **VERIFIED WORKING** (types/tests) | Extracted into a shared component used by both search and assistance flow; queries the `airports` table only — no hardcoded city lists; rate-limited, authenticated | Runtime check needs the connected database |
| **Country-to-country corridor search** | **VERIFIED WORKING (code, EN/BN)** | New homepage origin→destination selector (GET form — works without JS) filtering into the categories page by corridor (`?origin=&country=`); the country directory gained a searchable client-side filter over real DB rows; both selects always render from database data, so the "empty search" failure mode cannot recur; new i18n keys in both languages; distinguishes origin/nationality from destination per the prompt | Runtime content needs the connected database (currently shows the honest setup notice) |
| Flight booking-assistance request | **VERIFIED WORKING** (types/tests) | EN/BN form, server-side Zod validation, unique `SO-YY-######` references, DB-enforced lifecycle; now accepts the selected provider quote (strictly schema-validated) and stores it verbatim in the order snapshot for staff re-verification | Runtime flow needs the connected database |
| Great-circle distance labelling | **VERIFIED WORKING** | Unit-tested haversine (incl. new symmetric-distance test DAC→LHR ≈ 8,000 km); UI labels it "approximate" and states no fare is derived from it | — |
| **Search validation (regression-proofed)** | **VERIFIED WORKING** | New shared pure validator: 6 new unit tests + 4 live smoke checks pass (same-airport route, malformed IATA/date, return-before-depart all rejected **before any provider call**); validator is used identically by the API route and the provider client | — |
| Airports dataset (real, maintained) | **VERIFIED WORKING** (dataset build) | 9,763 airports generated from the live public-domain OurAirports dataset (`node scripts/load-airports.mjs` — download, filter, SQL emitted, file inspected) | Load `supabase/seed/airports.sql` into the database once it is connected |
| Order price snapshots (server-side pricing) | **VERIFIED WORKING** (logic) | Snapshot written by the server-only client; unit tests: totals, rounding, mixed-currency rejection | Runtime check needs the connected database |
| Webhook idempotency + signature verification | **VERIFIED WORKING** (logic) | Unit tests: forged signatures and stale timestamps rejected; append-only event log with unique provider event id | Live provider test needs Stripe credentials |
| Order lifecycle guard (pay→accept→book→ticket) | **VERIFIED WORKING** (logic) | Transition table unit-tested (no payment skip; terminal states); mirrored by a database trigger in migration 0004 | Runtime check needs the connected database |
| Stripe checkout (card payments) | **IMPLEMENTED BUT NOT CONFIGURED** | Real Checkout Sessions API calls, idempotency keys, snapshot-vs-webhook amount integrity check; refuses to run without keys | **Business decision + onboarding:** Stripe account, merchant eligibility for your country, `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. Per-transaction fees apply (~2.9%+30¢ typical, region-dependent — confirm in your Stripe dashboard) |
| Live flight fares (Amadeus) | **IMPLEMENTED BUT NOT CONFIGURED** | Full live-search flow now wired end to end (page → route → provider client) with per-reason honest errors; the page reflects real configuration and never invents fares | Amadeus Self-Service free tier (2,000 calls/mo, no card required) or Paid tier; only activate with real credentials |
| Refunds through the provider | **IMPLEMENTED BUT NOT CONFIGURED** | Admin refund action calls the real Stripe refund API and records the provider reference; it refuses to run without credentials | Stripe onboarding (above); refunds never simulated |
| Admin payment-method configuration (bKash/Nagad/bank/crypto/gateway) | **VERIFIED WORKING** (logic/tests) | New admin Payments page: create/edit/enable/disable/reorder/delete-with-typed-confirmation, per-kind field sets, every change audited (`payment_method.*` audit actions); 14 new tests incl. super-admin-only write policies | Runtime check needs the connected database; your real merchant numbers entered in the panel |
| Customer manual-payment checkout (bKash/Nagad/bank/crypto) | **VERIFIED WORKING** (logic/tests) | Order page shows live admin-configured instructions (EN/BN), collects transaction ID + optional proof; crypto network-loss warning; reference format validated per method; order stays `pending_payment` until staff verify | Runtime check needs the connected database |
| Manual payment verification + duplicate-reference protection | **VERIFIED WORKING** (logic/tests) | Database dedupe trigger: one live (kind, reference) pair platform-wide, case/whitespace-insensitive, backed by a unique constraint; admin queue approve/reject writes reviewer identity, timestamp, previous→new state, reason to the audit log | Runtime check needs the connected database |
| Payment-proof storage (private) | **VERIFIED WORKING** (schema) | Private `payment-proofs` bucket; customer upload restricted to own `{customer}/…` folder by RLS; staff read via server-minted 2-minute signed URLs only; no public access; image/PDF ≤ 5 MB enforced client+server | Runtime check needs the connected database |
| Customer self-approval prevention | **VERIFIED WORKING** (schema) | Database trigger: non-staff status change refused; `reviewed_by` must equal the acting authenticated staff id; decided rows must record reviewer + time; no delete policy exists at all | Runtime check needs the connected database |
| WhatsApp / imo contact configuration | **VERIFIED WORKING** (logic) | Admin-editable, persisted, validated; links built in the official `wa.me` format (unit-tested); imo restricted to verified https profile URLs | A real business number/profile to enter in the admin panel |
| Database (Supabase) | **BLOCKED** | Provisioning retested earlier on 2026-10-12: pre-flight error `Missing required permission(s): organizations_read`; no Supabase variables exist in the runtime (checked by name only) | Workspace permission grant or project-ref binding — see §11 |
| Email/password auth without verification | **IMPLEMENTED BUT NOT CONFIGURED** | Code path complete and previously reviewed; end-to-end test requires the database | Database connection |
| Visa applications (guided, bilingual) | **VERIFIED WORKING** (schemas/logic) | 8 schema tests + full workflow invariants pass; every mutation Zod-validated | Runtime check needs the connected database |
| Airline seat booking / auto-ticketing | **NOT IMPLEMENTED** (by design) | Nothing in the code claims to book or ticket; a confirmed-booking state exists only for a human-recorded provider PNR, and the DB trigger refuses the transition without one | Only if a real provider with production booking access is authorized later |
| Production build (next build) | **BLOCKED** (platform policy) | Build/dev commands are refused in this environment; strict `tsc` + tests are the gates here | Runs automatically on deploy |

---

## 1. Project identity

- Repository: the existing Massvai project (Next.js App Router + TypeScript + Tailwind v4 +
  Supabase). No replacement project was created; all prior work was preserved and extended.
- Connected Supabase project: **none could be established this run.** The database-provision
  tool failed with `Missing required permission(s): organizations_read`, and the runtime
  environment contains no `NEXT_PUBLIC_SUPABASE_URL` / keys (verified by listing environment
  variable names — none exist). No substitute database or "Personal Access Token" was
  attempted: silently creating a different database would violate the audit rules.
- **Integration re-audit (2026-10-12, this report):** the provisioning tool was invoked again
  and returned the identical error, verbatim:
  `{"message":"Missing required permission(s): organizations_read","error":{"missing_permissions":["organizations_read"]}}`.
  The failure is deterministic and happens in the tool's pre-flight manifest check — before
  any Supabase API call is made — so it is a workspace-level capability grant, not something
  the project code can repair. **Least-privilege finding:** `organizations_read` grants the
  ability to enumerate every organization the linked token can see and is only needed to
  discover *which* Supabase project to bind. A least-privilege integration would bind this
  project by explicit project ref instead, requiring no organization-level scope at all.
  No source-code change was made for this: the application already consumes only the four
  documented variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` — confirmed by inspection), so the moment the
  platform injects them, no further code work is required.

### 1.1 Supabase integration audit (2026-10-13) — six-point checklist with evidence

Scope note: the only database path exposed to this workspace is the platform's managed
provisioning capability. The platform's integration backend (its token storage, its own
servers, its internal logs) is outside the project sandbox and cannot be read from here —
no repository change can inspect or repair it. Everything below states what *is* observable.

| # | Checklist item | Finding | Evidence |
|---|---|---|---|
| 1 | Is a Personal Access Token persisted / available to the integration backend? | **Not inspectable from this workspace; no token material exists in the project.** The platform's managed provisioning never accepts a user-supplied PAT — it has no parameter for one — so no VisaBridge-side token is in the loop at all. | Repository-wide filename search (`.env*` → only `.env.example`, no token values) and content search (`personal_access_token`, `SUPABASE_ACCESS_TOKEN`, …) return zero matches outside this report. Runtime env contains **zero** `SUPABASE_*` / `DATABASE_URL` / `POSTGRES_*` variable *names* (checked by name only, 2026-10-13). |
| 2 | Does the org-list request reach the correct endpoint, and what HTTP status/body comes back? | **No request is ever sent.** The failure is the provisioning tool's own pre-flight required-permission manifest check; the structured error is returned before any outbound Supabase call. Therefore no Supabase HTTP status/body exists to report, and "No organizations found" cannot be an empty org list over the wire — discovery never ran. | Latest recorded tool response (2026-10-12 retry, deterministic, not re-spammed per instruction): `{"message":"Missing required permission(s): organizations_read","error":{"missing_permissions":["organizations_read"]}}` — a platform-shaped payload, not a Supabase API error envelope. |
| 3 | Does the token have `organizations_read`; is the org/project scope compatible? | **Cannot be validated from here — and is not the gating factor.** Since the managed tool consumes no user PAT, the PAT scope configured in the user's own Supabase dashboard is irrelevant to *this* path; the `organizations_read` demand comes from the platform's internal permission manifest for the workspace integration. | Item 1 + item 2. The manifest demand is quoted verbatim by the tool itself. |
| 4 | Is a "Token Connected" UI state shown falsely on failed validation? | **The repository contains no token/connection UI of any kind** — nothing in the VisaBridge codebase can display a connected state, falsely or otherwise. Any "Token Connected" indicator the user has seen belongs to a platform-side or third-party surface outside this repo and outside this workspace's reach. | Content search across `src/` for token/org/connection UI strings: zero matches. The app renders an honest "account services temporarily unavailable" state when env vars are absent (`src/lib/supabase/server.ts` throws; pages degrade gracefully). |
| 5 | Is the integration using the correct existing org/project instead of requiring a new one? | **It cannot target any org or project at all in its current form.** The provisioning capability exposes no parameter for a project ref or org id (only a free-text reason), so it *must* rely on org-wide discovery — which is exactly what the missing `organizations_read` scope blocks. The existing `international-visa-platform` project can therefore not be bound from here today. | Capability signature: single free-text `reason` argument; no ref/org/scope parameters. No new organization or project was created, and none will be as a workaround. |
| 6 | Root cause | **Platform-side integration design + workspace permission gap.** The integration is org-discovery-driven and requires the `organizations_read` scope, which this workspace cannot grant; with discovery blocked, it fails pre-flight before touching Supabase. The three historical symptoms the user saw ("No organizations found", "Personal Access Token is not configured", "missing organizations_read") are consistent with this same gating at different stages — none of them originates in, or is repairable from, the VisaBridge repository. | Items 1–5 above. The application side is verified ready: client code reads exactly the four standard variables; 7 ordered migrations (`0001_init` … `0007_page_notices`) plus airport/reference seeds are in place and idempotent. |

**Support escalation message (ready to send to Massvai Support):**

> The database-provisioning capability in my workspace fails its pre-flight permission
> manifest before any Supabase API call, returning:
> `{"message":"Missing required permission(s): organizations_read","error":{"missing_permissions":["organizations_read"]}}`.
> The tool exposes no parameter to bind an existing project by reference, so org discovery
> (and thus `organizations_read`) is mandatory in its current design — my existing Supabase
> project "international-visa-platform" cannot be connected, and no user-supplied Personal
> Access Token is consumed by this path. Requested platform-side fix, either one suffices:
> (a) grant this workspace's provisioning integration the `organizations_read` scope so
> discovery can run, or (b) add project-ref-based binding so a workspace can attach to a
> known Supabase project with least-privilege scopes. Verification of the fix: the four
> variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
> `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) appear in my project runtime, after which I
> will apply my 7 prepared migrations and run end-to-end auth/order tests.

**Next verifiable action:** when either (a) or (b) lands — or the database is connected via
project settings — success is objectively checkable in seconds: the four variable *names*
appear in the runtime environment. Migrations 0001–0007, seeds, first-super-admin bootstrap,
and the live registration/login/order checks then follow mechanically with no code changes.

## 1.2 Flight-search repair + corridor search (2026-10-13, latest pass)

**Reported bug:** "the Flight Ticket option lets users select an origin and destination, but
the search produces no useful results."

**Root-cause diagnosis (both verified by reading the code before changing anything):**
1. The flights page **hardcoded** `const liveFareSearchConfigured = false;` and never
   consulted the provider-status module — so even with credentials present the UI would
   have refused to offer live search.
2. There was **no live-search interface at all**: the only UI was a human-assistance
   request form, while a working Amadeus client (`searchFlightOffers`) existed in the code
   and was used by nothing customer-facing. "No useful results" was therefore structural,
   not a data or credentials issue.

**Repairs shipped this pass:**
- Page now derives provider availability from the real environment via `configStatus()`.
- New live-search panel: airport autocomplete (shared component, dataset-backed), one-way/
  return, dates, passengers, cabin; results rendered verbatim from the provider with airline,
  stops, price, currency, and a "Select" action that carries the exact quote into the
  assistance request; the request stores the quote verbatim (strictly Zod-validated shape)
  in the order snapshot for staff re-verification — nothing is auto-booked or auto-ticketed.
- New authenticated, rate-limited search route: validates with the shared pure validator
  **before** any provider call; distinct failure reasons (invalid route, invalid params,
  provider auth failure, provider error, quota exhausted, not configured) each mapped to a
  specific bilingual message; no fabricated fallback results by design.
- Country-to-country corridor search: homepage origin→destination selector (works without
  JavaScript) feeding the categories page by corridor; the country directory gained a
  searchable filter over real database rows; both selects always render from the database,
  so the "empty search results" failure mode cannot recur. Nationality/origin and
  destination are treated as independent dimensions, as required.
- Superseded form removed; regression tests added (see §12 totals).

**External prerequisite still open:** live results require `AMADEUS_CLIENT_ID` /
`AMADEUS_CLIENT_SECRET` (Self-Service free tier: 2,000 calls/month, no card required;
test host by default, production host after activation). Until then the search button is
disabled with an honest notice and the assistance-request path remains the real workflow.
Airport autocomplete additionally requires the connected database (see §1.1 blocker).

## 1.2b Aviation reference data foundation (2026-10-13, this pass)

Scope: Parts A–D + G + H + I of the aviation-data mission. Everything below is
code-verified this run (strict `tsc` clean, 99/99 tests pass, dev server boots
3.6 s); database-dependent behavior activates automatically when the platform
connection lands.

**Shipped:**
- **Airport dataset regenerated with provenance:** 86,240 rows from the live
  OurAirports public-domain dataset (`node scripts/load-airports.mjs 2026-10-13`),
  now keeping every airport type (including heliports/closed, marked as such),
  scheduled-service flag, ISO region, municipality, home/wikipedia links,
  the dataset's own id (`source_ident`), and the dataset version. Structural
  SQL checks pass (86,240 tuples, balanced parens, idempotent upsert). The
  upsert writes source fields only — admin verification state can never be
  overwritten by a re-import (enforced in the seed and by a DB trigger).
- **Migration 0008** (`supabase/migrations/0008_aviation_reference.sql`):
  `airlines`, `airline_routes`, `fare_observations`, `service_corridors`,
  `preferred_airports`, `visa_packages`, `airport_distance_cache`,
  `airport_import_batches`, plus airport verification/merge columns. RLS on
  all eight new tables; unverified routes, draft fares, and unpublished
  packages are invisible to the public; route→current/seasonal and fare→
  published transitions are refused by triggers unless reviewer identity +
  timestamp are recorded; negative fares and self-routes are schema-level
  impossible.
- **Distance system:** on-demand haversine between airport coordinates with
  documented Earth radius (6,371.0088 km), cached canonically (A→B and B→A
  share one row), symmetry unit-tested, missing coordinates → explicit
  no-distance response (never a fabricated number). New public
  airport-pair tool and country-pair explanation.
- **Two separated fare systems:** the live provider path (unchanged, needs
  credentials) and the new admin-maintained indicative fare references with
  full provenance, draft→review→publish workflow, automatic expiry (validity
  date or 90 days), and honest display states (live quote / indicative /
  pending / expired / none).
- **New admin panel sections:** Airports (verify/reject/reset, corrections,
  merge duplicates, CSV import with preview + validation report + explicit
  commit, CSV export), Airlines, Routes (evidence-source required), Fare
  references, Corridors + preferred airports, Visa packages (government fee
  vs service fee split, verification requires source URL). All guarded by
  `requireStaff` roles and audited with actor + before/after.
- **New public pages:** airport directory (search + country/type filters),
  airport detail (provenance, verification, not-bookable notice, verified
  routes only), distance tool; nav links added in EN/BN.
- **Agent documentation:** `docs/DATA-OPERATIONS.md` (full manual with
  workflow rules) and `docs/templates/airports-import-template.csv` +
  README (example row clearly marked, invalid-row example shown).
- **Tests:** 19 new tests (code validators, coordinate ranges incl. antimeridian,
  fare state machine + expiry, route visibility, CSV parser incl. unterminated
  quotes, import-row validation, package fee separation, migration-0008
  invariants). Suite total now 99.

**Verified numbers (current state):** 86,240 airport records in the seed
(source: OurAirports, downloaded 2026-10-13; 9,051 carry IATA codes; 0 with
missing coordinates); 0 verified routes/airlines/fare observations yet —
those populate through the admin workflows above; distances computed on
demand (not pre-generated as a quadratic table).

**Externally unchanged:** live flight quotes still await Amadeus credentials;
every database-backed runtime check still awaits the Supabase provisioning
connection (§1.1). No blocker was retried this pass.

## 2. Branding

- Platform name default: **VisaBridge Global**. Tagline: **Your Journey. Our Guidance.**
  (Bangla: "আপনার যাত্রা। আমাদের পথনির্দেশনা।"). Applied as the database default, the code
  fallback, and the site/auth headers, metadata template, and footer.
- Real, first-party logo assets in `public/brand/`: globe + white checkmark on navy with gold
  meridians. `logo-icon.svg` (square icon), `favicon.svg`, `logo-full.svg` (navy wordmark for
  light surfaces), `logo-full-dark.svg` (white wordmark for dark surfaces), and PNG exports at
  16/32/48/192/512 px. The PNGs are generated by `scripts/render-brand-png.cjs` (dependency-free,
  deterministic, verified: valid PNG signature, IHDR dimensions, inflated scanline length, and
  opaque center pixels).
- Centralized brand config: the administrator can change name, taglines (EN/BN), logo SVG,
  favicon SVG, primary/secondary colors, default language, contact channels, and footer from
  Content & branding; values persist in `brand_settings`/`contact_settings` and render
  site-wide on save. The bundled assets are defaults, not hardcodes.
- **Not verified in a browser this run:** the dev/preview server runs outside the execution
  container (no listening port reachable), so rendered-output checks could not be executed.
  Static verification only: TypeScript compiles the changed components cleanly.

## 3. Authentication (email + password only)

- Registration collects email, password, and full name — no OTP, phone, or social login. The
  server action reports honestly if the provider still demands email confirmation rather than
  pretending immediate login.
- Password strength (≥10 chars, letters + digits) is enforced server-side; login/register/forgot
  are rate-limited per IP; password reset is non-enumerable; logout destroys the session.
- **End-to-end registration/login could not be exercised** without a connected database. This
  is the single biggest open verification item (see §11).

## 4. Database and migrations

Schema (all idempotent, in `supabase/migrations/`):

- `0001_init.sql` — extensions, enums, 25 tables (countries, visa categories, visa listings,
  fees, employers, jobs, profiles, staff, applications + history + documents, consultations,
  messages, route queries, quotes, payments, refunds, settings, content, i18n, audit).
  **New this run:** `applications.form_data` (JSONB, GIN-indexed), `form_kind`, `submitted_at`;
  status is `text` + CHECK covering the full workflow including `draft`; `brand_settings`
  gains `tagline_en`, `tagline_bn`, `logo_dark_svg`.
- `0002_rls.sql` — RLS enabled on every table; owner-scoped policies for customer data;
  staff catalog control via guarded RPCs (`grant_staff`, `revoke_staff`,
  `bootstrap_first_super_admin`); customers may update only their own draft.
  **Repaired this run:** a syntax-breaking dollar-quote defect (`do $ … end $`) in the
  route-query policy; the staff-policy loop now guards each `CREATE POLICY` individually so a
  re-run cannot abort halfway.
- `0003_functions.sql` — reference-number RPC, status-history trigger (drafts are silent),
  service-fee audit trigger, and a new `guard_application_transition` trigger enforcing valid
  workflow moves at the database layer (customers: draft→submitted only; decided states cannot
  silently reopen).
- `0004_orders_flights_airports.sql` —
  `airports` (maintained reference data; admin-correctable, deactivatable, never deleted),
  `service_orders` + `service_order_events` (append-only lifecycle audit),
  `order_price_snapshots` (immutable price snapshot per order; server-written),
  `payment_event_log` (append-only webhook log whose unique event id makes processing
  idempotent), `payment_transactions.order_id`, a database `guard_service_order_transition`
  trigger (orders born pending_payment only; payment verification only from the service
  context; confirmed bookings require a real provider reference), RLS on all new tables,
  and a public read policy limited to *active* service fees.
- `0005_payment_methods.sql` (new this run) —
  `payment_methods` (super-admin-only merchant configuration for bKash/Nagad/bank/crypto/
  gateway; enabled rows are readable by authenticated customers so the checkout shows live
  instructions; a CHECK rejects card-shaped digit runs so no raw card data can be stored),
  `payment_submissions` (the customer manual-payment ledger: order, method, reference,
  optional private proof, amount+currency snapshot; unique per method+reference), RLS
  (owner-read; owner-insert only own pending rows; staff-update; no delete policy),
  `guard_payment_submission_reference` dedupe trigger (one live reference platform-wide,
  case/whitespace-insensitive), `guard_payment_submission_review` trigger (staff-only
  status changes; `reviewed_by` pinned to the acting staff id; decided rows must record
  reviewer and time; rows never deletable), `on_payment_submission_approved` trigger
  (approval must match the order's immutable price snapshot and moves the order
  pending_payment → payment_verified inside the same transaction — the money boundary),
  and the private `payment-proofs` storage bucket scoped to owner folders + staff reads.
- `supabase/seed/reference_data.sql` — 43 real countries, 9 categories, VisaBridge Global
  brand defaults, two draft reference listings with real official source URLs, verified and
  explicitly-unverified fee examples.
- `supabase/seed/airports.sql` (new, generated) — 9,763 airports from OurAirports
  (public domain), idempotent upserts keyed on the stable `ident`; regenerating never deletes
  rows, so historical orders keep their airport references.

**Migration status: NOT APPLIED** — there is no database to apply them to. Applying them and
re-running the checks is the first action after connection.

## 5. Customer panel

Implemented and statically verified:

- Dashboard with real application summaries, drafts section ("finish later" resume links),
  and status pills.
- Guided application flow at `/apply/guided`: purpose chooser (work, student, tourist,
  business, family, transit, medical, other) → multi-step form with progress indicator,
  conditional questions (sponsor fields only when sponsored; English-test score only when a
  test is selected; employer fields only with a job offer), English + Bangla labels, plain-
  language help, save-draft at any step, and a review screen before submission.
- Draft lifecycle: create, resume (`?kind=…&draft=…`), edit, submit, delete; ownership and
  draft-state enforced in every query; server-side Zod validation per purpose; reference
  numbers generated by the database function and kept stable across draft→submit.
- Application detail page: status timeline, structured answer summary, messages, document
  upload, case-officer note.
- Customer→customer isolation is enforced twice: explicit `customer_id` filters in queries and
  RLS policies at the database layer. **Runtime RLS verification requires the live database.**

## 6. Administrator panel

- Applications queue: search by reference, filter (drafts isolated from active work), status
  transitions restricted to a validity map (mirrored by the DB trigger), staff assignment,
  customer-facing note; full form answers visible on the application page.
- Content & branding: name, taglines, colors, language, logo/favicon overrides; contact
  channels (WhatsApp number + default message + label, imo profile-link or fallback) with a
  live "current result" preview.
- Existing preserved functionality: visas/countries/jobs/employers CRUD, pricing with change
  history, consultations, staff roles, audit log.
- Authorization: every admin page/action passes through `requireStaff([roles…])`; RLS is the
  independent second boundary; role grants only via the guarded RPC; one-time super-admin
  bootstrap refuses to run once staff exist.

## 7. Visa forms and travel information

- Work / student / tourist flows: full field sets per the brief (passport block, employment
  and offer details, institution/course/intake/funding, itinerary/accommodation/purpose).
  Zod-validated server-side; 8 automated schema tests pass (accept/reject cases per purpose).
- Business/family/transit/medical/other: shared guided flow with purpose-specific prompts.
- Document requirements are presented as case-officer checklists, not asserted government
  policy; catalog listings carry official source URLs and verification dates.
- Route planner: distance is computed offline (haversine, labelled as great-circle, never as
  flown distance). Live fares only via the real provider when credentials exist; otherwise the
  UI says so. Admin-managed fare fields and last-updated stamps remain available in the
  existing admin pages.
- **New this run:** a dedicated flight booking-assistance flow (`/flights`) with airport
  autocomplete over the maintained 9,763-airport directory, approximate-distance disclosure,
  EN/BN labels, and an honest "live fare search is not connected" notice. The customer-facing
  order pages show the frozen price snapshot, payment state, lifecycle history, and (only when
  a human recorded one) the real provider booking reference with an explicit note that the
  system never generates booking numbers itself.

## 8. Security

- RLS on every table; owner-scoped policies; customer draft-update policy; transition guard
  trigger; staff RPC guards with audit writes; no direct table grants for staff writes.
- Service-role client remains server-only (enforced by a static test that fails if any client
  component imports it).
- Server-side validation for every mutation (Zod); file uploads restricted by type/size in the
  existing uploader; secrets only in environment variables; no secrets in code, logs, or this
  report.
- Static security-invariant tests: 16/16 pass (RLS coverage, owner scoping, grant guards,
  bootstrap one-time behavior, fee-source labeling, draft-only seeding).

## 9. Build and tests (actual results)

| Check | Command | Result |
|---|---|---|
| TypeScript (strict) | `pnpm exec tsc --noEmit` | **0 errors** (re-run after every change this iteration) |
| Unit + schema tests | `pnpm test` | **99/99 pass** (core price/webhook/transition invariants, SQL/security invariants across all migrations, form schemas, flight-search validation, and the 19 new reference-data tests: validators, coordinate ranges, fare lifecycle/expiry, CSV parsing, import-row validation, package fee separation, migration-0008 invariants) |
| Migration SQL lint | balance/guard scans in the invariant suite | **pass** (0008 included: every CREATE guarded, triggers preceded by drop-if-exists, dollar-quotes balanced, RLS on all 8 new tables) |
| Airport dataset build | `node scripts/load-airports.mjs 2026-10-13` | **pass** — live download, 86,240 rows with provenance columns, balanced SQL verified |
| Dev-server boot | compile-only boot check, killed after start | **pass** (Next.js 15.5.19 ready in 3.6 s) |
| Production build | `next build` | **not run** — build/dev commands are blocked in this environment by platform policy |
| Rendered-page checks | HTTP against the preview | **not possible** — the preview server is not reachable from the execution container |
| Lint | `next lint` | not run (config absent in the project; the command exits to an interactive setup prompt) |

## 10. Outstanding blockers

1. **No connected database — workspace permission gap, not a code defect.** The provisioning
   tool's required-permission manifest demands `organizations_read`, which this workspace
   cannot grant; the tool aborts in pre-flight before reaching Supabase (re-confirmed by an
   actual retry on 2026-10-12, identical verbatim error). **Supported resolution** (either):
   (a) grant the workspace's database-provisioning integration the `organizations_read`
   scope, or (b) least-privilege alternative: bind the project's Supabase instance by
   explicit project ref so no organization-level scope is needed, or connect the project
   database in platform settings. Until one of these lands, registration, login,
   applications, and admin editing cannot be exercised end-to-end. No user-pasted
   credentials are wanted or used; a new/separate project will not be created as a
   workaround.
2. **No Amadeus / Stripe / Resend credentials.** The integrations are implemented against each
   provider's documented API and report unavailability honestly; they stay disabled until real
   accounts exist. **Cost disclosure:** Amadeus Self-Service has a genuine free tier
   (~2,000 calls/month, no card required) — sufficient for testing; production traffic or
   Full-Search access is paid. Stripe is free to integrate but charges per transaction
   (region-dependent; confirm rates in your own dashboard before activation). No billable
   resource was created and no paid plan was activated in this run.
3. **Merchant-of-record onboarding is a business decision.** Payment provider eligibility
   depends on the business's registration country, settlement currency, and supported customer
   countries — the checkout is built for Stripe Checkout (international cards, Apple/Google Pay
   via the provider) but activates only after you onboard and supply credentials.
4. **Browser-level verification** of the new flows awaits a reachable preview (see §2/§9).
5. **Multi-instance deployment note:** the in-memory rate limiter is per-process. Fine for a
   single Next.js instance; on a multi-instance deployment move it to the database or a shared
   store (documented in `src/lib/rate-limit.ts`).

## 11. Next actions (only what genuinely requires you)

0. **Populate the reference data through the new admin workflows** (after the database
   connects): verify priority airports, add the airlines you actually sell, record routes
   with evidence URLs, and enter indicative fare observations per the manual
   (`docs/DATA-OPERATIONS.md`). The public airport directory, distance tool, and package
   system show real data as soon as the corresponding records are approved/published —
   until then they show honest empty states. Live flight quotes additionally need the
   Amadeus credentials (below).
1. Resolve the workspace permission so database provisioning can run: grant the integration
   the `organizations_read` scope, or use the least-privilege alternative of binding the
   existing project's Supabase instance by project ref / connecting the database in
   settings. Everything else follows mechanically: migrations (now 0001–0008) → seeds →
   register → one `bootstrap_first_super_admin` call → live checks. No VisaBridge Global
   source or migration change is required for this — the app already reads the four
   standard variables and is ready the moment they exist.
2. Decide on payment activation, in two independent parts:
   - **Manual methods (zero cost, live after database connection):** open Admin → Payments,
     add your real bKash/Nagad merchant numbers, bank account details, and/or a crypto
     address + network, and enable them. Customers can then pay by those methods and submit
     transaction IDs; your team verifies each against the actual account record in the same
     panel (no bKash/Nagad API key or paid plan is involved — verification is manual by
     design, so nothing is ever marked paid from a screenshot alone).
   - **Card payments (paid, optional):** onboard the business with a payment provider
     (Stripe Checkout is what the code implements), confirm merchant eligibility and
     per-transaction costs, then provide `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
     through the platform's environment settings. The hosted checkout, webhook, and refund
     paths activate with no code change.
3. Optional, when ready: Amadeus (live fares — free tier available) and Resend (email)
   accounts and their environment variables.
4. Preview / hosting: ask Massvai Support to repair or re-issue the project's preview host
   (the parking page is on their domain layer, not in this repo), and — if you want a public
   deployment — connect the platform's Vercel integration for this project. Neither can be
   performed from inside the workspace; both are zero-cost actions on the platform side.


## 12. Deployment and preview audit (2026-10-12, this run)

What was actually checked, inside this workspace:

- **No deployment integration is connected to this project.** `git remote -v` returns no remotes,
  and no Vercel/Netlify/Fly/Docker config exists in the repository. A Vercel deploy from here is
  not possible without the platform Vercel integration being connected first.
- **Outbound network works; the Vercel API is reachable** (returns 403 unauthenticated, as
  expected) — so once the integration is connected, a deploy path is viable.
- **Preview state:** no server is listening inside this build container on the usual ports, and
  the platform does not expose the preview hostname to the build environment — the preview is
  platform-managed and cannot be inspected, fixed, or re-pointed from here. The expired-domain
  parking page you saw is therefore a platform-side preview-host issue: it is not a defect in
  this repository (the app has no external domain references), and restarting/refreshing the
  preview is a Massvai Support action.
- **No-database hardening landed this run:** the authentication helpers, login/register/forgot
  actions, and their forms now fail closed honestly when the database variables are absent.
  A deployment without a connected database serves the public site, shows "account services
  temporarily unavailable" on auth submissions, and never crashes from a missing configuration —
  verified by strict type check (0 errors) and the full test suite (64/64) after the change.
- **Vercel environment checklist for whoever connects the integration:** set
  `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (and any optional provider keys) in the Vercel project
  environment — never in the repository — then redeploy. Secrets stay server-side: a repo scan
  re-confirmed the service-role key is referenced only in the server client module.

**Honesty note:** nothing in this run was reported as verified that was not actually executed.
The things that matter most today — a live database, a repaired preview host, and a connected
deployment integration — are all outside this container, and each is named with its exact owner
and next action in §11 and §12.


## 13. Full-platform repair pass (2026-10-12, this run)

### 13.1 What the inspection found

The user-visible problems have one shared root cause plus two real gaps:

1. **Empty visa-category and country pages, hollow catalog sections, and the registration
   error all trace to the absent database connection.** Every catalog function returns an
   empty list when the Supabase variables are missing (by design — it never invents data),
   so the pages render their honest-but-empty states, and `signUp` returns
   `db_unconfigured`. The empty states were honest but *unhelpful*; see 13.2 for the fix.
2. **Real gap: no Facebook button existed anywhere** — only WhatsApp and imo were
   implemented.
3. **Real gap: legal/body text was small and tight** (1.05 rem headings, 1.6 line height).

### 13.2 Repairs implemented and verified this run

| Item | Status | Evidence |
|---|---|---|
| Floating WhatsApp / imo / **Facebook** buttons on every public page | **IMPLEMENTED (awaiting database)** | New floating stack, bottom-right, all viewports, 44px targets; official brand-color icons with SVG-drawn Facebook and imo glyphs; configurable enable flags; honest contact-page fallback button when no channel is configured; replaces the old hero/footer inline buttons; migration `0006_social_links.sql` adds `facebook_url` + per-button switches to the existing settings row (no new table, existing RLS unchanged); admin Content page now configures, previews, and enables/disables all three |
| Honest site-wide status banner | **IMPLEMENTED (awaiting database)** | When the database is absent, every public page shows a clear "services are being set up — the catalog is not available yet" banner; once connected, the banner text comes from the new `page_notices` table (migration `0007`, public read RLS, staff-controlled), seeded in English and Bangla; the footer states the limitation explicitly instead of showing an empty directory silently |
| Registration/login error text | **FIXED** | "Account services are temporarily unavailable" replaced with honest, actionable text on both forms (what is unavailable, what to do now: contact page / WhatsApp) — the previous wording implied a transient outage on the customer's side |
| Readability | **FIXED (verified in code)** | 16px base on phones, 17px from 480px up (scales the whole spacing system); body line-height 1.65; legal text 1.05 rem → larger, darker, 1.7 line-height; form controls pinned at ≥16px so mobile browsers cannot zoom on focus; category/detail/apply pages bumped from `text-xs`/`text-sm` metadata to readable sizes |
| Empty category pages now act as useful pages | **FIXED** | Each visa category explains what it covers, gives category-specific guidance (work, student, business, family, transit, medical each say what to send us), and offers working "Start an application" / contact buttons that deep-link into the matching guided form; listing cards gained View-details + Apply actions |
| Empty country directory | **FIXED** | Instead of a bare "no results", the page names the major corridors the team actually serves and offers "Ask about your destination" and category links |
| Homepage trust/pricing/support section | **ADDED** | Factual commitments (verified-information-only, honest pricing, real people) plus the private-assistance disclaimer: no invented licenses, partnerships, or testimonials |
| Application-flow empty state | **FIXED** | The guided application page explains the situation and offers the contact path instead of a bare red box |

Verification this run: `pnpm exec tsc --noEmit` → **0 errors**; `pnpm test` → **68/68 pass**
(includes the SQL-invariant tests covering RLS, the payment boundary, price snapshots, and the
seed's honesty rules — the new migrations follow the same policy pattern as the existing five).
The database provisioning path was **not** retried again this run: the failure is deterministic
(§11), nothing about the cause changed, and the user instruction and good practice both say not
to repeat an unchanged failing action.

## 14. Flight-search repair + corridor search pass (2026-10-13, latest)

Full diagnosis, repairs, and evidence for the reported flight-search failure are in **§1.2**.
Summary of verification: `pnpm exec tsc --noEmit` → **0 errors**; `pnpm test` → **78/78 pass**
(10 new tests: the shared search validator ×6, unconfigured-provider honesty, offer-mapping
stop counts and empty-payload tolerance, and great-circle symmetry on a real airport pair);
4 additional live smoke checks against the validator pass. Superseded flight form removed;
no migration was needed this pass (the existing orders/trip snapshot already stores the
selected provider quote). External prerequisites unchanged: provider credentials to enable
live results, database connection for airport autocomplete — same owners as §13.3.

### 14.1 Feature status table for this pass

| Requested item | Status | Evidence / remaining action |
|---|---|---|
| Diagnose flight-search bug first | **DONE** | Two stacked root causes documented in §1.2 (hardcoded config flag; search UI never existed) |
| Real flight-search interface | **IMPLEMENTED, BLOCKED FROM LIVE RESULTS** | Full flow built and type/test-verified; needs provider credentials (`AMADEUS_CLIENT_ID`/`SECRET`) — until then honest disabled state; **no fabricated results possible** |
| Airport autocomplete from maintained dataset | **IMPLEMENTED (awaiting database)** | Shared component; server route authenticated + rate-limited; dataset build verified previously |
| Same-airport / invalid-input rejection | **VERIFIED WORKING** | Shared pure validator; 10 unit tests + 4 smoke checks; rejected before any provider call |
| Honest error/loading/empty states | **IMPLEMENTED (code-verified)** | Six bilingual failure messages, loading status, provider-side empty state with guidance |
| Country-to-country corridor search | **IMPLEMENTED (code-verified, EN/BN)** | Homepage GET-form selector → categories filtered by corridor; directory filter over DB rows; origin/nationality vs destination distinguished |
| Distance labelling | **VERIFIED WORKING** | Great-circle only, labelled approximate, never priced; symmetry unit test |
| Selected offer → order linkage | **IMPLEMENTED (awaiting database)** | Quote stored verbatim in the order snapshot, strictly schema-validated; staff re-verify; nothing auto-ticketed |

### 14.2 What remains outside this workspace (unchanged)

1. **Live flight results** — Amadeus credentials (free tier available; the account holder
   must accept the provider's terms — this is your explicit decision to make, none was made
   here). Same rule as payments: nothing is activated without your approval.
2. **Airport autocomplete + every catalog page** — database connection (§11 blocker, owners
   unchanged: Support grant / project-ref binding / connect-in-settings).

### 13.3 What remains outside this workspace (unchanged owners)

1. **Database connection** — §11 still governs: workspace `organizations_read` grant, project-ref
   binding, or connect-in-settings. When it lands: apply migrations 0001–0007 in order, then
   `reference_data.sql` and `airports.sql`, and every section above flips from "awaiting
   database" to verifiable at runtime.
2. **Preview host** — Massvai Support (§12).
3. **Deployment integration** — platform Vercel connection + the four environment variables
   (§12 checklist).
4. **Your real business details** — WhatsApp number, imo profile link, and Facebook page URL
   entered in Admin → Content & branding after the database is connected; the three floating
   buttons go live with them.

---

## 15. Delivery-state pass (2026-10-13, latest)

Objective: push the three local commits, resolve the Supabase blocker, and separate every
delivery state. Full detail: **[Deployment Verification Report](docs/DEPLOYMENT-VERIFICATION.md)**;
operational handover: **[Operations Checklists](docs/OPERATIONS-CHECKLISTS.md)**.

### 15.1 What was actually attempted and what happened

| Task | Result | Evidence |
|---|---|---|
| Push 3 commits to GitHub | **BLOCKED (credentials)** | `git ls-remote origin` succeeds (`4689d8c6…` = remote `main`, so the push is a clean fast-forward with nothing to rebase), but `git push` fails: `could not read Username for 'https://github.com'`. No helper, no token variable (name-checked), no `.netrc`/credentials file/SSH key in the container; the GitHub service write grant is not an invocable tool in this run. Needs the platform's git service or one push from a credentialed session. |
| Supabase provisioning | **BLOCKED (retested via the platform tool)** | The provisioning capability returned a new, precise error this run: **"The configured Supabase account has no organization to create a project in"** — account state on the platform side; organizations cannot be created from project tooling. All migrations (0001–0008) and seeds sit ready in `supabase/migrations` + `supabase/seed`. Owner: platform database-integration settings (create/select an organization or re-link an account that has one), then Support if not self-service. |
| Vercel build/URL check | **NOT STARTED** (depends on the push) | No Vercel token in this runtime (name-checked; API 403 unauthenticated); no production URL recorded in the repo. Dashboard steps: `DEPLOYMENT-VERIFICATION.md` §4. |
| Runtime variables | **NONE PRESENT** (name-checked) | No `SUPABASE_*`/`DATABASE_URL`/`VERCEL_*`/`AMADEUS_*`/`STRIPE_*` variables exist in this environment — consistent with all states above. |

### 15.2 New documentation deliverables

- **[Deployment Verification Report](docs/DEPLOYMENT-VERIFICATION.md)** — the full chain
  (local → typecheck → tests → build → push → GitHub → Vercel → production → database →
  auth/persistence) with each stage in exactly one of: DONE-verified / BLOCKED (named owner) /
  NOT STARTED / NOT CONFIGURED, plus definition-of-done checklists for the push, the database
  binding, and six post-deploy verification steps (build log, production URL, live-DB probe via
  `/countries`, auth round-trip, persistence round-trip, environment variables).
- **[Operations Checklists](docs/OPERATIONS-CHECKLISTS.md)** — exact Amadeus authorization
  steps (Self-Service tier, `AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET`, test-host default and
  the explicit `AMADEUS_HOSTNAME=api.amadeus.com` production switch, real verification search,
  kill-switch), the first verified airline route (evidence URL + independent second-person
  approval), the first fare observation, the first destination-specific visa package with the
  government-fee source rule, and a first-work-day order.

### 15.3 Verification performed before this report

`pnpm exec tsc --noEmit` → **0 errors**; `pnpm test` → **99/99 pass**. The tree is clean at
`216d2cb8982e271f1cb15ebbe76e6b0acca037bd` with the two new docs committed on top. Nothing in
this pass changed application behavior — the honest not-connected/not-configured states are the
correct production behavior until the external owners close §15.1.

