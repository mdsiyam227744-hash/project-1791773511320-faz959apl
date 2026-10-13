"use client";

import { useState } from "react";
import { AirportPicker, type AirportSuggestion } from "@/app/(site)/flights/airport-picker";

/**
 * Hidden airport-id field for staff forms: the visible control is the shared
 * dataset-backed autocomplete, the submitted value is the airport's id.
 */
export function AirportIdField({ name, label }: { name: string; label: string }) {
  const [value, setValue] = useState<AirportSuggestion | null>(null);
  return (
    <div>
      <input type="hidden" name={name} value={value?.id ?? ""} />
      <AirportPicker
        label={label}
        placeholder="Search airport by name, city, or code…"
        locale="en"
        value={value}
        onChange={setValue}
        inputId={`${name}-picker`}
      />
    </div>
  );
}
