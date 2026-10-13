# Data Operations Manual — VisaBridge Global

Audience: authorized agents and administrators who research, enter, verify, and
publish reference data (airports, airlines, routes, indicative fares, visa
packages, corridors). Everything in this manual maps to a screen in the Admin
Panel; nothing requires code changes.

## 0. The four rules every record obeys

1. **Provenance.** Every published record carries its source and the date it
   was observed or verified. No source, no publish.
2. **Verification states are explicit.** `unverified → verified` (or
   `rejected`) for airports/airlines; `draft → pending_review → published /
   rejected / withdrawn` for fare observations; `unverified → current /
   seasonal / suspended / discontinued` for routes. Customers never see
   unverified rows.
3. **Staleness is automatic.** Published fare observations expire when their
   validity date passes, or after 90 days without one. Expired references stop
   displaying as current immediately.
4. **Never infer.** An airport existing does not create a route. A country
   having airports does not create a distance. A fare observed in March is not
   a fare for August.

## 1. Airports

Dataset: OurAirports (public domain), loaded with full source identifiers
(`ident`, `source_ident`), type, scheduled-service flag, coordinates, region,
links, and dataset version. Admins correct and verify on top; imports never
overwrite admin verification.

### Import (Admin → Airports → Import CSV)

1. Export the current data first if you plan to compare: **Export active
   airports (CSV)**.
2. Prepare a CSV with this exact header (order-insensitive, names exact):

   ```
   ident,name,iso_country,latitude,longitude,iata_code,icao_code,city_municipality,iso_region,airport_type,scheduled_service
   ```

   - `ident` — unique string, the stable key (OurAirports `ident` for dataset
     rows).
   - `name` — required, 2–160 chars.
   - `iso_country` — required ISO 3166-1 alpha-2 (`BD`, `IN`, `GB`…).
   - `latitude`, `longitude` — decimal degrees. Latitude −90…90; longitude
     −180…180. Rows without both are rejected, never guessed.
   - `iata_code` — 3 letters, or empty. **Never invent one**; verify at
     iata.org/codes or the airport authority.
   - `icao_code` — 4 alphanumeric characters, or empty.
   - `airport_type` — `large_airport | medium_airport | small_airport` (others
     are reserved to the dataset).
   - `scheduled_service` — `yes | no | seasonal` when known; empty otherwise.
3. **Preview & validate.** The system parses and validates every row and
   stores the batch with its rejection report (first 20 rejected rows are kept
   as evidence). Nothing is applied yet.
4. Fix the rejected rows in your source file (the batch report names each
   reason: invalid coordinates, bad IATA shape, missing name…).
5. **Commit** the batch by id and typing `replace` as confirmation. Only rows
   that passed validation are applied, and only source fields are written —
   verification state, verifier, and notes on existing rows are preserved.

### Verify, correct, merge

- **Edit / verify** on each row: correct name/city/codes/coordinates with a
  note, then **Verify** (records who verified and when), **Reject**, or reset.
- **Merge duplicates:** open two rows, copy the `id` of the duplicate and of
  the canonical survivor, then use **Merge duplicates** — orders, routes, and
  fare records are re-pointed, the duplicate is deactivated and marked
  `merged`. Nothing is deleted.

## 2. Airlines

Admin → Airlines. Add name + IATA (2 chars) + ICAO (3 chars) + a source URL
where the codes were checked. Start unverified; after checking the codes
against an authoritative source, **Verify**. Only verified, active airlines
are public.

## 3. Routes

Admin → Routes. A route needs **evidence**: an official airline timetable
page, airport route map, or the flight-search provider's route list. Save it
with the evidence URL; it starts `unverified`. After a human checks the
evidence, set **Current** or **Seasonal** (the system records the reviewer and
time; the database trigger refuses those states without them). When an airline
pulls the route, set **Suspended** or **Discontinued** — do not delete it;
history stays auditable.

Never add a flight number unless a source documents it. Never guess operating
days.

## 4. Indicative fare observations

Admin → Fare references. These are **references for guidance**, never quotes.

Agent procedure (each numbered step is enforced in the form):

1. Pick the exact origin and destination airports (autocomplete, dataset ids).
2. Choose one-way or return.
3. Record the travel date range the fare applies to.
4. Record the passenger count and cabin assumed.
5. Research the fare on the airline site or an authorized booking source.
6. Record the **source URL** and the **observation date**.
7. State the currency and whether taxes are included; note baggage assumptions.
8. Save — the row starts as **draft**.
9. Move it to **pending_review** for a second person.
10. An authorized reviewer **publishes** it (records reviewer + time), or
    rejects/withdraws it.

Display labelling handled by the system: published fares show as
"indicative reference" with the observation date; expired ones show as
expired; anything else shows as no data. Live provider quotes (when
credentials are configured) are always a separate, clearly labelled system.

## 5. Corridors & preferred airports

Admin → Corridors. Enable a corridor (origin → destination country) only when
the service actually covers it. The corridor flag does not claim airline
service. Set a preferred airport per country (optionally per city) so country
pages can offer a sensible default — it never implies exclusivity or
availability.

## 6. Visa packages

Admin → Visa packages (super admin / application manager). A package binds a
destination (+ optional origin corridor), category, and tier to: included and
excluded services, required documents, the official government fee **with its
own currency and verification state**, third-party cost notes, the VisaBridge
service fee, our service timeline (kept separate from the government's
processing time), and refund terms. Publishing requires draft → published via
the status field; only published packages are public. Mark a government fee
verified **only** with its official source URL present.

## 7. Data quality gates (automatic)

- Country codes: ISO alpha-2 shape; IATA airports: 3 letters; IATA airlines:
  2 alphanumeric; ICAO: 4 alphanumeric.
- Coordinates: ranges validated; out-of-range or non-numeric → rejected rows.
- Dates: ISO `YYYY-MM-DD`, real calendar dates; `travel_date_to ≥ from`.
- Amounts: non-negative, ≤ 2 decimals; currency: ISO alpha-3.
- Source URLs: must parse as http(s).
- Every admin mutation writes an audit-log entry (actor, action, entity,
  before/after or decision details).

## 8. Review cadence

- Airports/airlines: verify once; re-check only when upstream data or admin
  corrections change a record.
- Routes: re-verify when the validity dates end or an airline announcement
  contradicts the record; seasonal routes re-check before each season.
- Fare observations: re-observe when the reference expires (the queue lists
  published rows with their dates; expired ones are flagged automatically).
- Visa requirements/packages: follow the review status and dates recorded on
  each listing/package; anything unverified is labelled, never published as
  authoritative.
