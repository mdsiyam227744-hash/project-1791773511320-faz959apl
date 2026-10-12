import type { Metadata } from "next";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "FAQ" };

async function getFaqs() {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("faqs")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    return data ?? [];
  } catch {
    return [];
  }
}

export default async function FaqPage() {
  const faqs = await getFaqs();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold">Frequently asked questions</h1>
      {faqs.length === 0 ? (
        <p className="mt-6 rounded-lg border border-navy-100 bg-navy-50 p-6 text-navy-700">
          Questions are being prepared. Meanwhile, contact our team directly and we will answer
          personally.
        </p>
      ) : (
        <div className="mt-8 divide-y divide-navy-100">
          {faqs.map((f) => (
            <details key={f.id} className="group py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="mr-2 text-[var(--brand-secondary)]">▸</span>
                {f.question_en}
              </summary>
              <p className="mt-2 pl-6 text-sm leading-relaxed text-navy-700">{f.answer_en}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
