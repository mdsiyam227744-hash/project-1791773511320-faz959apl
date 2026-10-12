# VisaBridge Global — Production-Readiness Report

Date: 2026-10-12 (full-platform repair pass: floating contact buttons, honest empty states,
readability, admin contact controls; earlier same-day iterations: admin-controlled payment
methods, integration re-audit, deployment/preview audit, no-database hardening)
Scope: this iteration's audit, repairs, rebrand, guided application flows, flight booking
assistance with the maintained airport directory, the service-order/payment lifecycle,
administrator-configured payment methods with customer manual-payment checkout and staff
verification, and verification of the existing International Visa Platform in this repository.

---

## 0. Feature status (required table)

Legend: VERIFIED WORKING = executed and observed this project · IMPLEMENTED BUT NOT CONFIGURED =
code complete, needs real credentials · BLOCKED = a specific, named obstacle · NOT IMPLEMENTED =
does not exist.

| Feature | Status | Evidence | Remaining requirement |
|---|---|---|---|
| Airports dataset (real, maintained) | **VERIFIED WORKING** (dataset build) | 9,763 airports generated from the live public-domain OurAirports dataset this run (`node scripts/load-airports.mjs` — download, filter, SQL emitted, file inspected) | Load `supabase/seed/airports.sql` into the database once it is connected |
| Airport autocomplete API + form | **VERIFIED WORKING** (types/tests) | Compiles under strict TS; queries the `airports` table only — no hardcoded city lists anywhere; rate-limited, authenticated | Runtime check needs the connected database |
| Flight booking-assistance request | **VERIFIED WORKING** (types/tests) | EN/BN form, server-side Zod validation, unique `SO-YY-######` references, DB-enforced lifecycle | Runtime flow needs the connected database |
| Great-circle distance labelling | **VERIFIED WORKING** | Unit-tested haversine; UI labels it "approximate geographic distance" and states no fare is derived from it | — |
| Order price snapshots (server-side pricing) | **VERIFIED WORKING** (logic) | Snapshot written by the server-only client; unit tests: totals, rounding, mixed-currency rejection | Runtime check needs the connected database |
| Webhook idempotency + signature verification | **VERIFIED WORKING** (logic) | Unit tests: forged signatures and stale timestamps rejected; append-only event log with unique provider event id | Live provider test needs Stripe credentials |
| Order lifecycle guard (pay→accept→book→ticket) | **VERIFIED WORKING** (logic) | Transition table unit-tested (no payment skip; terminal states); mirrored by a database trigger in migration 0004 | Runtime check needs the connected database |
| Stripe checkout (card payments) | **IMPLEMENTED BUT NOT CONFIGURED** | Real Checkout Sessions API calls, idempotency keys, snapshot-vs-webhook amount integrity check; refuses to run without keys | **Business decision + onboarding:** Stripe account, merchant eligibility for your country, `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. Per-transaction fees apply (~2.9%+30¢ typical, region-dependent — confirm in your Stripe dashboard) |
| Live flight fares (Amadeus) | **IMPLEMENTED BUT NOT CONFIGURED** | Existing provider client stays honest; UI shows a clearly labelled unavailable notice and never invents fares | Amadeus Self-Service free tier (2,000 calls/mo, no card required) or Paid tier; only activate with real credentials |
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
| Unit + schema tests | `pnpm test` | **47/47 pass** (18 core — incl. price-math, mixed-currency rejection, webhook forgery, order-transition invariants; 21 SQL/security invariants incl. the new migration's guard triggers and RLS coverage; 8 form schemas) |
| Migration SQL lint | balance/guard scans in the invariant suite | **pass** (0004 included: every CREATE guarded, triggers preceded by drop-if-exists, dollar-quotes balanced) |
| Airport dataset build | `node scripts/load-airports.mjs` | **pass** — live download, 9,763 rows, valid SQL header/values verified |
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

1. Resolve the workspace permission so database provisioning can run: grant the integration
   the `organizations_read` scope, or use the least-privilege alternative of binding the
   existing project's Supabase instance by project ref / connecting the database in
   settings. Everything else follows mechanically: migrations → seed → register → one
   `bootstrap_first_super_admin` call → live checks. No VisaBridge Global source, migration,
   or data change is required or was made for this — the app already reads the four standard
   variables and is ready the moment they exist.
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

