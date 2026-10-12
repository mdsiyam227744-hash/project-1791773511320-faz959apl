import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";
import { t, type Locale } from "@/lib/i18n";
import AppMessages from "./messages";
import DocumentUploader from "./uploader";

/** Renders the structured guided-form answers as a readable summary. */
function FormDataSummary({ data, kind }: { data: Record<string, unknown>; kind: string }) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== "" && v !== null && v !== undefined && v !== false,
  );
  if (entries.length === 0) return null;
  const label = (key: string) =>
    key
      .replace(/_/g, " ")
      .replace(/^declaration/, "Declaration:")
      .replace(/^has/, "Has ");
  return (
    <details className="mt-3 rounded-md bg-navy-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-navy-700">
        Application form details ({kind})
      </summary>
      <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs capitalize text-navy-500">{label(k)}</dt>
            <dd className="break-words">
              {typeof v === "boolean" ? "Yes" : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default async function ApplicationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = createClient();

  // RLS guarantees customers only see their own rows; we filter explicitly too.
  const { data } = await supabase
    .from("applications")
    .select(
      `id, reference_no, status, status_note, notes, travel_date, created_at, updated_at,
       category_code, form_kind, form_data,
       destination:countries(name_en),
       visa:visa_listings(official_name_en, slug)`,
    )
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();
  const app = data as unknown as
    | {
        id: string;
        reference_no: string;
        status: string;
        status_note: string | null;
        notes: string | null;
        travel_date: string | null;
        created_at: string;
        updated_at: string;
        category_code: string | null;
        form_kind: string | null;
        form_data: Record<string, unknown> | null;
        destination: { name_en: string | null } | null;
        visa: { official_name_en: string; slug: string } | null;
      }
    | null;

  if (!app) notFound();
  const locale: Locale = "en";

  const { data: history } = await supabase
    .from("application_status_history")
    .select("old_status, new_status, note, created_at")
    .eq("application_id", app.id)
    .order("created_at", { ascending: true });

  const { data: docs } = await supabase
    .from("application_documents")
    .select("id, kind, file_name, size_bytes, created_at")
    .eq("application_id", app.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <nav className="text-sm text-navy-500">
        <Link href="/account" className="hover:underline">
          Dashboard
        </Link>{" "}
        / Application {app.reference_no}
      </nav>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold font-mono">{app.reference_no}</h1>
        <StatusPill status={app.status} locale={locale} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-navy-100 bg-white p-5">
            <h2 className="font-semibold">Details</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-navy-500">Destination</dt>
                <dd className="font-medium">{app.destination?.name_en ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-navy-500">Category</dt>
                <dd className="font-medium">{app.category_code ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-navy-500">Travel date</dt>
                <dd className="font-medium">{app.travel_date ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-navy-500">Service</dt>
                <dd className="font-medium">
                  {app.visa ? (
                    <Link href={`/visa/${app.visa.slug}`} className="underline">
                      {app.visa.official_name_en}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            {app.notes ? (
              <p className="mt-3 rounded bg-navy-50 p-3 text-sm text-navy-700">{app.notes}</p>
            ) : null}
            <FormDataSummary data={(app.form_data ?? {}) as Record<string, unknown>} kind={app.form_kind ?? "form"} />
          </section>

          {/* Timeline */}
          <section className="rounded-lg border border-navy-100 bg-white p-5">
            <h2 className="font-semibold">Status timeline</h2>
            {history && history.length > 0 ? (
              <ol className="mt-3 space-y-3">
                {history.map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-secondary)]" />
                    <div>
                      <p className="font-medium">
                        {t(locale, `status.${h.new_status}` as never)}
                      </p>
                      <p className="text-xs text-navy-500">
                        {new Date(h.created_at).toLocaleString("en-GB")}
                        {h.note ? ` — ${h.note}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-navy-500">No status changes recorded yet.</p>
            )}
          </section>

          {/* Messages */}
          <AppMessages applicationId={app.id} />
        </div>

        <div className="space-y-6">
          <DocumentUploader applicationId={app.id} existing={docs ?? []} />
          {app.status_note ? (
            <section className="rounded-lg border border-gold-300 bg-gold-50 p-4 text-sm">
              <h2 className="font-medium text-gold-900">Case officer note</h2>
              <p className="mt-1 text-gold-800">{app.status_note}</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
