import { t, type Locale } from "@/lib/i18n";

const TONES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  refused: "bg-red-50 text-red-700",
  closed: "bg-navy-100 text-navy-700",
  withdrawn: "bg-navy-100 text-navy-700",
};

export function StatusPill({ status, locale }: { status: string; locale: Locale }) {
  const label = t(locale, `status.${status}` as never);
  const tone = TONES[status] ?? "bg-gold-50 text-gold-800";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}
