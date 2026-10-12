"use client";

import { useActionState } from "react";
import { resetPasswordAction, type AuthState } from "../actions";

const initial: AuthState = {};

export default function ResetForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initial);

  if (state.success === "updated") {
    return (
      <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        Password updated. You can now log in with the new password.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error === "weak_password"
            ? "Password must be at least 10 characters and mix letters and numbers."
            : "Could not update the password. Open the reset link again."}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">New password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          required
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
