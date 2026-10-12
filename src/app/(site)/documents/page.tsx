import type { Metadata } from "next";

export const metadata: Metadata = { title: "Required documents" };

const GROUPS = [
  {
    group: "All applications",
    items: [
      "Passport valid for at least 6 months beyond travel (scan of bio page)",
      "Recent passport-style photograph (per destination specification)",
      "Completed application form via your dashboard",
    ],
  },
  {
    group: "Tourist & visitor",
    items: [
      "Proof of funds (bank statements, typically 3–6 months)",
      "Travel itinerary / reservation",
      "Accommodation confirmation",
      "Employment or study letter (if applicable)",
    ],
  },
  {
    group: "Work & employment",
    items: [
      "Signed employment contract or offer from the verified employer",
      "Educational / technical certificates",
      "Experience letters",
      "Medical certificate as required by the destination",
      "Police clearance certificate where applicable",
    ],
  },
  {
    group: "Student",
    items: [
      "Admission / acceptance letter from the institution",
      "Proof of tuition payment or financial sponsorship",
      "Academic transcripts and certificates",
      "Language test results where required",
    ],
  },
  {
    group: "Business",
    items: [
      "Invitation letter from the host company",
      "Company registration documents",
      "Proof of business activities",
    ],
  },
  {
    group: "Family & dependent",
    items: [
      "Marriage / birth certificates proving the relationship",
      "Sponsor's status documents and proof of funds",
    ],
  },
];

export default function DocumentsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold">Required documents</h1>
      <p className="mt-2 text-navy-600">
        General guidance by application type. Your dashboard shows the exact list confirmed for your
        route — requirements vary by nationality and destination.
      </p>
      <div className="mt-8 space-y-6">
        {GROUPS.map((g) => (
          <section key={g.group} className="rounded-lg border border-navy-100 p-5">
            <h2 className="font-semibold">{g.group}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy-700">
              {g.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-8 text-xs text-navy-500">
        Upload documents only through your dashboard — never by email or messaging apps. Files are
        stored privately and are visible only to you and the case officers working your
        application.
      </p>
    </div>
  );
}
