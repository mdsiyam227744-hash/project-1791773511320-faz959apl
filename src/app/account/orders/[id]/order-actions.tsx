"use client";

/**
 * Pay / cancel controls for a pending order.
 * The button states are honest: when the payment provider is not configured
 * the customer sees exactly that — never a payment sheet that cannot complete.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";

export function OrderActions({
  locale,
  orderId,
  payable,
  cancellable = true,
}: {
  locale: Locale;
  orderId: string;
  payable: boolean;
  cancellable?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"pay" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy("pay");
    setError(null);
    try {
      const res = await fetch("/api/orders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const json = (await res.json()) as { url?: string; free?: boolean; error?: string };
      if (!res.ok) {
        if (json.error === "payments_provider_not_configured") {
          setError(t(locale, "orders.payUnavailable"));
        } else {
          setError(t(locale, "common.error"));
        }
        return;
      }
      if (json.free) {
        router.refresh();
        return;
      }
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      setError(t(locale, "common.error"));
    } catch {
      setError(t(locale, "common.error"));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    setError(null);
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        setError(t(locale, "common.error"));
      }
    } catch {
      setError(t(locale, "common.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {payable ? (
          <button
            onClick={pay}
            disabled={busy !== null}
            className="rounded-md bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "pay" ? t(locale, "common.loading") : t(locale, "orders.pay")}
          </button>
        ) : null}
        {cancellable ? (
          <button
            onClick={cancel}
            disabled={busy !== null}
            className="rounded-md border border-navy-200 px-5 py-2.5 text-sm font-medium text-navy-700 hover:bg-navy-50 disabled:opacity-50"
          >
            {busy === "cancel" ? t(locale, "common.loading") : t(locale, "orders.cancel")}
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-gold-900">
          {error}
        </p>
      ) : null}
    </div>
  );
}
