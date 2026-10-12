"use client";

import { useActionState } from "react";
import { submitApplication, type ApplyState } from "./actions";

interface Props {
  countries: { iso2: string; name: string }[];
  categories: { code: string; label: string }[];
  selectedVisaId: string | null;
  selectedVisaName: string | null;
}

const initial: ApplyState = {};

export default function ApplyForm({ countries, categories, selectedVisaId, selectedVisaName }: Props) {
  const [state, formAction, pending] = useActionState(submitApplication, initial);

  if (state.ok && state.reference) {
    return (
      <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <p className="font-medium text-emerald-900">Application received.</p>
        <p className="mt-1 text-sm text-emerald-800">
          Your reference number:{" "}
          <strong className="font-mono text-base">{state.reference}</strong>
        </p>
        <p className="mt-2 text-sm text-emerald-800">
          Keep this number — you can track progress from your dashboard at any time.
        </p>
        <a
          href="/account"
          className="mt-4 inline-block rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Go to my dashboard
        </a>
      </div>
    );
  }

  const inputCls = "w-full rounded-md border border-navy-200 px-3 py-2 text-sm";

  return (
    <form action={formAction} className="mt-8 space-y-4 rounded-xl border border-navy-100 p-6">
      {state.error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error === "invalid"
            ? "Please complete all required fields."
            : "The application could not be submitted right now. Please try again."}
        </p>
      ) : null}

      {selectedVisaId && selectedVisaName ? (
        <div className="rounded-md bg-navy-50 p-3 text-sm">
          <input type="hidden" name="visa_listing_id" value={selectedVisaId} />
          Selected service: <strong>{selectedVisaName}</strong>
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Destination country</span>
        <select name="destination_iso2" className={inputCls} required defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {countries.map((c) => (
            <option key={c.iso2} value={c.iso2}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Visa category</span>
        <select name="category" className={inputCls} required defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Planned travel date (optional)</span>
        <input type="date" name="travel_date" className={inputCls} />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Tell us about your plan</span>
        <textarea name="notes" rows={4} className={inputCls} maxLength={4000} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit application"}
      </button>
      <p className="text-xs text-navy-500">
        Submitting creates a real application record in our system. We never guarantee visa
        outcomes — official decisions rest with the authorities.
      </p>
    </form>
  );
}
