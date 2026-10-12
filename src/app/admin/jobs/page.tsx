import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCountries } from "@/lib/catalog";
import { createEmployer, createJob, setJobStatus, setEmployerVerification } from "./actions";
import { JOB_STATUSES } from "../applications/shared";

export default async function AdminJobs() {
  await requireStaff();
  const supabase = createClient();
  const [countries] = await Promise.all([listCountries()]);

  const { data: employerRows } = await supabase
    .from("employers")
    .select("id, name, workplace, verification_status, country:countries(name_en)")
    .order("created_at", { ascending: false });
  const employers = (employerRows ?? []) as unknown as {
    id: string;
    name: string;
    workplace: string | null;
    verification_status: string;
    country: { name_en: string | null } | null;
  }[];

  const { data: jobRows } = await supabase
    .from("job_listings")
    .select("id, title_en, status, application_deadline, salary_amount, salary_currency, employer:employers(name)")
    .order("created_at", { ascending: false });
  const jobs = (jobRows ?? []) as unknown as {
    id: string;
    title_en: string;
    status: string;
    application_deadline: string | null;
    salary_amount: number | null;
    salary_currency: string | null;
    employer: { name: string } | null;
  }[];

  return (
    <div>
      <h1 className="text-2xl font-bold">Employment listings</h1>
      <p className="mt-1 text-sm text-navy-600">
        Employers must be verified before their listings can be approved. Only approved listings
        with a verified employer appear on the public site.
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Employers</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-navy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-navy-50 text-left text-navy-600">
                <th className="px-4 py-2.5">Employer</th>
                <th className="px-4 py-2.5">Country</th>
                <th className="px-4 py-2.5">Verification</th>
                <th className="px-4 py-2.5">Set</th>
              </tr>
            </thead>
            <tbody>
              {(employers ?? []).map((e) => (
                <tr key={e.id} className="border-b border-navy-100 last:border-0">
                  <td className="px-4 py-2.5">
                    {e.name}
                    <p className="text-xs text-navy-400">{e.workplace ?? ""}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{e.country?.name_en ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-navy-50 px-2 py-0.5 text-xs">{e.verification_status}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={setEmployerVerification} className="flex gap-1">
                      <input type="hidden" name="employer_id" value={e.id} />
                      <select name="status" defaultValue={e.verification_status} className="rounded border border-navy-200 px-1.5 py-1 text-xs" aria-label="Set verification">
                        {["draft", "published", "archived"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button className="rounded bg-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-white">Set</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(employers ?? []).length === 0 ? (
            <p className="p-4 text-center text-sm text-navy-500">No employers yet.</p>
          ) : null}
        </div>

        <details className="mt-3 max-w-2xl rounded-lg border border-navy-100 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">Add employer</summary>
          <form action={createEmployer} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Employer name</span>
              <input name="name" required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Country</span>
              <select name="country_iso2" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm">
                <option value="">—</option>
                {countries.map((c) => (
                  <option key={c.iso2} value={c.iso2}>{c.name_en}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Workplace</span>
              <input name="workplace" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Recruitment partner</span>
              <input name="recruitment_partner" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Source URL (verification evidence)</span>
              <input name="source_url" type="url" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">
              Add employer (unverified)
            </button>
          </form>
        </details>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Job listings</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-navy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-navy-50 text-left text-navy-600">
                <th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">Employer</th>
                <th className="px-4 py-2.5">Salary</th>
                <th className="px-4 py-2.5">Deadline</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Set</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j) => (
                <tr key={j.id} className="border-b border-navy-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{j.title_en}</td>
                  <td className="px-4 py-2.5 text-xs">{j.employer?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {j.salary_amount !== null ? `${j.salary_amount} ${j.salary_currency ?? ""}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{j.application_deadline ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-navy-50 px-2 py-0.5 text-xs">{j.status}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={setJobStatus} className="flex gap-1">
                      <input type="hidden" name="job_id" value={j.id} />
                      <select name="status" defaultValue={j.status} className="rounded border border-navy-200 px-1.5 py-1 text-xs" aria-label="Set job status">
                        {JOB_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button className="rounded bg-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-white">Set</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(jobs ?? []).length === 0 ? (
            <p className="p-4 text-center text-sm text-navy-500">No listings yet.</p>
          ) : null}
        </div>

        <details className="mt-3 max-w-2xl rounded-lg border border-navy-100 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">Add job listing</summary>
          <form action={createJob} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Employer</span>
              <select name="employer_id" required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm">
                {(employers ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Job title</span>
              <input name="title_en" required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Description</span>
              <textarea name="description_en" required rows={3} className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Salary amount</span>
              <input name="salary_amount" type="number" step="0.01" min="0" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Salary currency (e.g. AED)</span>
              <input name="salary_currency" maxLength={3} className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm uppercase" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Salary period</span>
              <select name="salary_period" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm">
                <option value="month">month</option>
                <option value="year">year</option>
                <option value="day">day</option>
                <option value="hour">hour</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Contract duration (months)</span>
              <input name="contract_duration_months" type="number" min="1" max="120" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Application deadline</span>
              <input name="application_deadline" type="date" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Positions</span>
              <input name="positions" type="number" min="1" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Qualifications</span>
              <textarea name="qualifications_en" rows={2} className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Work permit / sponsorship notes</span>
              <input name="work_permit_notes" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Lawful recruitment fees disclosure</span>
              <input name="lawful_recruitment_fees" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
            </label>
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">
              Add listing (pending review)
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
