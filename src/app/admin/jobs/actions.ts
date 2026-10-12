"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

function slugify(input: string): string {
  return `${input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
}

const employerSchema = z.object({
  name: z.string().trim().min(2).max(200),
  country_iso2: z.string().trim().length(2).optional().or(z.literal("")),
  workplace: z.string().trim().max(200).optional().or(z.literal("")),
  recruitment_partner: z.string().trim().max(200).optional().or(z.literal("")),
  source_url: z.string().trim().url().optional().or(z.literal("")),
});

export async function createEmployer(formData: FormData) {
  await requireStaff();
  const parsed = employerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  let countryId: string | null = null;
  if (parsed.data.country_iso2) {
    const { data } = await supabase
      .from("countries").select("id").eq("iso2", parsed.data.country_iso2.toUpperCase()).maybeSingle();
    countryId = data?.id ?? null;
  }
  await supabase.from("employers").insert({
    name: parsed.data.name,
    country_id: countryId,
    workplace: parsed.data.workplace || null,
    recruitment_partner: parsed.data.recruitment_partner || null,
    source_url: parsed.data.source_url || null,
    verification_status: "draft",
  });
  revalidatePath("/admin/jobs");
}

const employerStatusSchema = z.object({
  employer_id: z.string().uuid(),
  status: z.enum(["draft", "published", "archived"]),
});

export async function setEmployerVerification(formData: FormData) {
  await requireStaff();
  const parsed = employerStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const supabase = createClient();
  await supabase
    .from("employers")
    .update({ verification_status: parsed.data.status })
    .eq("id", parsed.data.employer_id);
  revalidatePath("/admin/jobs");
}

const jobSchema = z.object({
  employer_id: z.string().uuid(),
  title_en: z.string().trim().min(3).max(200),
  description_en: z.string().trim().min(10).max(8000),
  salary_amount: z.string().optional().or(z.literal("")),
  salary_currency: z.string().trim().length(3).optional().or(z.literal("")),
  salary_period: z.enum(["month", "year", "day", "hour"]).optional().or(z.literal("")),
  contract_duration_months: z.string().optional().or(z.literal("")),
  application_deadline: z.string().optional().or(z.literal("")),
  positions: z.string().optional().or(z.literal("")),
  qualifications_en: z.string().trim().max(4000).optional().or(z.literal("")),
  work_permit_notes: z.string().trim().max(1000).optional().or(z.literal("")),
  lawful_recruitment_fees: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function createJob(formData: FormData) {
  await requireStaff();
  const parsed = jobSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  const supabase = createClient();
  await supabase.from("job_listings").insert({
    employer_id: d.employer_id,
    title_en: d.title_en,
    description_en: d.description_en,
    salary_amount: d.salary_amount ? Number(d.salary_amount) : null,
    salary_currency: d.salary_currency?.toUpperCase() || null,
    salary_period: d.salary_period || null,
    contract_duration_months: d.contract_duration_months ? Number(d.contract_duration_months) : null,
    application_deadline: d.application_deadline || null,
    positions: d.positions ? Number(d.positions) : null,
    qualifications_en: d.qualifications_en || null,
    work_permit_notes: d.work_permit_notes || null,
    lawful_recruitment_fees: d.lawful_recruitment_fees || null,
    slug: slugify(d.title_en),
    status: "pending_review",
  });
  revalidatePath("/admin/jobs");
}

const jobStatusSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(["pending_review", "approved", "suspended", "rejected", "archived", "closed"]),
});

export async function setJobStatus(formData: FormData) {
  await requireStaff();
  const parsed = jobStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const supabase = createClient();
  await supabase
    .from("job_listings")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.job_id);
  revalidatePath("/admin/jobs");
}
