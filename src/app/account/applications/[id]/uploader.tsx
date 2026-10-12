import { uploadDocument, deleteDocument } from "./actions";

interface Doc {
  id: string;
  kind: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
}

const KINDS = [
  ["passport_scan", "Passport scan"],
  ["photo", "Photograph"],
  ["bank_statement", "Bank statement"],
  ["employment_letter", "Employment letter"],
  ["admission_letter", "Admission letter"],
  ["invitation_letter", "Invitation letter"],
  ["police_clearance", "Police clearance"],
  ["medical_certificate", "Medical certificate"],
  ["marriage_certificate", "Marriage certificate"],
  ["birth_certificate", "Birth certificate"],
  ["other", "Other"],
];

export default function DocumentUploader({
  applicationId,
  existing,
}: {
  applicationId: string;
  existing: Doc[];
}) {
  return (
    <section className="rounded-lg border border-navy-100 bg-white p-5">
      <h2 className="font-semibold">Documents</h2>
      {existing.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm">
          {existing.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 border-b border-navy-100 pb-2">
              <div>
                <p className="font-medium">{d.file_name}</p>
                <p className="text-xs text-navy-500">
                  {d.kind} · {d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB` : ""} ·{" "}
                  {new Date(d.created_at).toLocaleDateString("en-GB")}
                </p>
              </div>
              <form action={deleteDocument}>
                <input type="hidden" name="document_id" value={d.id} />
                <button
                  type="submit"
                  className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  aria-label={`Delete ${d.file_name}`}
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-navy-500">No documents uploaded yet.</p>
      )}

      <form action={uploadDocument} className="mt-4 space-y-2">
        <input type="hidden" name="application_id" value={applicationId} />
        <label className="block text-xs font-medium text-navy-600">
          Document type
          <select name="kind" className="mt-1 w-full rounded-md border border-navy-200 px-2 py-1.5 text-sm" required>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-navy-600">
          File (PDF, JPG, PNG, WebP — max 10 MB)
          <input
            type="file"
            name="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            required
            className="mt-1 w-full text-sm"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md border border-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[var(--brand-primary)] hover:bg-navy-50"
        >
          Upload
        </button>
      </form>
      <p className="mt-2 text-xs text-navy-500">
        Files are private — visible only to you and the case team assigned to this application.
      </p>
    </section>
  );
}
