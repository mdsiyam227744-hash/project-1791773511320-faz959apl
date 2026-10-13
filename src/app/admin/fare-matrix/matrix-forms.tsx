"use client";

import { useState } from "react";
import { importFareCsv, exportFareMatrixCsv } from "./actions";

const REQUIRED_HEADER =
  "origin_iso,destination_iso,one_way_eur,return_eur,lowest_city_pair,observation_from,observation_to,observation_count,source_url,source_license";

const TEMPLATE_ROWS = `BD,GB,412.00,,London Gatwick → London,2026-09-01,2026-10-01,58,https://example.com/source,CC-BY-4.0
BD,AE,,155.00,Dhaka → Dubai (derived from two one-way medians),2026-09-01,2026-10-01,,https://example.com/source,CC-BY-4.0`;

/** Download the import template — header + example rows clearly marked. */
export function TemplateDownload() {
  const download = () => {
    const csv = [
      REQUIRED_HEADER,
      "# Example rows below are EXAMPLES — delete them before importing real data.",
      TEMPLATE_ROWS,
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fare-matrix-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      onClick={download}
      className="rounded-md border border-navy-200 px-3 py-2 text-xs font-semibold text-navy-700"
    >
      Download template
    </button>
  );
}

/** Bulk CSV import: validate → accepted rows saved as needs_review only. */
export function FareCsvImportPanel() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-lg border border-navy-100 bg-white p-4">
      <h3 className="text-sm font-bold">Bulk import fares (CSV)</h3>
      <p className="mt-1 text-xs text-navy-500">
        Header must be exactly <code className="text-navy-700">{REQUIRED_HEADER}</code>. Rows are validated
        (positive amounts, ISO dates, a source for every price); accepted rows are saved as{" "}
        <strong>needs_review</strong> — nothing publishes without an explicit approval below. Imported{" "}
        <em>return</em> amounts are stored as derived round-trip references, never as observed return tickets.
        Verified rows are never overwritten by an import.
      </p>
      <form
        action={async (fd: FormData) => {
          setBusy(true);
          try {
            await importFareCsv(fd);
            setDone(true);
          } finally {
            setBusy(false);
          }
        }}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block text-xs"
          aria-label="Fare CSV file"
        />
        <button
          disabled={busy}
          className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Validating…" : "Validate & import"}
        </button>
        <TemplateDownload />
      </form>
      {done ? (
        <p className="mt-2 text-xs text-emerald-700">
          Import processed — accepted rows are in the needs_review queue below; rejections and conflicts are in
          the audit log.
        </p>
      ) : null}
    </div>
  );
}

/** CSV export of the whole current dataset (every state, for external review). */
export function ExportButton() {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const result = await exportFareMatrixCsv();
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fare-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="rounded-md border border-navy-200 px-3 py-2 text-xs font-semibold text-navy-700 disabled:opacity-50"
    >
      {busy ? "Preparing…" : "Export dataset (CSV)"}
    </button>
  );
}
