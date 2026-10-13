/**
 * Visa packages: database-backed, admin-priced, published-only for customers.
 * Government fees are stored separately from the VisaBridge service fee and
 * are never merged into one revenue line.
 */
import { createClient, isSupabaseConfigured } from "./supabase/server";
import { packageLines as packageLinesPure, slugifyPackage as slugifyPackagePure } from "./package-pricing";

// Re-export the pure pricing helpers for callers of this module (they live in
// the dependency-free package-pricing module for testability).
export function packageLines(p: Parameters<typeof packageLinesPure>[0], locale: "en" | "bn") {
  return packageLinesPure(p, locale);
}
export function slugifyPackage(name: string): string {
  return slugifyPackagePure(name);
}

export interface VisaPackageRow {
  id: string;
  slug: string;
  name_en: string;
  name_bn: string | null;
  description_en: string | null;
  description_bn: string | null;
  visa_listing_id: string | null;
  destination_country_id: string;
  origin_country_id: string | null;
  category_code: string;
  tier: "basic" | "standard" | "premium";
  included_services_en: string | null;
  included_services_bn: string | null;
  excluded_services_en: string | null;
  excluded_services_bn: string | null;
  required_documents_en: string | null;
  required_documents_bn: string | null;
  official_gov_fee_amount: number | null;
  official_gov_fee_currency: string | null;
  official_gov_fee_verified: boolean;
  official_gov_fee_source_url: string | null;
  third_party_costs_en: string | null;
  third_party_costs_bn: string | null;
  service_fee_amount: number;
  service_fee_currency: string;
  tax_note: string | null;
  timeline_en: string | null;
  timeline_bn: string | null;
  refund_terms_en: string | null;
  refund_terms_bn: string | null;
  eligibility_note_en: string | null;
  eligibility_note_bn: string | null;
  status: "draft" | "published" | "archived";
  effective_from: string | null;
  effective_to: string | null;
  last_verified: string | null;
  sort_order: number;
  destination?: { iso2: string; name_en: string; name_bn: string | null };
  origin?: { iso2: string; name_en: string; name_bn: string | null } | null;
}

export interface PackageLine {
  label: string;
  amount: number | null;
  currency: string | null;
  kind: "government" | "service" | "third_party_note";
  verified: boolean;
}

export interface PackageLines {
  lines: PackageLine[];
  /** The amount the customer can actually pay here: our service fee only. */
  payableNow: number;
  currency: string;
}

const PACKAGE_SELECT = `*,
  destination:countries!visa_packages_destination_country_id_fkey(iso2, name_en, name_bn),
  origin:countries!visa_packages_origin_country_id_fkey(iso2, name_en, name_bn)`;

export async function listPublicPackages(filter: {
  destinationIso2?: string;
  originIso2?: string;
  categoryCode?: string;
  limit?: number;
}): Promise<VisaPackageRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let q = supabase
      .from("visa_packages")
      .select(PACKAGE_SELECT)
      .eq("status", "published")
      .order("sort_order")
      .limit(filter.limit ?? 60);
    if (filter.destinationIso2) {
      q = q.eq(
        "destination:countries!visa_packages_destination_country_id_fkey.iso2",
        filter.destinationIso2.toUpperCase(),
      );
    }
    if (filter.originIso2) {
      q = q.eq(
        "origin:countries!visa_packages_origin_country_id_fkey.iso2",
        filter.originIso2.toUpperCase(),
      );
    }
    if (filter.categoryCode) q = q.eq("category_code", filter.categoryCode);
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as unknown as VisaPackageRow[];
  } catch {
    return [];
  }
}

export async function getPackageBySlug(slug: string): Promise<VisaPackageRow | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("visa_packages")
      .select(PACKAGE_SELECT)
      .eq("slug", slug)
      .maybeSingle();
    return (data as VisaPackageRow) ?? null;
  } catch {
    return null;
  }
}
