import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Application process" };

const STEPS = [
  {
    title: "1. Tell us your plan",
    body: "Create an account and submit an application with your destination, category, and travel window. You receive a reference number immediately.",
  },
  {
    title: "2. We verify requirements",
    body: "A case officer confirms the current official requirements, fees (government vs. service), and realistic processing times — with sources.",
  },
  {
    title: "3. Documents, reviewed",
    body: "You upload documents to your private dashboard. We check completeness before anything is submitted anywhere.",
  },
  {
    title: "4. Submission & tracking",
    body: "Your application is submitted to the relevant authority or application centre. Every status change appears in your dashboard with a timestamp.",
  },
  {
    title: "5. Decision & next steps",
    body: "We record the official outcome exactly as issued — approved or refused — and advise on next steps, including refusal grounds if applicable.",
  },
];

export default function ProcessPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold">Application process</h1>
      <ol className="mt-8 space-y-6">
        {STEPS.map((s) => (
          <li key={s.title} className="rounded-lg border border-navy-100 p-5">
            <h2 className="font-semibold text-navy-900">{s.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-navy-700">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex gap-3">
        <Link
          href="/register"
          className="rounded-md bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          Start an application
        </Link>
        <Link
          href="/documents"
          className="rounded-md border border-navy-200 px-5 py-3 text-sm font-semibold text-navy-700 hover:bg-navy-50"
        >
          See required documents
        </Link>
      </div>
    </div>
  );
}
