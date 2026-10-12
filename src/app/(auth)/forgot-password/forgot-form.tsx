"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type AuthState } from "../actions";

const initial: AuthState = {};

export default function ForgotForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initial);

  if (state.success === "sent") {
    return (
      <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        If that email exists, a reset link has been sent.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error === "rate_limited"
            ? "Too many attempts — wait a minute and try again."
            : "Please enter a valid email address."}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email address</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          required
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
