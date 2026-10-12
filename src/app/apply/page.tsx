import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listCountries, listCategories } from "@/lib/catalog";
import ApplyForm from "./apply-form";

export const metadata: Metadata = { title: "Apply for assistance" };

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ visa?: string }>;
}) {
  const user = await requireUser();
  const { visa } = await searchParams;
  const [countries, categories] = await Promise.all([
    listCountries({ destination: true }),
    listCategories(),
  ]);

  let selectedVisaName: string | null = null;
  let selectedVisaId: string | null = null;
  if (visa) {
    const { createClient, isSupabaseConfigured } = await import("@/lib/supabase/server");
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      const { data } = await supabase
        .from("visa_listings")
        .select("id, official_name_en")
        .eq("slug", visa)
        .eq("status", "published")
        .maybeSingle();
      if (data) {
        selectedVisaId = data.id;
        selectedVisaName = data.official_name_en;
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Apply for visa assistance</h1>
      <p className="mt-2 text-sm text-navy-600">
        Submit your plan and a case officer confirms requirements, fees, and timelines. No payment
        is requested at this stage.
      </p>
      <ApplyForm
        countries={countries.map((c) => ({ iso2: c.iso2, name: c.name_en }))}
        categories={categories.map((c) => ({ code: c.code, label: c.label_en }))}
        selectedVisaId={selectedVisaId}
        selectedVisaName={selectedVisaName}
      />
    </div>
  );
}
