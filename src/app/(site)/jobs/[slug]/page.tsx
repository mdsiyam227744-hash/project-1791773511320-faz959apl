import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = await getJob(slug);
  return { title: job?.title_en ?? "Job details" };
}

async function getJob(slug: string) {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("job_listings")
    .select(
      `*, employer:employers(name, workplace, verification_status, recruitment_partner,
        country:countries(name_en))`,
    )
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();
  return data;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold">{job.title_en}</h1>
      <p className="mt-2 text-navy-600">
        {job.employer.name}
        {job.employer.workplace ? ` — ${job.employer.workplace}` : ""}
        {job.employer.country ? `, ${job.employer.country.name_en}` : ""}
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Role description</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-navy-700">
          {job.description_en}
        </p>
      </section>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        {[
          ["Salary", job.salary_amount !== null ? `${job.salary_amount} ${job.salary_currency ?? ""} / ${job.salary_period ?? "month"}` : null],
          ["Contract duration", job.contract_duration_months ? `${job.contract_duration_months} months` : null],
          ["Application deadline", job.application_deadline],
          ["Positions", job.positions?.toString() ?? null],
          ["Qualifications", job.qualifications_en],
          ["Work permit / sponsorship", job.work_permit_notes],
          ["Lawful recruitment fees", job.lawful_recruitment_fees],
          ["Recruitment partner", job.employer.recruitment_partner],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="rounded-lg border border-navy-100 p-3">
              <dt className="text-xs uppercase tracking-wide text-navy-500">{k}</dt>
              <dd className="mt-1 text-sm">{v}</dd>
            </div>
          ))}
      </dl>

      <p className="mt-8 text-xs text-navy-500">
        To apply, contact our team through the contact page or WhatsApp — we confirm every vacancy
        with the employer before you spend anything on an application.
      </p>
    </article>
  );
}
