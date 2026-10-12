/**
 * Honest cost model for visa applications.
 * Dependency-free so it can be unit-tested with the plain Node test runner.
 */

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
