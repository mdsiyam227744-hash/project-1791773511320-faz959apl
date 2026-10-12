import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export interface Country {
  id: string;
  iso2: string;
  name_en: string;
  name_bn: string | null;
  nationality_en: string | null;
  region: string | null;
  is_origin: boolean;
  is_destination: boolean;
}

export interface VisaCategory {
  code: string;
  label_en: string;
  label_bn: string | null;
  description_en: string | null;
}

export interface VisaListingCard {
  id: string;
  slug: string;
  official_name_en: string;
  category_code: string;
  status: string;
  last_verified: string | null;
  processing_time_estimate: string | null;
  fee_currency: string | null;
  destination: { iso2: string; name_en: string };
  origin: { iso2: string; name_en: string } | null;
}

/** Worldwide country directory (public read). */
export async function listCountries(filter?: {
  origin?: boolean;
  destination?: boolean;
}): Promise<Country[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let query = supabase
      .from("countries")
      .select("id, iso2, name_en, name_bn, nationality_en, region, is_origin, is_destination")
      .order("name_en");
    if (filter?.origin) query = query.eq("is_origin", true);
    if (filter?.destination) query = query.eq("is_destination", true);
    const { data } = await query;
    return (data ?? []) as Country[];
  } catch {
    return [];
  }
}

export async function getCountryByIso(iso2: string): Promise<Country | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("countries")
      .select("id, iso2, name_en, name_bn, nationality_en, region, is_origin, is_destination")
      .eq("iso2", iso2.toUpperCase())
      .maybeSingle();
    return (data as Country) ?? null;
  } catch {
    return null;
  }
}

export async function listCategories(): Promise<VisaCategory[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("visa_categories")
      .select("code, label_en, label_bn, description_en")
      .eq("active", true)
      .order("sort_order");
    return (data ?? []) as VisaCategory[];
  } catch {
    return [];
  }
}

export interface VisaQuery {
  destinationIso2?: string;
  originIso2?: string;
  categoryCode?: string;
  includeDrafts?: boolean;
  limit?: number;
}

/** Catalog search — the database is the single source of truth. */
export async function listVisaListings(q: VisaQuery = {}): Promise<VisaListingCard[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let query = supabase
      .from("visa_listings")
      .select(
        `id, slug, official_name_en, category_code, status, last_verified,
         processing_time_estimate, fee_currency,
         destination:countries!inner(iso2, name_en),
         origin:countries(iso2, name_en)`,
      )
      .order("updated_at", { ascending: false })
      .limit(q.limit ?? 60);
    if (!q.includeDrafts) query = query.eq("status", "published");
    if (q.categoryCode) query = query.eq("category_code", q.categoryCode);
    if (q.destinationIso2) query = query.eq("destination.iso2", q.destinationIso2);
    const { data } = await query;
    let rows = (data ?? []) as unknown as VisaListingCard[];
    if (q.originIso2) rows = rows.filter((r) => r.origin?.iso2 === q.originIso2);
    return rows;
  } catch {
    return [];
  }
}

export async function getVisaListingBySlug(slug: string) {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("visa_listings")
      .select(
        `*,
         destination:countries!inner(id, iso2, name_en, name_bn),
         origin:countries(id, iso2, name_en, name_bn)`,
      )
      .eq("slug", slug)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export interface JobListingCard {
  id: string;
  slug: string;
  title_en: string;
  salary_amount: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  application_deadline: string | null;
  positions: number | null;
  contract_duration_months: number | null;
  employer: { name: string; workplace: string | null; country: { name_en: string } | null };
}

/** Only listings approved by staff AND published employers are public. */
export async function listPublicJobs(limit = 30): Promise<JobListingCard[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("job_listings")
      .select(
        `id, slug, title_en, salary_amount, salary_currency, salary_period,
         application_deadline, positions, contract_duration_months,
         employer:employers(name, workplace, country:countries(name_en))`,
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as unknown as JobListingCard[];
  } catch {
    return [];
  }
}
