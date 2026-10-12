/**
 * Role type shared by client-safe modules (i18n, UI labels) and the server
 * auth module. Kept dependency-free so i18n can be imported anywhere.
 */
export type UserRole =
  | "super_admin"
  | "application_manager"
  | "content_manager"
  | "support_agent";

export const STAFF_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Administrator",
  application_manager: "Application Manager",
  content_manager: "Content Manager",
  support_agent: "Support Agent",
};

/** Roles allowed to grant other roles — enforced server-side (matches DB helper). */
export const ROLE_GRANT_MATRIX: Record<UserRole, UserRole[]> = {
  super_admin: ["super_admin", "application_manager", "content_manager", "support_agent"],
  application_manager: ["application_manager", "support_agent"],
  content_manager: [],
  support_agent: [],
};
