"use client";

/**
 * Manual payment checkout for one pending order. Shows the administrator-
 * configured method options with their live instructions (bKash / Nagad
 * number, bank details, crypto address + network warning), collects the
 * transaction reference and optional proof, and submits for staff
 * verification. While pending, the order shows exactly that status — never a
 * fake confirmation.
 */
import { useActionState } from "react";
import { submitManualPayment, type ManualPaymentState } from "./payment-actions";
import { t, type Locale } from "@/lib/i18n";
import type { PaymentMethodRow } from "@/lib/payment-methods";

function methodDetails(m: PaymentMethodRow): { label: string; value: string; mono?: boolean }[] {
  switch (m.kind) {
    case "bkash":
    case "nagad":
      return [
        { label: "Number", value: m.wallet_number ?? "—", mono: true },
        { label: "Name", value: m.account_name ?? "—" },
      ];
    case "bank":
      return [
        { label: "Account", value: m.account_number ?? "—", mono: true },
        { label: "Name", value: m.account_name ?? "—" },
        { label: "Branch", value: [m.branch, m.routing_number].filter(Boolean).join(" · ") || "—" },
        ...(m.iban ? [{ label: "IBAN", value: m.iban, mono: true }] : []),
        ...(m.swift ? [{ label: "SWIFT", value: m.swift, mono: true }] : []),
      ];
    case "crypto":
      return [
        { label: "Address", value: m.receiving_address ?? "—", mono: true },
        { label: "Network", value: m.network ?? "—" },
        ...(m.min_amount !== null ? [{ label: "Minimum", value: String(m.min_amount) }] : []),
      ];
    case "gateway":
      return [{ label: "Provider", value: m.gateway_name ?? "—" }];
  }
}

export function ManualPaymentForm({
  locale,
  orderId,
  orderReference,
  methods,
}: {
  locale: Locale;
  orderId: string;
  orderReference: string;
  methods: PaymentMethodRow[];
}) {
  const initialState: ManualPaymentState = { ok: false, error: undefined };
  const [state, action, pending] = useActionState(submitManualPayment, initialState);

  const manual = methods.filter((m) => m.kind !== "gateway");
  const gateway = methods.find((m) => m.kind === "gateway");

  return (
    <div className="space-y-4">
      <p className="text-sm text-navy-600">
        {locale === "bn"
          ? "নিচের যেকোনো মাধ্যমে মোট টাকা পাঠান, তারপর আপনার ট্রানজেকশন আইডি জমা দিন। আমাদের টিম সত্যিকারের হিসাব মিলিয়ে নিশ্চিত করবে — সাধারণত ২৪ ঘণ্টার মধ্যে।"
          : "Send the total using any option below, then submit your transaction ID. Our team verifies it against the actual account record — usually within 24 hours."}
      </p>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-navy-900">
          {locale === "bn" ? "পেমেন্ট মাধ্যম" : "Payment method"}
        </legend>
        <form action={action} className="space-y-4">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="orderReference" value={orderReference} />

          {manual.length === 0 && !gateway ? (
            <p className="rounded-md border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-gold-900">
              {locale === "bn"
                ? "এখনো কোনো পেমেন্ট মাধ্যম চালু নেই। আমাদের টিম আপনার সাথে যোগাযোগ করবে।"
                : "No payment methods are enabled yet — our team will contact you with instructions."}
            </p>
          ) : null}

          {manual.map((m, idx) => (
            <label
              key={m.id}
              className="block cursor-pointer rounded-lg border border-navy-200 p-3 transition hover:border-navy-300 has-checked:border-[var(--brand-primary)] has-checked:bg-navy-50/60"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="methodId"
                  value={m.id}
                  defaultChecked={idx === 0}
                  required
                  className="h-4 w-4"
                />
                <span className="text-sm font-semibold text-navy-900">
                  {locale === "bn" && m.label_bn ? m.label_bn : m.label_en}
                </span>
                <span className="ml-auto text-xs text-navy-500">{m.supported_currency}</span>
              </span>
              <dl className="mt-2 space-y-1 pl-6 text-xs text-navy-700">
                {methodDetails(m).map((d) => (
                  <div key={d.label} className="flex gap-2">
                    <dt className="shrink-0 text-navy-400">{d.label}:</dt>
                    <dd className={d.mono ? "break-all font-mono" : ""}>{d.value}</dd>
                  </div>
                ))}
              </dl>
              {m.instructions_en ? (
                <p className="mt-2 pl-6 text-xs text-navy-600">
                  {locale === "bn" && m.instructions_bn ? m.instructions_bn : m.instructions_en}
                </p>
              ) : null}
              {m.kind === "crypto" ? (
                <p className="mt-2 rounded border border-gold-300 bg-gold-50 px-2 py-1 text-xs text-gold-900">
                  {locale === "bn"
                    ? "সতর্কতা: ভুল নেটওয়ার্কে পাঠালে টাকা স্থায়ীভাবে হারাতে পারে। নেটওয়ার্ক নাম দুবার মিলিয়ে নিন।"
                    : "Warning: sending on the wrong network can permanently lose your funds. Double-check the network name."}
                </p>
              ) : null}
            </label>
          ))}

          {gateway ? (
            <p className="rounded-md border border-navy-200 bg-navy-50 px-3 py-2 text-xs text-navy-600">
              {locale === "bn"
                ? `কার্ড পেমেন্ট (${gateway.gateway_name ?? "গেটওয়ে"}) শীঘ্রই আসছে — বর্তমানে অনুগ্রহ করে নিচের মাধ্যমগুলো ব্যবহার করুন।`
                : `Card payment (${gateway.gateway_name ?? "gateway"}) is coming — please use the options below for now.`}
            </p>
          ) : null}

          <label className="block text-sm">
            <span className="font-medium text-navy-900">
              {locale === "bn" ? "ট্রানজেকশন আইডি / রেফারেন্স" : "Transaction ID / reference"}
            </span>
            <input
              name="reference"
              required
              minLength={4}
              maxLength={200}
              placeholder={locale === "bn" ? "যেমন: 9GV2KX7Q" : "e.g. 9GV2KX7Q"}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 font-mono text-sm"
            />
            <span className="mt-1 block text-xs text-navy-500">
              {locale === "bn" ? "আপনার পেমেন্ট রসিদে যে আইডি আছে সেটিই দিন।" : "Copy the ID exactly as it appears on your payment receipt."}
            </span>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-navy-900">
              {locale === "bn" ? "পেমেন্ট স্ক্রিনশট / রসিদ (ঐচ্ছিক)" : "Payment screenshot / receipt (optional)"}
            </span>
            <input
              name="proof"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="mt-1 w-full text-sm"
            />
            <span className="mt-1 block text-xs text-navy-500">JPG, PNG, WebP or PDF · max 5 MB</span>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-navy-900">
              {locale === "bn" ? "নোট (ঐচ্ছিক)" : "Note (optional)"}
            </span>
            <textarea
              name="note"
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            />
          </label>

          {state.error ? (
            <p role="alert" className="rounded-md border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-gold-900">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || manual.length === 0}
            className="rounded-md bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending
              ? t(locale, "common.loading")
              : locale === "bn"
                ? "পেমেন্ট তথ্য জমা দিন"
                : "Submit payment details"}
          </button>
        </form>
      </fieldset>
    </div>
  );
}
