export const APP_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "awaiting_documents",
  "awaiting_customer",
  "in_progress",
  "submitted_to_authority",
  "approved",
  "refused",
  "withdrawn",
  "closed",
] as const;

/**
 * Allowed staff transitions. The DB trigger `guard_application_transition`
 * enforces decided-state protection independently; this mirrors it for the UI
 * and for the server action pre-check.
 */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["under_review", "awaiting_documents", "awaiting_customer", "in_progress", "withdrawn", "closed"],
  under_review: ["awaiting_documents", "awaiting_customer", "in_progress", "submitted_to_authority", "approved", "refused", "withdrawn", "closed"],
  awaiting_documents: ["under_review", "in_progress", "withdrawn", "closed"],
  awaiting_customer: ["under_review", "in_progress", "withdrawn", "closed"],
  in_progress: ["submitted_to_authority", "approved", "refused", "withdrawn", "closed"],
  submitted_to_authority: ["approved", "refused", "withdrawn", "closed"],
  approved: ["closed", "withdrawn"],
  refused: ["closed", "withdrawn"],
  withdrawn: ["closed"],
  closed: [],
};

export function canTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export const CONTENT_STATUSES = ["draft", "published", "archived"] as const;

export const JOB_STATUSES = [
  "pending_review",
  "approved",
  "suspended",
  "rejected",
  "archived",
  "closed",
] as const;

export const DOC_KINDS = [
  "passport_scan",
  "photo",
  "bank_statement",
  "employment_letter",
  "invitation_letter",
  "admission_letter",
  "police_clearance",
  "medical_certificate",
  "marriage_certificate",
  "birth_certificate",
  "other",
] as const;

export const STAFF_LIST = [] as { id: string; display_name: string }[];
