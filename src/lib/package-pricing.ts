/**
 * Pure visa-package pricing helpers — dependency-free so the plain Node test
 * runner can exercise them without a database. The server boundary lives in
 * packages.ts; this module holds the deterministic parts.
 */
import type { Locale } from "./i18n";

export interface VisaPackageCore {
  official_gov_fee_amount: number | null;
  official_gov_fee_currency: string | null;
  official_gov_fee_verified: boolean;
  third_party_costs_en: string | null;
  third_party_costs_bn: string | null;
  service_fee_amount: number;
  service_fee_currency: string;
}

export interface PackageLine {
  label: string;
  amount: number | null;
  currency: string | null;
  kind: "government" | "service" | "third_party_note";
  verified: boolean;
}

export interface PackageLines {
  lines: PackageLine[];
  /** The amount the customer can actually pay here: our service fee only. */
  payableNow: number;
  currency: string;
}

/**
 * Price breakdown for display/checkout. The government fee is its own line,
 * flagged unverified unless the admin recorded verification with a source;
 * third-party costs appear as a note, never as a payable amount. Government
 * fees are never presented as VisaBridge revenue.
 */
export function packageLines(p: VisaPackageCore, locale: Locale): PackageLines {
  const lines: PackageLine[] = [];
  if (p.official_gov_fee_amount != null || p.official_gov_fee_verified) {
    lines.push({
      label:
        locale === "bn"
          ? p.official_gov_fee_verified
            ? "সরকারি ভিসা ফি (সরকার নিজে নেন)"
            : "সরকারি ভিসা ফি (অমীমাংসিত — যাচাই করা হয়নি)"
          : p.official_gov_fee_verified
            ? "Official government visa fee (paid to the government)"
            : "Official government visa fee (amount not yet verified)",
      amount: p.official_gov_fee_amount,
      currency: p.official_gov_fee_currency ?? null,
      kind: "government",
      verified: p.official_gov_fee_verified,
    });
  }
  lines.push({
    label: locale === "bn" ? "VisaBridge সেবা মূল্য" : "VisaBridge service fee",
    amount: p.service_fee_amount,
    currency: p.service_fee_currency,
    kind: "service",
    verified: true,
  });
  const thirdParty = (locale === "bn" ? p.third_party_costs_bn : p.third_party_costs_en)?.trim();
  if (thirdParty) {
    lines.push({
      label: thirdParty,
      amount: null,
      currency: null,
      kind: "third_party_note",
      verified: false,
    });
  }
  return { lines, payableNow: p.service_fee_amount, currency: p.service_fee_currency };
}

/** Deterministic URL-safe slug from the package name. */
export function slugifyPackage(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || `package-${Date.now()}`;
}
