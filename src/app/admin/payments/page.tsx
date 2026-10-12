import { requireStaff } from "@/lib/auth";
import { listAllMethods, listPendingSubmissions, KIND_LABELS, type PaymentMethodRow } from "@/lib/payment-methods";
import { MethodEditor } from "./method-editor";
import { ReviewForm } from "./review-form";
import { SaveMethodForm, DeleteMethodForm } from "./method-forms";

export const metadata = { title: "Payment methods — VisaBridge Global Admin" };

function detailsFor(m: PaymentMethodRow): { label: string; value: string }[] {
  switch (m.kind) {
    case "bkash":
    case "nagad":
      return [
        { label: "Wallet / merchant number", value: m.wallet_number ?? "—" },
        { label: "Account name", value: m.account_name ?? "—" },
        { label: "Currency", value: m.supported_currency },
      ];
    case "bank":
      return [
        { label: "Bank / account", value: [m.account_number, m.iban ?? m.iban_alt].filter(Boolean).join(" · ") || "—" },
        { label: "SWIFT / routing / branch", value: [m.swift, m.routing_number, m.branch].filter(Boolean).join(" · ") || "—" },
        { label: "Account name", value: m.account_name ?? "—" },
        { label: "Currency", value: m.supported_currency },
      ];
    case "crypto":
      return [
        { label: "Address", value: m.receiving_address ?? "—" },
        { label: "Network", value: m.network ?? "—" },
        { label: "Minimum", value: m.min_amount !== null ? `${m.min_amount}` : "—" },
        { label: "Currency", value: m.supported_currency },
      ];
    case "gateway":
      return [
        { label: "Provider", value: m.gateway_name ?? "—" },
        { label: "Currency", value: m.supported_currency },
      ];
  }
}

export default async function AdminPaymentsPage() {
  const { staff } = await requireStaff();
  const [methods, pending] = await Promise.all([listAllMethods(), listPendingSubmissions()]);
  const isSuper = staff.role === "super_admin";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-navy-900">Payment methods</h1>
        <p className="mt-1 text-sm text-navy-600">
          Configure how customers pay. Enabled methods appear on the customer checkout immediately;
          disabling hides them without touching past orders or submissions.
        </p>
      </header>

      <section className="rounded-xl border border-navy-100 bg-white">
        <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">
            Pending verification ({pending.length})
          </h2>
        </div>
        {pending.length === 0 ? (
          <p className="px-4 py-6 text-sm text-navy-500">No submissions awaiting verification.</p>
        ) : (
          <ul className="divide-y divide-navy-100">
            {pending.map((s) => (
              <li key={s.id} className="px-4 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">
                      {s.order_reference} · {KIND_LABELS[s.method_kind].en}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-navy-600">Ref: {s.submitted_reference}</p>
                    <p className="mt-0.5 text-xs text-navy-500">
                      {s.amount.toFixed(2)} {s.currency} · submitted{" "}
                      {new Date(s.created_at).toLocaleString("en-GB")}
                    </p>
                    {s.note ? <p className="mt-1 text-xs text-navy-600">Note: {s.note}</p> : null}
                  </div>
                  <ReviewForm submissionId={s.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">
            Configured methods ({methods.length})
          </h2>
          {isSuper ? <MethodEditor mode="create" /> : null}
        </div>

        {methods.length === 0 ? (
          <p className="rounded-xl border border-dashed border-navy-200 bg-white px-4 py-8 text-center text-sm text-navy-500">
            No payment methods configured yet. Customers will see no payment options until one is added
            and enabled.
          </p>
        ) : (
          <ul className="space-y-4">
            {methods.map((m) => (
              <li key={m.id} className="rounded-xl border border-navy-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">
                      {m.label_en}
                      {m.label_bn ? <span className="ml-2 text-navy-500">{m.label_bn}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-navy-400">
                      {KIND_LABELS[m.kind].en} · sort {m.sort_order}
                    </p>
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-navy-700 sm:grid-cols-2">
                      {detailsFor(m).map((d) => (
                        <div key={d.label} className="flex gap-2">
                          <dt className="text-navy-400">{d.label}:</dt>
                          <dd className="font-mono">{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {m.instructions_en ? (
                      <p className="mt-2 max-w-prose text-xs text-navy-600">{m.instructions_en}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={
                        m.enabled
                          ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                          : "rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-medium text-navy-600"
                      }
                    >
                      {m.enabled ? "Enabled" : "Disabled"}
                    </span>
                    {isSuper ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <MethodEditor mode="edit" method={m} />
                        <DeleteMethodForm methodId={m.id} label={m.label_en} />
                      </div>
                    ) : null}
                  </div>
                </div>
                {isSuper ? <SaveMethodForm method={m} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
