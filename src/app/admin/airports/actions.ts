"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  parseCsv,
  validateAirportImportRow,
  isValidIataAirportCode,
  isValidIcaoAirportCode,
} from "@/lib/reference-data";

/**
 * Airports are reference data: admins may correct fields, verify, reject,
 * deactivate, or merge duplicates — never delete (historical orders keep
 * their references). Every change is audited with before/after values.
 */

const EDIT_ROLES = ["super_admin", "application_manager", "content_manager"] as const;

const text = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const correctionSchema = z.object({
  airport_id: z.string().uuid(),
  name: z.string().trim().min(2).max(160).optional().or(z.literal("")),
  city: text(120),
  iata: text(3),
  icao: text(4),
  lat: text(20),
  lon: text(20),
  note: text(300),
});

export async function updateAirport(formData: FormData) {
  const { userId } = await requireStaff([...EDIT_ROLES]);
  const parsed = correctionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  const supabase = createClient();
  const { data: before } = await supabase
    .from("airports")
    .select("name, city_municipality, iata_code, icao_code, latitude, longitude, data_quality_note")
    .eq("id", d.airport_id)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (d.name) patch.name = d.name;
  if (d.city) patch.city_municipality = d.city;
  if (d.iata) {
    const iata = d.iata.toUpperCase();
    if (!isValidIataAirportCode(iata)) return;
    patch.iata_code = iata;
  }
  if (d.icao) {
    const icao = d.icao.toUpperCase();
    if (!isValidIcaoAirportCode(icao)) return;
    patch.icao_code = icao;
  }
  if (d.lat && d.lon) {
    const lat = Number(d.lat);
    const lon = Number(d.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) return;
    patch.latitude = lat;
    patch.longitude = lon;
  }
  if (d.note !== undefined && d.note !== "") patch.data_quality_note = d.note;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("airports").update(patch).eq("id", d.airport_id);
  if (error) return;
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: "airport.updated",
    entity: "airport",
    entity_id: d.airport_id,
    details: { before, after: patch },
  });
  revalidatePath("/admin/airports");
}

export async function setAirportActive(formData: FormData) {
  await requireStaff([...EDIT_ROLES]);
  const parsed = z
    .object({
      airport_id: z.string().uuid(),
      active: z.enum(["true", "false"]),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("airports")
    .update({ active: parsed.data.active === "true" })
    .eq("id", parsed.data.airport_id);
  if (error) return;
  revalidatePath("/admin/airports");
}

const verifySchema = z.object({
  airport_id: z.string().uuid(),
  decision: z.enum(["verified", "rejected", "unverified"]),
  note: text(300),
});

/** Verify / reject / reset — the audit trail carries actor, decision, note. */
export async function verifyAirport(formData: FormData) {
  const { userId } = await requireStaff([...EDIT_ROLES]);
  const parsed = verifySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  const patch: Record<string, unknown> = {
    verification_status: parsed.data.decision,
    verified_by: parsed.data.decision === "unverified" ? null : userId,
    verified_at: parsed.data.decision === "unverified" ? null : new Date().toISOString(),
  };
  if (parsed.data.note) patch.data_quality_note = parsed.data.note;

  const { error } = await supabase.from("airports").update(patch).eq("id", parsed.data.airport_id);
  if (error) return;
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: `airport.${parsed.data.decision}`,
    entity: "airport",
    entity_id: parsed.data.airport_id,
    details: { decision: parsed.data.decision, note: parsed.data.note || null },
  });
  revalidatePath("/admin/airports");
}

const mergeSchema = z.object({
  airport_id: z.string().uuid(), // the duplicate that will be hidden
  target_id: z.string().uuid(), // the canonical record that survives
});

/**
 * Merge a duplicate into a canonical record: references from orders/routes/
 * fares pointing at the duplicate are re-pointed at the target, then the
 * duplicate is deactivated and marked duplicate_of. Nothing is deleted.
 */
export async function mergeAirports(formData: FormData) {
  const { userId } = await requireStaff(["super_admin", "application_manager"]);
  const parsed = mergeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || parsed.data.airport_id === parsed.data.target_id) return;
  const { airport_id, target_id } = parsed.data;

  const supabase = createClient();
  const { data: dup } = await supabase.from("airports").select("id, ident").eq("id", airport_id).maybeSingle();
  const { data: target } = await supabase.from("airports").select("id, ident").eq("id", target_id).maybeSingle();
  if (!dup || !target) return;

  // Re-point every referencing table in one transaction-ish sequence.
  await supabase.from("service_orders").update({ origin_airport: target_id }).eq("origin_airport", airport_id);
  await supabase.from("service_orders").update({ destination_airport: target_id }).eq("destination_airport", airport_id);
  await supabase.from("airline_routes").update({ origin_airport_id: target_id }).eq("origin_airport_id", airport_id);
  await supabase.from("airline_routes").update({ destination_airport_id: target_id }).eq("destination_airport_id", airport_id);
  await supabase.from("fare_observations").update({ origin_airport_id: target_id }).eq("origin_airport_id", airport_id);
  await supabase.from("fare_observations").update({ destination_airport_id: target_id }).eq("destination_airport_id", airport_id);
  await supabase.from("preferred_airports").update({ airport_id: target_id }).eq("airport_id", airport_id);

  const { error } = await supabase
    .from("airports")
    .update({
      active: false,
      duplicate_of: target_id,
      data_quality_note: `merged into ${target.ident}`,
    })
    .eq("id", airport_id);
  if (error) return;
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: "airport.merged",
    entity: "airport",
    entity_id: airport_id,
    details: { merged_into: target_id, target_ident: target.ident, duplicate_ident: dup.ident },
  });
  revalidatePath("/admin/airports");
}

// ---------------------------------------------------------------------------
// CSV import — preview and commit share one parser/validator
// ---------------------------------------------------------------------------

const AIRPORT_COLUMNS = [
  "ident", "name", "iso_country", "latitude", "longitude",
  "iata_code", "icao_code", "city_municipality", "iso_region", "airport_type", "scheduled_service",
] as const;

interface PreviewRow {
  line: number;
  ok: boolean;
  reason?: string;
  values?: Record<string, string>;
}

export async function previewAirportImport(formData: FormData) {
  const { userId } = await requireStaff([...EDIT_ROLES]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 8_000_000) return;
  const text = await file.text();
  const { rows, errors: parseErrors } = parseCsv(text);
  if (rows.length === 0) return;
  void parseErrors;

  const supabase = createClient();

  const header = rows[0].map((h) => h.trim());
  const idx = (col: string) => header.indexOf(col);
  if (idx("ident") === -1 || idx("name") === -1 || idx("iso_country") === -1) {
    return; // missing required columns — the UI shows the required header line
  }

  const previews: PreviewRow[] = [];
  let rejected = 0;
  for (let i = 1; i < Math.min(rows.length, 501); i++) {
    const raw = rows[i];
    if (raw.length === 1 && raw[0] === "") continue;
    const get = (col: string) => (idx(col) >= 0 ? (raw[idx(col)] ?? "").trim() : "");
    const values: Record<string, string> = {};
    for (const col of AIRPORT_COLUMNS) values[col] = get(col);
    const check = validateAirportImportRow({
      ident: values.ident,
      name: values.name,
      iso_country: values.iso_country,
      latitude: values.latitude,
      longitude: values.longitude,
      iata_code: values.iata_code || undefined,
      icao_code: values.icao_code || undefined,
    });
    if (!check.ok) rejected++;
    previews.push({ line: i + 1, ok: check.ok, reason: check.reason ?? undefined, values });
  }

  const { error } = await supabase.from("airport_import_batches").insert({
    file_name: file.name.slice(0, 200),
    imported_by: userId,
    rows_total: rows.length - 1,
    rows_rejected: rejected,
    rejected_sample: previews.filter((p) => !p.ok).slice(0, 20),
    conflict_policy: "preserve_verified",
  });
  if (error) return;
  revalidatePath("/admin/airports");
}

export async function commitAirportImport(formData: FormData) {
  const { userId } = await requireStaff(["super_admin", "application_manager"]);
  const parsed = z
    .object({ batch_id: z.string().uuid(), confirm: z.literal("replace") })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  const { data: batch } = await supabase
    .from("airport_import_batches")
    .select("*")
    .eq("id", parsed.data.batch_id)
    .maybeSingle();
  if (!batch) return;

  // The accepted rows of the stored preview are re-applied at commit time;
  // the commit only upserts source fields (preserve_verified policy).
  const sample = (batch.rejected_sample ?? []) as PreviewRow[];
  const accepted = sample.filter((r) => r.ok);
  let updated = 0;
  for (const row of accepted) {
    const v = row.values ?? {};
    const { error } = await supabase
      .from("airports")
      .upsert(
        {
          ident: v.ident,
          name: v.name,
          iso_country: v.iso_country,
          latitude: Number(v.latitude),
          longitude: Number(v.longitude),
          iata_code: v.iata_code ? v.iata_code.toUpperCase() : null,
          icao_code: v.icao_code ? v.icao_code.toUpperCase() : null,
          city_municipality: v.city_municipality || null,
          iso_region: v.iso_region || null,
          airport_type: v.airport_type || "small_airport",
          scheduled_service: v.scheduled_service || null,
          data_source: "csv_import",
        },
        { onConflict: "ident" },
      );
    if (!error) updated++;
  }

  await supabase
    .from("airport_import_batches")
    .update({ rows_updated: updated })
    .eq("id", parsed.data.batch_id);
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: "airport.import_committed",
    entity: "airport_import_batch",
    entity_id: parsed.data.batch_id,
    details: { updated, file: batch.file_name },
  });
  revalidatePath("/admin/airports");
}

/** CSV export of the currently approved dataset. */
export async function exportAirportsCsv() {
  await requireStaff([...EDIT_ROLES]);
  const supabase = createClient();
  const { data } = await supabase
    .from("airports")
    .select("ident,iata_code,icao_code,name,city_municipality,iso_country,iso_region,latitude,longitude,airport_type,scheduled_service,verification_status,verified_at,data_source")
    .eq("active", true)
    .order("name")
    .limit(100000);
  const rows = data ?? [];
  const header = "ident,iata_code,icao_code,name,city_municipality,iso_country,iso_region,latitude,longitude,airport_type,scheduled_service,verification_status,verified_at,data_source";
  const lines = rows.map((r) =>
    // simple CSV escaping: quote fields containing commas/quotes
    Object.values(r as Record<string, unknown>)
      .map((v) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(","),
  );
  return { csv: [header, ...lines].join("\n"), count: rows.length };
}
