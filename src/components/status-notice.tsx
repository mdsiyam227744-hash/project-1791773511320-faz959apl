"use client";

import { useState } from "react";

/**
 * Dismissible site-wide status banner (the dismiss state is per page view, so
 * the notice stays honest for the next visitor until an administrator retires
 * it in the database). Rendered at the top of the public site layout.
 */
export function StatusNotice({
  message,
  severity,
}: {
  message: string;
  severity: "info" | "warning";
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      className={`flex items-start gap-3 px-4 py-3 text-sm ${
        severity === "warning"
          ? "bg-gold-100 text-gold-900"
          : "bg-navy-50 text-navy-800"
      }`}
    >
      <p className="flex-1 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss notice"
        className="rounded p-1 text-current opacity-70 hover:opacity-100 focus-visible:outline-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
