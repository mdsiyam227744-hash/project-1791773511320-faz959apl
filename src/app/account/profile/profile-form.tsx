"use client";

import { useState } from "react";
import { updateProfile } from "./actions";

interface Props {
  initial: {
    full_name: string;
    phone: string;
    city: string;
    country_iso2: string;
    locale: string;
  };
  countries: { iso2: string; name: string }[];
  locales: { code: string; label: string }[];
}

export default function ProfileForm({ initial, countries, locales }: Props) {
  const [saved, setSaved] = useState(false);
  const inputCls = "w-full rounded-md border border-navy-200 px-3 py-2 text-sm";

  return (
    <form
      action={async (fd) => {
        await updateProfile(fd);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }}
      className="mt-6 space-y-4 rounded-xl border border-navy-100 bg-white p-6"
    >
      {saved ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Profile saved.
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Full name</span>
        <input name="full_name" defaultValue={initial.full_name} className={inputCls} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Phone</span>
        <input name="phone" type="tel" defaultValue={initial.phone} className={inputCls} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">City</span>
        <input name="city" defaultValue={initial.city} className={inputCls} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Country of residence</span>
        <select name="country_iso2" defaultValue={initial.country_iso2} className={inputCls}>
          <option value="">—</option>
          {countries.map((c) => (
            <option key={c.iso2} value={c.iso2}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Language</span>
        <select name="locale" defaultValue={initial.locale} className={inputCls}>
          {locales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        Save profile
      </button>
    </form>
  );
}
