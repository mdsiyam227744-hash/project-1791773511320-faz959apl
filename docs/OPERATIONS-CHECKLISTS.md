# Operations Checklists — VisaBridge Global

Companion to `docs/DATA-OPERATIONS.md` (which covers airport/airline/route/fare
procedures in depth). This file holds: (1) the exact steps to authorize the
live flight provider, (2) the condensed first-records workflow for routes,
fares, and visa packages, (3) the first-work-day sequence. Every step maps to
an existing Admin Panel screen — no code changes required.

## 1. Authorizing the Amadeus flight provider

The code already implements the full live-search flow and every honest failure
state. The application activates automatically once the credentials exist —
there is nothing to deploy or enable in code.

**Get credentials (one-time, outside the app):**

1. Create an account at `https://developers.amadeus.com` (Self-Service tier;
   free, includes a test environment, no card required).
2. Create an app → you receive a **Client ID** and **Client Secret**.
3. The Self-Service free tier includes a monthly flight-offers quota; check the
   current quota in your Amadeus dashboard — this report does not restate
   marketing numbers. Terms of use and any production-upgrade request are
   handled in the Amadeus console.

**Configure (Vercel dashboard → project `prj_tRFQTAl4X8jXW8Zc4Rlregw2gp48` →
Settings → Environment Variables):**

| Variable | Value | Notes |
|---|---|---|
| `AMADEUS_CLIENT_ID` | your Client ID | server-side only; never expose |
| `AMADEUS_CLIENT_SECRET` | your Client Secret | server-side only; never expose |
| `AMADEUS_HOSTNAME` | leave unset | the app defaults to the **test** host. To go live: set to `api.amadeus.com` only after your Amadeus account is production-approved |

4. Redeploy after saving the variables (Vercel only injects new values on the
   next deployment).
5. **Verify for real:** open `/flights` → the panel must now be enabled (no
   "not configured" notice) → search DAC→LHR on a future date → results, or a
   specific error (quota/auth), appear with a timestamp and provider label.
   Empty results with valid params is a genuine provider answer, not a bug.
6. **Safety checks:** confirm the Client Secret appears nowhere in the repo
   (`git grep -i amadeus_client` → only this checklist line); confirm browser
   devtools network tab shows flight calls hitting your own API route, with the
   secret never transmitted to the browser.

**Rollback/kill-switch:** remove the two variables and redeploy → the page
returns to the honest "flight search not configured" state. No code change.

## 2. First verified airline route (end to end)

Goal: the platform's first route record that a customer can legitimately see.
Full rules: `DATA-OPERATIONS.md` §3.

1. **Airline:** Admin → Airlines → add the airline (name, 2-char IATA,
   3-char ICAO) with a source URL (official airline "about/fleet" page or
   IATA code directory). Save (starts **unverified**) → open the official
   source → **Verify**.
2. **Airports:** both endpoint airports must be **verified + active** in
   Admin → Airports (dataset rows exist for essentially all international
   airports; verify and activate the two endpoints if not already).
3. **Route:** Admin → Routes → pick origin + destination, choose direct or
   connecting, attach the **evidence URL** (official airline timetable/route
   map page or the provider's published route list). Save → **unverified**.
4. **Independent check:** a second person opens the evidence URL, confirms
   the route exists today, then sets status **Current** (or **Seasonal** with
   validity dates). The system records reviewer + timestamp; the database
   refuses Current/Seasonal without them.
5. **Public proof:** the airport directory/detail pages must now show the
   route; `/airports` shows only verified rows — spot-check that no
   unverified route leaked.

**Never:** invent a flight number, add operating days without a source, or
mark Current from memory.

## 3. First approved fare observation

Goal: the first indicative fare a customer can see, with complete provenance.
The form enforces these steps; agents should still understand them.

1. **Pick real endpoints** (autocomplete from the airport dataset — no free
   text), one-way or return, exact travel-date range, passenger count, cabin.
2. **Research** on the airline site or an authorized booking source; note the
   **observed price, currency, taxes-included or not, baggage assumption**.
3. **Record source URL + observation date.** No URL → cannot save as
   publishable.
4. Save (**draft**) → submit (**pending_review**) → second person reviews
   against the source → **published** (reviewer + time recorded) or rejected.
5. The system expires it automatically at validity date or 90 days, whichever
   first; expired references stop displaying as current immediately.
6. **Public proof:** the corridor/visa-package context shows it as
   "indicative reference — observed YYYY-MM-DD"; customers see the reconfirm
   notice.

**Never** label it cheapest/guaranteed/live/available; those words are
rejected by policy even if a form allows free text.

## 4. First destination-specific visa package

Goal: one corridor-specific package publicly visible with a correct
government-fee/service-fee split. Admin → Visa packages (super admin /
application manager).

1. **Research the official requirements first:** the destination government's
   immigration/embassy page for the applicant's nationality — record the
   **official fee, official source URL, and today's date**. If the fee varies
   by nationality, record the specific one that applies to your corridor.
2. **Create the package:** destination country (+ origin corridor if
   corridor-specific), visa category, tier (**only if the service scope
   actually differs** — do not fabricate tiers), included/excluded services,
   required documents.
3. **Fees:** official government fee amount + currency + official source URL
   (verification state stays unverified without it) · third-party cost notes ·
   VisaBridge service fee. The customer checkout shows the split — government
   fee is never our revenue.
4. **Timelines:** our service timeline in one field; the government's
   published processing time in another, with its source. Never merge them.
5. **Review + publish:** draft → published only after a second person checks
   the fee against the official source. Only published packages are public.
6. **Public proof:** the destination's visa page shows the package with the
   fee breakdown; confirm the government fee line is labelled as paid to the
   government, not to VisaBridge.

**Never** publish a package whose government fee lacks a source URL, and never
carry one country's checklist onto another country's package.

## 5. First work day — suggested order

1. Airports: spot-verify + activate the airports your first routes need (§2.2).
2. Airlines + routes for 1–2 corridors you actually serve (§2).
3. Fare observations for those same corridors (§3).
4. One visa package for one destination (§4).
5. Publish, then walk the public pages as a customer in both languages.
6. Only then consider corridors "live" on the homepage selector.

## 6. Standing rules (from the data rules, restated for agents)

- No source URL → nothing gets published. Ever.
- Second-person rule: the person who entered a record never approves it.
- An unverified record existing in the database is fine; an unverified record
  being *visible to customers* is a defect — report it immediately.
- Re-verify on cadence (`DATA-OPERATIONS.md` §8); withdrawal is a normal,
  healthy action, not a failure.
