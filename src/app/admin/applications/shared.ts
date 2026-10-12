export const APP_STATUSES = [
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
