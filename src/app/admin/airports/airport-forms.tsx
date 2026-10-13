"use client";

import { useState } from "react";
import { verifyAirport, mergeAirports, previewAirportImport, commitAirportImport, exportAirportsCsv } from "./actions";
import type { AirportGeo } from "@/lib/aviation";

/** Inline verify / reject / reset form on each airport row. */
export function AirportVerifyForm({ airport }: { airport: AirportGeo }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      action={async (fd: FormData) => {
        setBusy(true);
        try {
          await verifyAirport(fd);
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="airport_id" value={airport.id} />
      <input
        name="note"
        placeholder="Verification note (source, reason…)"
        className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
        aria-label="Verification note"
      />
      <div className="flex gap-1">
        <button
          name="decision"
          value="verified"
          disabled={busy}
          className="flex-1 rounded bg-emerald-700 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Verify
        </button>
        <button
          name="decision"
          value="rejected"
          disabled={busy}
          className="flex-1 rounded border border-red-300 px-2 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          name="decision"
          value="unverified"
          disabled={busy}
          className="rounded border border-navy-200 px-2 py-1.5 text-xs text-navy-600 disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </form>
  );
}

const REQUIRED_HEADER =
  "ident,name,iso_country,latitude,longitude,iata_code,icao_code,city_municipality,iso_region,airport_type,scheduled_service";

void REQUIRED_HEADER;

/** CSV import with preview (validation report) + explicit commit. */
export function CsvImportPanel() {
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-navy-100 bg-white p-4">
      <h3 className="text-sm font-bold">Import CSV</h3>
      <p className="mt-1 text-xs text-navy-500">
        Header must be exactly: <code className="text-navy-700">{REQUIRED_HEADER}</code>. A preview validates
        every row and records the batch; nothing is written until you commit. Verified rows are never
        overwritten by an import.
      </p>
      <form
        action={async (fd: FormData) => {
          setBusy(true);
          setSummary(null);
          try {
            await previewAirportImport(fd);
            setSummary("Preview recorded — review the batch below, then commit to apply accepted rows.");
          } finally {
            setBusy(false);
          }
        }}
        className="mt-3 space-y-2"
      >
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-xs"
          aria-label="CSV file"
        />
        <button
          disabled={busy}
          className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Validating…" : "Preview & validate"}
        </button>
      </form>
      {summary ? <p className="mt-2 text-xs text-emerald-700">{summary}</p> : null}
      <div className="mt-3 border-t border-navy-100 pt-3">
        <CommitImportForm onBatchId={setBatchId} batchId={batchId} />
      </div>
    </div>
  );
}

function CommitImportForm({ batchId, onBatchId }: { batchId: string | null; onBatchId: (v: string | null) => void }) {
  const [id, setId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [done, setDone] = useState(false);
  const valid = /^[0-9a-f-]{36}$/i.test(id.trim()) && confirmText === "replace";
  return done ? (
    <p className="text-xs text-emerald-700">Import committed — the airport table is updated.</p>
  ) : (
    <form
      action={async (fd: FormData) => {
        await commitAirportImport(fd);
        setDone(true);
        onBatchId(id.trim());
      }}
      className="space-y-2"
    >
      <label className="block text-xs font-medium text-navy-600" htmlFor="batch-id">
        Batch to commit (from the import history below)
      </label>
      <input
        id="batch-id"
        name="batch_id"
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="batch id…"
        className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
      />
      <label className="block text-xs font-medium text-navy-600" htmlFor="confirm-replace">
        Type <code>replace</code> to confirm applying accepted rows
      </label>
      <input
        id="confirm-replace"
        name="confirm"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
      />
      <button
        name="confirm"
        value="replace"
        disabled={!valid}
        className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
      >
        Commit accepted rows
      </button>
      {batchId ? <p className="text-xs text-navy-400">Last committed: {batchId}</p> : null}
    </form>
  );
}

/** Merge panel + CSV export. */
export function MergeAndExportPanel() {
  const [dupId, setDupId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const valid = /^[0-9a-f-]{36}$/i.test(dupId.trim()) && /^[0-9a-f-]{36}$/i.test(targetId.trim()) && dupId.trim() !== targetId.trim();

  async function downloadCsv() {
    setMsg("Preparing export…");
    const result = await exportAirportsCsv();
    const blob = new Blob([result.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visaairports-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`Exported ${result.count} active airports.`);
  }

  return (
    <div className="rounded-lg border border-navy-100 bg-white p-4">
      <h3 className="text-sm font-bold">Merge duplicates & export</h3>
      <p className="mt-1 text-xs text-navy-500">
        Merging re-points orders, routes, and fare records to the surviving airport, hides the duplicate, and
        records the action in the audit log. Nothing is deleted.
      </p>
      <form
        action={async (fd: FormData) => {
          await mergeAirports(fd);
          setMsg("Merge complete.");
        }}
        className="mt-3 space-y-2"
      >
        <input
          value={dupId}
          onChange={(e) => setDupId(e.target.value)}
          name="airport_id"
          placeholder="duplicate airport id…"
          className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
          aria-label="Duplicate airport id"
        />
        <input
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          name="target_id"
          placeholder="surviving (canonical) airport id…"
          className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
          aria-label="Canonical airport id"
        />
        <button
          disabled={!valid}
          className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40"
        >
          Merge duplicate into canonical
        </button>
      </form>
      <div className="mt-4 border-t border-navy-100 pt-3">
        <button
          onClick={downloadCsv}
          className="rounded-md border border-navy-200 px-3 py-2 text-xs font-semibold text-navy-700"
        >
          Export active airports (CSV)
        </button>
      </div>
      {msg ? <p className="mt-2 text-xs text-navy-500">{msg}</p> : null}
    </div>
  );
}

interface BatchRow {
  id: string;
  file_name: string;
  rows_total: number;
  rows_rejected: number;
  rows_updated: number;
  conflict_policy: string;
  created_at: string;
}

/** Server-rendered import history is fetched in the page; this is the inline list. */
export function ImportHistory({ batches = [] }: { batches?: BatchRow[] }) {
  if (batches.length === 0) {
    return (
      <p className="mt-4 text-xs text-navy-400">
        No imports yet. Batches appear here with their validation report after a preview.
      </p>
    );
  }
  return (
    <table className="mt-4 w-full text-xs">
      <thead>
        <tr className="border-b bg-navy-50 text-left text-navy-600">
          <th className="px-3 py-2">File</th>
          <th className="px-3 py-2">Rows</th>
          <th className="px-3 py-2">Rejected</th>
          <th className="px-3 py-2">Applied</th>
          <th className="px-3 py-2">Policy</th>
          <th className="px-3 py-2">When</th>
        </tr>
      </thead>
      <tbody>
        {batches.map((b) => (
          <tr key={b.id} className="border-b border-navy-100 last:border-0">
            <td className="px-3 py-2">{b.file_name}</td>
            <td className="px-3 py-2">{b.rows_total}</td>
            <td className="px-3 py-2 text-red-700">{b.rows_rejected}</td>
            <td className="px-3 py-2">{b.rows_updated}</td>
            <td className="px-3 py-2">{b.conflict_policy}</td>
            <td className="px-3 py-2">{String(b.created_at).slice(0, 16).replace("T", " ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
