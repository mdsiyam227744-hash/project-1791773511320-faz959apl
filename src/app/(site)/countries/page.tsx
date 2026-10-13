import Link from "next/link";
import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { listCountries } from "@/lib/catalog";
import { CorridorSearch } from "./corridor-search";

export const metadata: Metadata = { title: "Countries & Destinations" };

export default async function CountriesPage() {
  const brand = await getBrand();
  const locale = brand.defaultLocale;
  const countries = await listCountries();
  const bn = locale === "bn";

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-bold">{t(locale, "countries.title")}</h1>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-navy-600">
        {bn
          ? "আমাদের ডিরেক্টরিতে থাকা উৎপত্তি ও গন্তব্য দেশসমূহ। দেশ নির্বাচন করলে সেখানকার ভিসার ধরন, প্রয়োজনীয় কাগজপত্র ও যাচাইকৃত ফি-র তথ্য দেখা যায়।"
          : "Origin and destination countries in our directory. Open a country to see available visa categories, requirements, and verified fee records."}
      </p>

      {countries.length === 0 ? (
        <div className="mt-8 rounded-lg border border-navy-100 bg-navy-50 p-6">
          <p className="text-base leading-relaxed text-navy-700">
            {bn
              ? "দেশের ডিরেক্টরি এখন প্রস্তুত হচ্ছে। আমাদের টিম ইতিমধ্যে প্রধান গন্তব্যগুলোতে সহায়তা করে — বাংলাদেশি ও দক্ষিণ এশীয় পাসপোর্টধারীদের জন্য এর মধ্যে রয়েছে থাইল্যান্ড, মালয়েশিয়া, সিঙ্গাপুর, সংযুক্ত আরব আমিরাত, সৌদি আরব, কাতার, যুক্তরাজ্য, যুক্তরাষ্ট্র, কানাডা, অস্ট্রেলিয়া ও জাপান।"
              : "The country directory is being prepared right now. Our team already assists with the major destinations — for Bangladeshi and South Asian passport holders these include Thailand, Malaysia, Singapore, the United Arab Emirates, Saudi Arabia, Qatar, the United Kingdom, the United States, Canada, Australia, and Japan, among others."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {bn ? "আপনার গন্তব্য সম্পর্কে জিজ্ঞাসা করুন" : "Ask about your destination"}
            </Link>
            <Link
              href="/visa-categories"
              className="rounded-md border border-navy-200 px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
            >
              {t(locale, "nav.visas")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <CorridorSearch
            countries={countries.map((c) => ({
              id: c.id,
              iso2: c.iso2,
              name_en: c.name_en,
              name_bn: c.name_bn,
              region: c.region,
            }))}
            destinationLabel={bn ? "গন্তব্য দেশ" : "Destination country"}
            originLabel={bn ? "অঞ্চল" : "Region of origin"}
            searchLabel={bn ? "দেশ খুঁজুন" : "Search countries"}
            clearLabel={bn ? "মুছুন" : "Clear"}
            noneLabel={bn ? "নির্বাচিত গন্তব্য" : "Selected destination"}
          />
        </div>
      )}
    </div>
  );
}
