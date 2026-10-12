"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewSubmission } from "./actions";

/**
 * Approve / reject controls for one pending payment submission. The admin
 * verifies the reference against the real bKash/Nagad/bank/blockchain record
 * outside the system; the reason is stored with the decision.
 */
export function ReviewForm({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReason, setShowReason] = useState<"approve" | "reject" | null>(null);

  async function submit(decision: "approve" | "reject", reason: string) {
    setBusy(decision);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("submission_id", submissionId);
      fd.set("decision", decision);
      fd.set("reason", reason);
      const res = await reviewSubmission(fd);
      if (!res.ok) {
        setError(
          res.error === "verification_refused"
            ? "The database refused this decision — the order may already be paid. Refresh to see the current state."
            : "The decision could not be recorded. Refresh and check the submission state.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError("The decision could not be recorded. Refresh and check the submission state.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {showReason ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get("reason");
            void submit(showReason, String(reason ?? ""));
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            name="reason"
            maxLength={500}
            placeholder={showReason === "reject" ? "Reason shown to the customer" : "Internal note (optional)"}            className="w-64 rounded border border-navy-200 px-2 py-1.5 text-xs"
          />
          <button
            type="submit"
            disabled={busy !== null}
            className={
              showReason === "reject"
                ? "rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                : "rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            }
          >
            {busy ? "Saving…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setShowReason(null)}
            className="rounded-md border border-navy-200 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-50"
          >
            Back
          </button>
        </form>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setShowReason("approve")}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Approve payment
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setShowReason("reject")}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject…
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
