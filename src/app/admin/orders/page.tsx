import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { getAirportsByIds, type AirportRow } from "@/lib/airports";
import { snapshotTotal, ORDER_TRANSITIONS, type OrderStatus } from "@/lib/orders";
import { OrderStatusPill } from "@/components/order-status";
import { orderAction, confirmBooking, markTicketed, addOrderNote } from "./actions";

export const metadata = { title: "Orders — Admin" };

const OPEN_STATUSES: OrderStatus[] = [
  "payment_verified",
  "accepted",
  "info_requested",
  "booking_confirmed",
  "ticketed",
];

interface AdminOrderRow {
  id: string;
  reference_no: string;
  status: OrderStatus;
  status_note: string | null;
  service_label: string;
  origin_country: string | null;
  destination_country: string | null;
  origin_airport: string | null;
  destination_airport: string | null;
  depart_date: string | null;
  return_date: string | null;
  trip_type: string | null;
  passengers: number | null;
  cabin_class: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  contact_imo: string | null;
  notes: string | null;
  external_booking_ref: string | null;
  created_at: string;
  order_price_snapshots: { line_key: string; unit_amount: number; quantity: number; currency: string }[] | null;
  customer: { full_name: string | null; email: string | null } | null;
}

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaff();
  const { status } = await searchParams;
  const supabase = createClient();

  let query = supabase
    .from("service_orders")
    .select(
      `*, order_price_snapshots(line_key, unit_amount, quantity, currency),
       customer:profiles(full_name)`,
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "all") {
    // no filter
  } else if (status) {
    query = query.eq("status", status);
  } else {
    query = query.in("status", OPEN_STATUSES);
  }
  const { data } = await query;
  const orders = (data ?? []) as unknown as (Omit<AdminOrderRow, "customer"> & {
    customer: { full_name: string | null }[] | null;
  })[];

  const airportIds = [
    ...new Set(
      orders.flatMap((o) => [o.origin_airport, o.destination_airport].filter((x): x is string => Boolean(x))),
    ),
  ];
  const airports = new Map((await getAirportsByIds(airportIds)).map((a) => [a.id, a]));
  const code = (id: string | null) => {
    if (!id) return "—";
    const a = airports.get(id) as AirportRow | undefined;
    return a ? a.iata_code ?? a.name : "—";
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Service orders</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy-600">
        Accepting an order confirms <em>we will perform the service</em>. It is never a confirmation of an
        airline reservation or a visa — a booking appears here only after you record the real provider
        reference, and a visa decision is never ours to make.
      </p>

      <form method="get" className="mt-4 flex flex-wrap gap-2">
        <select name="status" defaultValue={status ?? ""} className="rounded-md border border-navy-200 px-3 py-2 text-sm">
          <option value="">Open orders</option>
          <option value="all">All statuses</option>
          {(Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
          Filter
        </button>
      </form>

      <div className="mt-4 space-y-4">
        {orders.map((o) => {
          const lines = o.order_price_snapshots ?? [];
          const { total, currency } = snapshotTotal(lines);
          const transitions = ORDER_TRANSITIONS[o.status] ?? [];
          const cust = (o.customer as unknown as { full_name: string | null }[] | null)?.[0];
          return (
            <article key={o.id} className="rounded-xl border border-navy-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-mono text-sm font-bold">
                    <Link href={`/account/orders/${o.id}`} className="hover:underline">
                      {o.reference_no}
                    </Link>
                  </h2>
                  <p className="text-sm text-navy-600">
                    {cust?.full_name ?? "—"} · {o.service_label} · {code(o.origin_airport)} →{" "}
                    {code(o.destination_airport)} · {o.depart_date}
                    {o.return_date ? ` / ${o.return_date}` : ""} · {o.passengers} pax · {o.cabin_class}
                  </p>
                </div>
                <div className="text-right">
                  <OrderStatusPill status={o.status} locale="en" />
                  <p className="mt-1 font-mono text-sm">
                    {total.toFixed(2)} {currency}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Contact</p>
                  <p>{o.contact_phone ?? "—"}</p>
                  <p className="text-navy-600">
                    {o.contact_whatsapp ? `WA: ${o.contact_whatsapp}` : ""}
                    {o.contact_imo ? ` · imo: ${o.contact_imo}` : ""}
                  </p>
                  {o.contact_whatsapp ? (
                    <a
                      className="inline-block text-xs text-emerald-700 underline"
                      href={`https://wa.me/${o.contact_whatsapp.replace(/[^\d]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      WhatsApp the customer
                    </a>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Customer note</p>
                  <p className="text-navy-600">{o.notes ?? "—"}</p>
                  {o.external_booking_ref ? (
                    <p className="mt-1 font-mono text-xs">PNR: {o.external_booking_ref}</p>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Status note</p>
                  <p className="text-navy-600">{o.status_note ?? "—"}</p>
                </div>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-[var(--brand-primary)]">
                  Operate
                </summary>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  <form action={orderAction} className="space-y-2">
                    <input type="hidden" name="order_id" value={o.id} />
                    <select name="action" className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs">
                      {transitions
                        .filter((s) => ["accepted", "info_requested", "rejected", "cancelled"].includes(s))
                        .map((s) => (
                          <option key={s} value={s === "accepted" ? "accept" : s === "info_requested" ? "info_request" : s === "rejected" ? "reject" : "cancel"}>
                            {s}
                          </option>
                        ))}
                    </select>
                    <input
                      name="note"
                      placeholder="Note to customer (visible in their order page)"
                      className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
                    />
                    <button className="w-full rounded bg-[var(--brand-primary)] px-2 py-1.5 text-xs font-semibold text-white">
                      Apply
                    </button>
                  </form>

                  {transitions.includes("booking_confirmed") ? (
                    <form action={confirmBooking} className="space-y-2">
                      <input type="hidden" name="order_id" value={o.id} />
                      <input
                        name="booking_ref"
                        required
                        minLength={4}
                        placeholder="Provider booking reference (PNR) — required"
                        className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
                      />
                      <input name="note" placeholder="Internal note" className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs" />
                      <button className="w-full rounded bg-emerald-700 px-2 py-1.5 text-xs font-semibold text-white">
                        Confirm booking (records real PNR)
                      </button>
                    </form>
                  ) : null}

                  {transitions.includes("ticketed") ? (
                    <form action={markTicketed} className="space-y-2">
                      <input type="hidden" name="order_id" value={o.id} />
                      <input name="note" placeholder="Internal note" className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs" />
                      <button className="w-full rounded bg-emerald-700 px-2 py-1.5 text-xs font-semibold text-white">
                        Mark ticket issued
                      </button>
                    </form>
                  ) : null}

                  <form action={addOrderNote} className="space-y-2">
                    <input type="hidden" name="order_id" value={o.id} />
                    <input name="note" required placeholder="Message to customer" className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs" />
                    <button className="w-full rounded border border-navy-300 px-2 py-1.5 text-xs font-semibold text-navy-700">
                      Send message
                    </button>
                  </form>
                </div>
              </details>
            </article>
          );
        })}
        {orders.length === 0 ? (
          <p className="rounded-lg border border-navy-100 bg-white p-6 text-center text-sm text-navy-500">
            No orders match this filter.
          </p>
        ) : null}
      </div>
    </div>
  );
}
