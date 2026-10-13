import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function count(supabase: ReturnType<typeof createClient>, table: string, filters?: Record<string, string>) {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filters ?? {})) q = q.eq(col, val);
  const { count: n } = await q;
  return n ?? 0;
}

export default async function AdminOverview() {
  await requireStaff();
  const supabase = createClient();

  const [
    customers,
    newApps,
    underReview,
    awaitingInfo,
    publishedVisas,
    activeJobs,
    confirmedPayments,
    newConsults,
    faresAwaitingReview,
    citiesToResolve,
  ] = await Promise.all([
    count(supabase, "profiles"),
    count(supabase, "applications", { status: "submitted" }),
    count(supabase, "applications", { status: "under_review" }),
    count(supabase, "applications", { status: "awaiting_documents" }),
    count(supabase, "visa_listings", { status: "published" }),
    count(supabase, "job_listings", { status: "approved" }),
    count(supabase, "payment_transactions", { status: "confirmed" }),
    count(supabase, "consultation_requests", { status: "new" }),
    count(supabase, "country_fare_refs", { verification_status: "needs_review" }),
    count(supabase, "fare_mapping_review", { resolved: "false" }),
  ]);

  const stats = [
    { label: "Registered customers", value: customers, href: "/admin/applications" },
    { label: "New applications", value: newApps, href: "/admin/applications?status=submitted" },
    { label: "Under review", value: underReview, href: "/admin/applications?status=under_review" },
    { label: "Awaiting documents", value: awaitingInfo, href: "/admin/applications?status=awaiting_documents" },
    { label: "Published visa listings", value: publishedVisas, href: "/admin/visas" },
    { label: "Active job listings", value: activeJobs, href: "/admin/jobs" },
    { label: "Confirmed payments", value: confirmedPayments, href: "/admin/fees" },
    { label: "New consultations", value: newConsults, href: "/admin/consultations" },
    { label: "Fare references awaiting review", value: faresAwaitingReview, href: "/admin/fare-matrix" },
    { label: "City names to resolve", value: citiesToResolve, href: "/admin/fare-matrix" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Overview</h1>
      <p className="mt-1 text-sm text-navy-600">
        Live figures calculated from actual database records — no sample data.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-navy-100 bg-white p-5 transition hover:border-[var(--brand-secondary)]"
          >
            <p className="text-3xl font-bold text-navy-900">{s.value}</p>
            <p className="mt-1 text-sm text-navy-600">{s.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
