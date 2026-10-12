import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { StatusPill } from "@/components/status-pill";

export default async function AccountHome() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const locale = (profile?.locale as "en" | "bn") ?? "en";

  const supabase = createClient();
  const { data: applications } = await supabase
    .from("applications")
    .select(
      `id, reference_no, status, created_at, updated_at, category_code,
       destination:countries(name_en)`,
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

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
          href="/apply"
          className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {t(locale, "dash.newApplication")}
        </Link>
      </div>

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
                {applications.map((a) => (
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
