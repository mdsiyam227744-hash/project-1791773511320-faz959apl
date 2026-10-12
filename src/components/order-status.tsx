import { t, type Locale } from "@/lib/i18n";

const TONES: Record<string, string> = {
  payment_verified: "bg-emerald-50 text-emerald-700",
  accepted: "bg-emerald-50 text-emerald-700",
  booking_confirmed: "bg-emerald-50 text-emerald-700",
  ticketed: "bg-emerald-50 text-emerald-700",
  completed: "bg-navy-100 text-navy-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-navy-100 text-navy-700",
  refunded: "bg-navy-100 text-navy-700",
};

export function OrderStatusPill({ status, locale }: { status: string; locale: Locale }) {
  const label = t(locale, `ostatus.${status}` as never);
  const tone = TONES[status] ?? "bg-gold-50 text-gold-800";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}
