/**
 * Narrowed types for Supabase embedded-join results.
 *
 * The client is untyped (see src/lib/supabase/server.ts), so `select("*, customer:profiles(full_name)")
 * returns loosely-typed data. These helpers give each join's runtime shape a
 * name at the few call sites that read it, so a column rename is caught by the
 * type check instead of rendering `undefined` in production.
 */

/** Result of `customer:profiles(full_name)` — one row, not an array (FK to unique id). */
export interface JoinedProfile {
  full_name: string | null;
}

/** Result of `destination:countries(name_en)` / `origin:countries(name_en)`. */
export interface JoinedCountry {
  name_en: string | null;
}

/** Result of `assigned_staff:staff(display_name, id)`. */
export interface JoinedStaff {
  id?: string;
  display_name: string | null;
}

/** Result of `visa:visa_listings(official_name_en, slug)`. */
export interface JoinedVisaListing {
  official_name_en: string;
  slug: string;
}

/** Result of `employer:employers(name)`. */
export interface JoinedEmployer {
  name: string;
}

export function asJoinedProfile(v: unknown): JoinedProfile | null {
  return (v ?? null) as JoinedProfile | null;
}
export function asJoinedCountry(v: unknown): JoinedCountry | null {
  return (v ?? null) as JoinedCountry | null;
}
export function asJoinedStaff(v: unknown): JoinedStaff | null {
  return (v ?? null) as JoinedStaff | null;
}
export function asJoinedVisaListing(v: unknown): JoinedVisaListing | null {
  return (v ?? null) as JoinedVisaListing | null;
}
export function asJoinedEmployer(v: unknown): JoinedEmployer | null {
  return (v ?? null) as JoinedEmployer | null;
}
