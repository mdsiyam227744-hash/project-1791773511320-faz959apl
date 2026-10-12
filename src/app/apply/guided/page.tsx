import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { listCountries } from "@/lib/catalog";
import {
  FORM_KINDS,
  isFormKind,
  type FormKind,
} from "@/lib/application-forms";
import GuidedForm from "./guided-form";

export const metadata: Metadata = { title: "Guided application" };

export default async function GuidedApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; visa?: string; draft?: string }>;
}) {
  const user = await requireUser();
  const { kind, visa, draft } = await searchParams;

  // Step 1: purpose chooser
  if (!kind || !isFormKind(kind)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">Start a new application</h1>
        <p className="mt-2 text-sm text-navy-600">
          Choose the purpose of travel — the form adapts to it. You can save a draft at any step
          and finish later.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {FORM_KINDS.map((f) => (
            <Link
              key={f.kind}
              href={`/apply/guided?kind=${f.kind}${visa ? `&visa=${encodeURIComponent(visa)}` : ""}`}
              className="rounded-xl border border-navy-100 bg-white p-4 hover:border-[var(--brand-primary)]"
            >
              <p className="font-semibold text-navy-900">{f.labelEn}</p>
              <p className="text-xs text-navy-500">{f.labelBn}</p>
              <p className="mt-2 text-sm text-navy-600">{f.blurbEn}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          Applications are temporarily unavailable.
        </p>
      </div>
    );
  }

  const kindValue: FormKind = kind;
  const [countries] = await Promise.all([listCountries({ destination: true })]);

  // Load an existing draft when requested (owner-scoped).
  let draftId: string | null = null;
  let initialData: Record<string, unknown> = {};
  let selectedVisaId: string | null = null;
  let selectedVisaName: string | null = null;

  const supabase = createClient();

  if (visa) {
    const { data } = await supabase
      .from("visa_listings")
      .select("id, official_name_en, category_code")
      .eq("slug", visa)
      .eq("status", "published")
      .maybeSingle();
    if (data) {
      // A listing pins the purpose; redirect to the matching guided form.
      if (!searchKindMatchesListing(kindValue, data.category_code as string)) {
        redirect(`/apply/guided?kind=${listingKind(data.category_code as string)}&visa=${encodeURIComponent(visa)}`);
      }
      selectedVisaId = data.id;
      selectedVisaName = data.official_name_en;
    }
  }

  if (draft) {
    const { data: app } = await supabase
      .from("applications")
      .select("id, form_kind, form_data, status")
      .eq("id", draft)
      .eq("customer_id", user.id)
      .eq("status", "draft")
      .maybeSingle();
    if (!app) notFound();
    if (app.form_kind !== kindValue) {
      redirect(`/apply/guided?kind=${app.form_kind}&draft=${draft}`);
    }
    draftId = app.id;
    initialData = (app.form_data ?? {}) as Record<string, unknown>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">
        {FORM_KINDS.find((f) => f.kind === kindValue)?.labelEn ?? "Application"}
      </h1>
      <p className="mt-2 text-sm text-navy-600">
        A case officer reviews every application and confirms requirements, fees, and timelines.
        No payment is requested at this stage.
      </p>
      <GuidedForm
        kind={kindValue}
        countries={countries.map((c) => ({ iso2: c.iso2, name: c.name_en }))}
        locale="en"
        selectedVisaId={selectedVisaId}
        selectedVisaName={selectedVisaName}
        draftId={draftId}
        initialData={initialData}
      />
    </div>
  );
}

function listingKind(categoryCode: string): FormKind {
  const found = FORM_KINDS.find((f) => f.categoryCode === categoryCode);
  return found?.kind ?? "other";
}

function searchKindMatchesListing(kind: FormKind, categoryCode: string): boolean {
  return listingKind(categoryCode) === kind;
}
