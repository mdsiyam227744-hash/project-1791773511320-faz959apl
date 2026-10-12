import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { StatusPill } from "@/components/status-pill";
import { FORM_KINDS } from "@/lib/application-forms";
import { asJoinedCountry } from "@/lib/joins";

interface AccountApplicationRow {
  id: string;
  reference_no: string;
  status: string;
  created_at: string;
  updated_at: string;
  category_code: string | null;
  form_kind: string | null;
  destination: { name_en: string | null } | null;
}

export default async function AccountHome() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const locale = (profile?.locale as "en" | "bn") ?? "en";

  const supabase = createClient();
  const { data } = await supabase
    .from("applications")
    .select(
      `id, reference_no, status, created_at, updated_at, category_code, form_kind,
       destination:countries(name_en)`,
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const applications = (data ?? []) as unknown as AccountApplicationRow[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t(locale, "dash.welcome")}
            {profile?.full_name ? `, ${profile.full_name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-navy-600">{user.email}</p>
        </div>
        <Link
          href="/apply/guided"
          className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {t(locale, "dash.newApplication")}
        </Link>
      </div>

      {/* Drafts needing completion */}
      {applications?.some((a) => a.status === "draft") ? (
        <section className="mt-6 rounded-lg border border-gold-300 bg-gold-50 p-4">
          <h2 className="text-sm font-semibold text-gold-900">Drafts waiting to be finished</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {applications
              .filter((a) => a.status === "draft")
              .map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-gold-800">
                    {FORM_KINDS.find((f) => f.kind === a.form_kind)?.labelEn ?? "Application"}
                    {a.destination?.name_en ? ` — ${a.destination.name_en}` : ""}
                  </span>
                  <Link
                    href={`/apply/guided?kind=${a.form_kind ?? "tourist"}&draft=${a.id}`}
                    className="rounded border border-gold-400 bg-white px-2.5 py-1 text-xs font-medium text-navy-700 hover:bg-navy-50"
                  >
                    {t(locale, "common.viewDetails") === "View details" ? "Resume" : "Resume"}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t(locale, "dash.applications")}</h2>
        {!applications || applications.length === 0 ? (
          <p className="mt-3 rounded-lg border border-navy-100 bg-white p-6 text-sm text-navy-600">
            {t(locale, "dash.noApplications")}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-navy-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-navy-50 text-left text-navy-600">
                  <th className="px-4 py-2.5">{t(locale, "dash.reference")}</th>
                  <th className="px-4 py-2.5">{t(locale, "dash.destination")}</th>
                  <th className="px-4 py-2.5">{t(locale, "dash.category")}</th>
                  <th className="px-4 py-2.5">{t(locale, "dash.status")}</th>
                  <th className="px-4 py-2.5">{t(locale, "dash.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {applications.filter((a) => a.status !== "draft").map((a) => (
                  <tr key={a.id} className="border-b border-navy-100 last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/account/applications/${a.id}`} className="hover:underline">
                        {a.reference_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {a.destination?.name_en ?? "—"}
                    </td>
                    <td className="px-4 py-3">{a.category_code ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={a.status} locale={locale} />
                    </td>
                    <td className="px-4 py-3 text-navy-500">
                      {new Date(a.updated_at).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
