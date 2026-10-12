import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegal, getBrand } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const doc = await getLegal("terms");
  return { title: doc?.title_en ?? "Terms & conditions" };
}

export default async function TermsPage() {
  const [brand, doc] = await Promise.all([getBrand(), getLegal("terms")]);
  if (!doc) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold">{doc.title_en}</h1>
      <div className="prose-legal mt-6 whitespace-pre-line text-sm leading-relaxed">
        {doc.body_en}
      </div>
      <p className="mt-8 text-xs text-navy-500">
        © {new Date().getFullYear()} {brand.businessName}
      </p>
    </div>
  );
}
