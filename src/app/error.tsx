"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-navy-600">
        The page could not be loaded. No details are shown for privacy reasons — please try again.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
