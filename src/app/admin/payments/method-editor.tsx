"use client";

import { useState } from "react";
import { saveMethod } from "./actions";
import type { PaymentMethodRow } from "@/lib/payment-methods";

type FieldDef = { name: string; label: string; placeholder?: string };

const FIELD_GROUPS: Record<string, FieldDef[]> = {
  bkash: [
    { name: "wallet_number", label: "bKash merchant / receiver number", placeholder: "01XXXXXXXXX" },
    { name: "account_name", label: "Account name (as shown in bKash)" },
  ],
  nagad: [
    { name: "wallet_number", label: "Nagad merchant / receiver number", placeholder: "01XXXXXXXXX" },
    { name: "account_name", label: "Name the customer should see", placeholder: "Example Traders" },
  ],
  bank: [
    { name: "account_name", label: "Account holder name" },
    { name: "account_number", label: "Account number" },
    { name: "iban", label: "IBAN (if used)" },
    { name: "iban_alt", label: "Secondary IBAN / account (if any)" },
    { name: "swift", label: "SWIFT / BIC" },
    { name: "routing_number", label: "Routing / branch code" },
    { name: "branch", label: "Branch name" },
  ],
  crypto: [
    { name: "receiving_address", label: "Receiving address" },
    { name: "network", label: "Network (e.g. ERC20, TRC20, BEP20)" },
  ],
  gateway: [{ name: "gateway_name", label: "Provider name (e.g. Stripe, SSP)" }],
};

const COMMON_FIELDS: FieldDef[] = [
  { name: "instructions_en", label: "Payment instructions (English)" },
  { name: "instructions_bn", label: "পেমেন্ট নির্দেশনা (Bangla)" },
  { name: "note", label: "Internal note (customers never see this)" },
];

/**
 * Create/edit dialog for one payment method. Replaces the page only after a
 * successful save (form action posts to the server action, then refreshes).
 */
export function MethodEditor({
  mode,
  method,
}: {
  mode: "create" | "edit";
  method?: PaymentMethodRow;
}) {
  const [open, setOpen] = useState(false);
  const kind = method?.kind ?? "bkash";
  const fields = [...(FIELD_GROUPS[kind] ?? []), ...COMMON_FIELDS];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-navy-200 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-50"
      >
        {mode === "create" ? "Add payment method" : "Edit"}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={mode === "create" ? "Add payment method" : `Edit ${method?.label_en}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-navy-900">
              {mode === "create" ? "Add payment method" : `Edit — ${method?.label_en}`}
            </h3>
            <form action={saveMethod} className="mt-4 space-y-3">
              {mode === "create" ? (
                <label className="block text-sm">
                  <span className="text-navy-700">Type</span>
                  <select
                    name="kind"
                    defaultValue="bkash"
                    className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
                  >
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="bank">Bank transfer</option>
                    <option value="crypto">Cryptocurrency</option>
                    <option value="gateway">Card / online gateway</option>
                  </select>
                </label>
              ) : (
                <input type="hidden" name="method_id" value={method?.id} />
              )}
              <input type="hidden" name="intent" value={mode} />
              <label className="block text-sm">
                <span className="text-navy-700">Display name (English)</span>
                <input
                  name="label_en"
                  required
                  minLength={2}
                  maxLength={80}
                  defaultValue={method?.label_en}
                  className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-navy-700">Display name (Bangla)</span>
                <input
                  name="label_bn"
                  maxLength={80}
                  defaultValue={method?.label_bn ?? ""}
                  className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
                />
              </label>
              {fields.map((f) => (
                <label key={f.name} className="block text-sm">
                  <span className="text-navy-700">{f.label}</span>
                  <input
                    name={f.name}
                    defaultValue={(method as unknown as Record<string, string | null>)?.[f.name] ?? ""}
                    placeholder={f.placeholder}
                    className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
                  />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-navy-700">Currency</span>
                  <input
                    name="supported_currency"
                    required
                    pattern="[A-Za-z]{3}"
                    title="3-letter currency code"
                    defaultValue={method?.supported_currency ?? "BDT"}
                    className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm uppercase"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-navy-700">Minimum amount</span>
                  <input
                    name="min_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={method?.min_amount ?? ""}
                    className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-navy-700">Display order</span>
                <input
                  name="sort_order"
                  type="number"
                  min="0"
                  max="9999"
                  defaultValue={method?.sort_order ?? 100}
                  className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-navy-200 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Save method
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
