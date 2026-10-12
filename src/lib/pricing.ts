/**
 * Honest cost model for visa applications.
 * Dependency-free so it can be unit-tested with the plain Node test runner.
 */

// ---------------------------------------------------------------------------
// Order price math (price snapshots) — shared by the order library and tests
// ---------------------------------------------------------------------------
export interface OrderLine {
  unitAmount: number;
  quantity: number;
  currency: string;
}

/** Line total rounded half-up at two decimals (no float drift). */
export function lineTotal(line: OrderLine): number {
  return Math.round(line.unitAmount * line.quantity * 100) / 100;
}

/** Order total: sums line totals, rejects mixed-currency snapshots. */
export function orderTotal(lines: OrderLine[]): { total: number; currency: string | null } {
  if (lines.length === 0) return { total: 0, currency: null };
  const currency = lines[0].currency;
  if (lines.some((l) => l.currency !== currency)) {
    throw new Error("mixed_currency_snapshot");
  }
  const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  return { total: Math.round(total * 100) / 100, currency };
}

export type FeeKind = "official_government" | "agency_service" | "third_party" | "optional_service";

export const FEE_KIND_LABELS: Record<FeeKind, string> = {
  official_government: "Official government fee",
  agency_service: "Agency service fee",
  third_party: "Authorized third-party charge",
  optional_service: "Optional service",
};

export interface CostEstimateInput {
  officialFeeAmount: number | null;
  officialFeeVerified: boolean;
  officialFeeCurrency: string | null;
  serviceFeeAmount: number | null;
  thirdPartyAmount?: number | null;
  optionalAmount?: number | null;
}

export interface CostEstimate {
  official: { amount: number | null; verified: boolean; currency: string | null };
  service: number | null;
  thirdParty: number | null;
  optional: number | null;
  /** Total only exists when the official fee is present AND verified. */
  total: number | null;
  totalIsEstimate: boolean;
  currency: string | null;
  note: string | null;
}

/**
 * Rules enforced here (and covered by tests):
 *  - An unverified official fee never produces a confident total.
 *  - Agency fees are reported separately from government fees.
 */
export function estimateApplicationCost(input: CostEstimateInput): CostEstimate {
  const service = input.serviceFeeAmount;
  const thirdParty = input.thirdPartyAmount ?? null;
  const optional = input.optionalAmount ?? null;
  const officialKnown = input.officialFeeAmount !== null && input.officialFeeVerified;

  let total: number | null = null;
  let note: string | null = null;
  if (officialKnown) {
    total =
      (input.officialFeeAmount as number) +
      (service ?? 0) +
      (thirdParty ?? 0) +
      (optional ?? 0);
  } else {
    note = "official_fee_not_verified";
  }

  return {
    official: {
      amount: input.officialFeeAmount,
      verified: input.officialFeeVerified,
      currency: input.officialFeeCurrency,
    },
    service,
    thirdParty,
    optional,
    total,
    totalIsEstimate: true,
    currency: input.officialFeeCurrency,
    note,
  };
}
