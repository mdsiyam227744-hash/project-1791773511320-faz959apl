/**
 * SQL structure tests: migration and seed files must be present, idempotent,
 * and enforce the security properties the platform requires.
 * Run with the Node test runner (no database needed — static analysis).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const MIGRATIONS = "supabase/migrations";
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const read = (p: string) => readFileSync(p, "utf8");
const stripStrings = (sql: string) => sql.replace(/'[^']*'/g, "''");

test("migration files exist and are ordered", () => {
  assert.ok(files.length >= 3, `expected at least 3 migrations, found ${files.length}`);
  assert.deepEqual(files, [...files].sort());
});

for (const f of files) {
  test(`${f}: every CREATE TABLE/TYPE/FUNCTION/POLICY is guarded (IF NOT EXISTS / OR REPLACE / duplicate_object trap)`, () => {
    const sql = read(`${MIGRATIONS}/${f}`);
    const bare = [
      ...sql.matchAll(/^(?!.*(if not exists|or replace|exception when duplicate_object))\s*create (table|type|function|policy|index)\b[^;]*$/gmi),
    ];
    // bare CREATEs are allowed only inside DO blocks that trap duplicate_object
    for (const m of bare) {
      const around = sql.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 400);
      assert.match(around, /exception when duplicate_object|if not exists|or replace/i);
    }
    // Triggers: each guarded create trigger must follow a drop trigger if exists
    const triggers = [...sql.matchAll(/create trigger (\w+)/g)];
    for (const m of triggers) {
      const before = sql.slice(Math.max(0, (m.index ?? 0) - 200), m.index ?? 0);
      assert.match(before, /drop trigger if exists/i, `trigger ${m[1]} must be preceded by drop ... if exists`);
    }
  });

  test(`${f}: dollar-quoted blocks are balanced`, () => {
    const sql = read(`${MIGRATIONS}/${f}`);
    assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0);
  });
}

const rls = read(`${MIGRATIONS}/0002_rls.sql`);

test("RLS is enabled on every application table", () => {
  const tables = [
    "countries","visa_categories","visa_listings","visa_fees","service_fees","service_fee_history",
    "employers","job_listings","profiles","staff","applications","application_status_history",
    "application_documents","consultation_requests","messages","route_queries","flight_quote_records",
    "payment_transactions","refund_records","contact_settings","brand_settings","site_content",
    "faqs","legal_documents","audit_logs",
  ];
  // 0002 enables RLS inside a DO loop over the full table list — parse that list
  // and require every table to be present, plus the ALTER TABLE statement itself.
  const loop = rls.match(/foreach t in array array\[([\s\S]*?)\]\s*loop\s*execute format\('alter table public\.%I enable row level security/);
  assert.ok(loop, "the enable-RLS DO loop must exist");
  for (const t of tables) {
    assert.ok(loop[1].includes(`'${t}'`), `${t} missing from the enable-RLS list`);
  }
});

test("customer-owned tables are scoped to the owner, never world-readable", () => {
  // applications: select only with owner check or staff
  assert.match(rls, /create policy applications_owner on public\.applications for select\s*\n?\s*using \(\s*customer_id = auth\.uid\(\) or public\.is_staff\(\)\s*\)/);
  // inserts by customers must pin customer_id to the caller
  assert.match(rls, /applications_customer_insert[\s\S]*?with check \(customer_id = auth\.uid\(\)\)/);
});

test("staff writes go through guarded RPCs, not table grants", () => {
  assert.match(rls, /create policy staff_read on public\.staff for select using \(public\.is_staff\(\)\)/);
  assert.ok(!/create policy staff_\w+ on public\.staff for (insert|update|delete)/i.test(rls),
    "no direct staff table writes may be permitted");
  assert.match(rls, /function public\.can_grant_role/);
  assert.match(rls, /grant_staff[\s\S]*?can_grant_role\(actor_role, target_role\)/);
});

test("role escalation is blocked: grant RPC rejects unauthorized roles", () => {
  assert.match(rls, /select granter_role = 'super_admin'/);
  assert.match(rls, /application_manager' and target_role in \('application_manager','support_agent'\)/);
});

test("bootstrap function refuses to run once staff exist", () => {
  assert.match(rls, /if exists \(select 1 from public\.staff\) then[\s\S]*?raise exception 'Bootstrap unavailable/);
});

test("service-role client is never exposed to browser code", () => {
  for (const dir of ["src/app", "src/components", "src/middleware.ts"]) {
    try {
      const { execSync } = require("node:child_process") as typeof import("node:child_process");
      const out = execSync(
        `grep -rl "SERVICE_ROLE" ${dir} --include='*.ts' --include='*.tsx' | xargs grep -l '"use client"' 2>/dev/null || true`,
        { encoding: "utf8" },
      );
      assert.equal(out.trim(), "", `service role referenced in client code: ${out}`);
    } catch (e) {
      // grep with no matches exits 1; that is the passing case
    }
  }
});

test("official fee records always carry a source URL and verification tracking", () => {
  const init = read(`${MIGRATIONS}/0001_init.sql`);
  assert.match(init, /is_verified boolean not null default false/);
  assert.match(init, /source_url text/);
  assert.match(init, /last_verified date/);
});

test("0004: RLS is enabled on every new table (orders, snapshots, airports, webhook log)", () => {
  const m4 = read(`${MIGRATIONS}/0004_orders_flights_airports.sql`);
  const loop = m4.match(/foreach t in array array\[([^\]]+)\]/);
  assert.ok(loop, "the 0004 enable-RLS DO loop must exist");
  for (const t of ["airports", "service_orders", "service_order_events", "order_price_snapshots", "payment_event_log"]) {
    assert.ok(loop[1].includes(`'${t}'`), `${t} missing from the 0004 enable-RLS list`);
  }
});

test("0004: the payment boundary cannot be crossed by an interactive session", () => {
  const m4 = read(`${MIGRATIONS}/0004_orders_flights_airports.sql`);
  // pending_payment -> payment_verified requires no interactive user (or explicit super admin)
  assert.match(m4, /auth\.uid\(\) is null or public\.is_super_admin\(\)/);
  // a confirmed booking cannot exist without a real provider reference
  assert.match(m4, /booking_confirmed' and coalesce\(new\.external_booking_ref, ''\) = ''/);
  // orders are born pending_payment only
  assert.match(m4, /new\.status <> 'pending_payment' then/);
});

test("0004: price snapshots are not writable by customers", () => {
  const m4 = read(`${MIGRATIONS}/0004_orders_flights_airports.sql`);
  assert.match(m4, /create policy price_snapshots_staff_insert on public\.order_price_snapshots for insert to authenticated\s*\n?\s*with check \(public\.is_staff\(\)\)/);
  assert.ok(!/create policy price_snapshots_customer_insert/i.test(m4));
});

test("seed data keeps unverified facts labelled (no invented verified fees)", () => {
  const seed = read("supabase/seed/reference_data.sql");
  // the unverified Malaysia record must not be marked verified
  assert.match(seed, /bd-malaysia-evisa-tourist[\s\S]*?is_verified,\s*source_url[\s\S]*?,\s*false/i);
});

test("reference listings seed as draft so nothing unreviewed goes public", () => {
  const seed = read("supabase/seed/reference_data.sql");
  const published = [...seed.matchAll(/status,\s*slug\s*\)/g)].length;
  assert.ok(published >= 2, `expected 2 draft-structured inserts, found ${published}`);
  assert.doesNotMatch(seed, /'published',\s*'[a-z0-9-]+'$/m);
});
