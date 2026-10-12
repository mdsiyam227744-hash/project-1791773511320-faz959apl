import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: "About" };

export default async function AboutPage() {
  const brand = await getBrand();
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold">{t(brand.defaultLocale, "about.title")}</h1>
      <div className="prose-legal mt-6">
        <p>
          {brand.businessName} is a private visa assistance, immigration support, overseas
          employment guidance, and travel services company. We help applicants understand
          requirements, prepare complete applications, and submit them to the correct official
          authorities.
        </p>
        <h2>What we do</h2>
        <ul className="list-disc pl-5">
          <li>Maintain a worldwide directory of countries, visa categories, and official requirements with sources.</li>
          <li>Review documents before submission so applications are complete the first time.</li>
          <li>Guide lawful overseas employment candidates towards verified, reviewed vacancies only.</li>
          <li>Provide honest cost estimates that separate official government fees from our service fees.</li>
        </ul>
        <h2>What we are not</h2>
        <p>
          We are not a government body and we are not affiliated with any embassy or consulate. We
          never guarantee visas, jobs, or immigration outcomes — official decisions rest solely with
          the relevant authorities. Where an official fee or processing time cannot be verified, we
          label it &ldquo;Not verified&rdquo; rather than guessing.
        </p>
        <h2>Our commitment</h2>
        <p>
          Clear pricing, sourced information, secure handling of your documents, and honest advice —
          including telling you when an application is unlikely to succeed.
        </p>
      </div>
    </div>
  );
}
