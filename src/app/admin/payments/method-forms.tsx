"use client";

import { saveMethod, deleteMethod } from "./actions";
import type { PaymentMethodRow } from "@/lib/payment-methods";

/**
 * Inline quick-controls for one configured method: enable/disable toggle,
 * display order, and (with typed confirmation) deletion when never used.
 */
export function SaveMethodForm({ method }: { method: PaymentMethodRow }) {
  return (
    <form action={saveMethod} className="mt-4 flex flex-wrap items-center gap-2 border-t border-navy-100 pt-3">
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="method_id" value={method.id} />
      <input type="hidden" name="label_en" value={method.label_en} />
      <input type="hidden" name="supported_currency" value={method.supported_currency} />
      <label className="flex items-center gap-2 text-xs text-navy-700">
        <input type="hidden" name="enabled" value="false" />
        <input
          type="checkbox"
          name="enabled"
          value="true"
          defaultChecked={method.enabled}
          className="h-4 w-4"
        />
        Enabled
      </label>
      <label className="flex items-center gap-1 text-xs text-navy-700">
        Order
        <input
          name="sort_order"
          type="number"
          min="0"
          max="9999"
          defaultValue={method.sort_order}
          className="w-16 rounded border border-navy-200 px-1.5 py-1 text-xs"
        />
      </label>
      <button
        type="submit"
        className="rounded-md border border-navy-200 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-50"
      >
        Apply
      </button>
    </form>
  );
}

export function DeleteMethodForm({ methodId, label }: { methodId: string; label: string }) {
  return (
    <form action={deleteMethod} className="flex items-center gap-1">
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="method_id" value={methodId} />
      <input
        name="confirm_label"
        placeholder={`Type "${label}" to delete`}
        required
        aria-label={`Type the method name to confirm deleting ${label}`}
        className="w-40 rounded border border-navy-200 px-1.5 py-1 text-xs"
      />
      <button
        type="submit"
        className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
