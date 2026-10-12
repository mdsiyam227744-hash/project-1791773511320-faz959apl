import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { t, type Locale } from "@/lib/i18n";
import { getAirportsByIds, type AirportRow } from "@/lib/airports";
import { getOrderSnapshot, snapshotTotal, getOrderEvents, type OrderRow } from "@/lib/orders";
import { OrderStatusPill } from "@/components/order-status";
import { OrderActions } from "./order-actions";

export const metadata = { title: "Service order — VisaBridge Global" };

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const locale: Locale = (profile?.locale as "en" | "bn") ?? "en";
  const supabase = createClient();

  const { data } = await supabase.from("service_orders").select("*").eq("id", id).maybeSingle();
  const order = data as unknown as OrderRow | null;
  if (!order || order.customer_id !== user.id) notFound();

  const [lines, events, airports] = await Promise.all([
    getOrderSnapshot(order.id),
    getOrderEvents(order.id),
    getAirportsByIds([order.origin_airport, order.destination_airport].filter((x): x is string => Boolean(x))),
  ]);
  const airportMap = new Map(airports.map((a) => [a.id, a]));
  const { total, currency } = snapshotTotal(lines);
  const origin = order.origin_airport ? airportMap.get(order.origin_airport) : null;
  const dest = order.destination_airport ? airportMap.get(order.destination_airport) : null;
  const payments = await supabase
    .from("payment_transactions")
    .select("status, amount, currency, provider, provider_ref, confirmed_at")
    .eq("order_id", order.id);
  const paymentRows = (payments.data ?? []) as unknown as {
    status: string;
    amount: number;
    currency: string;
    provider: string;
    provider_ref: string | null;
    confirmed_at: string | null;
  }[];
  const confirmed = paymentRows.find((p) => p.status === "confirmed");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{order.reference_no}</h1>
          <p className="mt-1 text-sm text-navy-600">{order.service_label}</p>
        </div>
        <OrderStatusPill status={order.status} locale={locale} />
      </div>

      <section className="rounded-xl border border-navy-100 bg-white p-4 md:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">
          {t(locale, "orders.route")}
        </h2>
        <p className="mt-2 text-lg font-semibold">
          {origin ? `${origin.iata_code ?? origin.name}` : "—"} → {dest ? `${dest.iata_code ?? dest.name}` : "—"}
        </p>
        <p className="text-sm text-navy-600">
          {origin ? `${origin.name}${origin.city_municipality ? `, ${origin.city_municipality}` : ""} (${origin.iso_country})` : ""}
          <br />
          {dest ? `${dest.name}${dest.city_municipality ? `, ${dest.city_municipality}` : ""} (${dest.iso_country})` : ""}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-navy-500">{t(locale, "flights.departDate")}</dt>
            <dd>{order.depart_date ?? "—"}</dd>
          </div>
          {order.return_date ? (
            <div>
              <dt className="text-navy-500">{t(locale, "flights.returnDate")}</dt>
              <dd>{order.return_date}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-navy-500">{t(locale, "flights.passengers")}</dt>
            <dd>{order.passengers ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-navy-500">{t(locale, "flights.cabin")}</dt>
            <dd>{order.cabin_class ? t(locale, `flights.cabin.${order.cabin_class}` as never) : "—"}</dd>
          </div>
        </dl>
        {order.trip_type === "one_way" || order.trip_type === "return" ? (
          <p className="mt-2 text-xs uppercase tracking-wide text-navy-400">
            {t(locale, order.trip_type === "one_way" ? "flights.oneWay" : "flights.roundTrip")}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-navy-100 bg-white p-4 md:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">
          {t(locale, "orders.total")}
        </h2>
        <ul className="mt-3 space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.line_key} className="flex justify-between gap-4">
              <span>
                {locale === "bn" && l.label_bn ? l.label_bn : l.label_en}
                {l.quantity > 1 ? ` × ${l.quantity}` : ""}
              </span>
              <span className="font-mono">
                {(Number(l.unit_amount) * l.quantity).toFixed(2)} {l.currency}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-navy-100 pt-3 text-sm font-semibold">
          <span>{t(locale, "orders.total")}</span>
          <span className="font-mono">
            {total.toFixed(2)} {currency ?? ""}
          </span>
        </p>
        <p className="mt-1 text-xs text-navy-400">{t(locale, "orders.priceFrozen")}</p>
      </section>

      {order.status === "pending_payment" ? (
        <section className="rounded-xl border border-navy-100 bg-white p-4 md:p-6">
          <OrderActions locale={locale} orderId={order.id} payable />
        </section>
      ) : null}

      {confirmed ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 md:p-6">
          <h2 className="text-sm font-semibold text-emerald-800">{t(locale, "ostatus.payment_verified")}</h2>
          <p className="mt-1 text-sm text-emerald-700">
            {confirmed.amount.toFixed(2)} {confirmed.currency} · {confirmed.provider}
            {confirmed.confirmed_at
              ? ` · ${new Date(confirmed.confirmed_at).toLocaleString(locale === "bn" ? "bn-BD" : "en-GB")}`
              : ""}
          </p>
        </section>
      ) : null}

      {order.external_booking_ref ? (
        <section className="rounded-xl border border-navy-100 bg-white p-4 md:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">
            {t(locale, "orders.externalRef")}
          </h2>
          <p className="mt-1 font-mono text-sm">{order.external_booking_ref}</p>
          <p className="mt-1 text-xs text-navy-500">
            {locale === "bn"
              ? "এই রেফারেন্সটি আমাদের টিম প্রোভাইডারের কাছ থেকে নিশ্চিত করেছে — সিস্টেম কখনো নিজে থেকে বুকিং নম্বর তৈরি করে না।"
              : "This reference was confirmed by our team with the provider — the system never generates booking numbers by itself."}
          </p>
        </section>
      ) : null}

      {order.status_note ? (
        <p className="rounded-md border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-gold-900">
          {order.status_note}
        </p>
      ) : null}

      <section className="rounded-xl border border-navy-100 bg-white p-4 md:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">History</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {events.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-navy-400">
                {new Date(ev.created_at).toLocaleString(locale === "bn" ? "bn-BD" : "en-GB")}
              </span>
              <OrderStatusPill status={ev.to_status} locale={locale} />
              {ev.note ? <span className="text-navy-600">{ev.note}</span> : null}
            </li>
          ))}
          {events.length === 0 ? <li className="text-navy-500">—</li> : null}
        </ol>
      </section>
    </div>
  );
}
