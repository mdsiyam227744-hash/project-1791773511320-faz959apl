import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { t, type Locale } from "@/lib/i18n";
import { getAirportsByIds, type AirportRow } from "@/lib/airports";
import { snapshotTotal, type OrderRow } from "@/lib/orders";
import { OrderStatusPill } from "@/components/order-status";

export const metadata = { title: "My service orders — VisaBridge Global" };

function routeLabel(order: OrderRow, airports: Map<string, AirportRow>): string {
  const o = order.origin_airport ? airports.get(order.origin_airport) ?? null : null;
  const d = order.destination_airport ? airports.get(order.destination_airport) ?? null : null;
  const code = (a: AirportRow | null) => (a ? a.iata_code ?? a.name : "—");
  return `${code(o)} → ${code(d)}`;
}

export default async function AccountOrders() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const locale: Locale = (profile?.locale as "en" | "bn") ?? "en";
  const supabase = createClient();
  const { data } = await supabase
    .from("service_orders")
    .select("*, order_price_snapshots(line_key, unit_amount, quantity, currency)")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const orders = (data ?? []) as unknown as (OrderRow & {
    order_price_snapshots?: { line_key: string; unit_amount: number; quantity: number; currency: string }[];
  })[];
  const airportIds = [
    ...new Set(orders.flatMap((o) => [o.origin_airport, o.destination_airport].filter((x): x is string => Boolean(x)))),
  ];
  const airports = new Map((await getAirportsByIds(airportIds)).map((a) => [a.id, a]));

  return (
    <div>
      <h1 className="text-2xl font-bold">{t(locale, "orders.title")}</h1>

      {orders.length === 0 ? (
        <p className="mt-4 rounded-lg border border-navy-100 bg-white p-6 text-sm text-navy-600">
          {t(locale, "orders.empty")}{" "}
          <Link href="/flights" className="underline">
            {t(locale, "nav.flights")}
          </Link>
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-navy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-navy-50 text-left text-navy-600">
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">{t(locale, "orders.service")}</th>
                <th className="px-4 py-2.5">{t(locale, "orders.route")}</th>
                <th className="px-4 py-2.5">{t(locale, "orders.status")}</th>
                <th className="px-4 py-2.5">{t(locale, "orders.total")}</th>
                <th className="px-4 py-2.5">{t(locale, "orders.placed")}</th>
                <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const snapLines = o.order_price_snapshots ?? [];
                const { total, currency } = snapshotTotal(snapLines);
                return (
                  <tr key={o.id} className="border-b border-navy-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/account/orders/${o.id}`} className="hover:underline">
                        {o.reference_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{o.service_label}</td>
                    <td className="px-4 py-3">{routeLabel(o, airports)}</td>
                    <td className="px-4 py-3">
                      <OrderStatusPill status={o.status} locale={locale} />
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {total} {currency}
                      <span className="block text-[11px] text-navy-400">{t(locale, "orders.priceFrozen")}</span>
                    </td>
                    <td className="px-4 py-3 text-navy-500">
                      {new Date(o.created_at).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB")}
                    </td>
                    <td className="px-4 py-3">
                      {o.status === "pending_payment" ? (
                        <Link
                          href={`/account/orders/${o.id}`}
                          className="rounded bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          {t(locale, "orders.pay")}
                        </Link>
                      ) : (
                        <Link href={`/account/orders/${o.id}`} className="text-xs underline">
                          {t(locale, "orders.view")}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
