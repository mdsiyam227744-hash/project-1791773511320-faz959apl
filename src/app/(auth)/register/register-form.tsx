"use client";

import { useActionState } from "react";
import { registerAction, type AuthState } from "../actions";

const initial: AuthState = {};

const ERRORS: Record<string, string> = {
  missing: "Please fill in all fields.",
  weak_password: "Password must be at least 10 characters and mix letters and numbers.",
  email_in_use: "An account with this email already exists.",
  rate_limited: "Too many attempts — wait a minute and try again.",
  db_unconfigured:
    "Online registration is not available yet — our account system is being connected right now. You can already reach our team through the contact page or the WhatsApp button, and we will set up your application manually in the meantime.",
  generic: "Registration failed. Please try again.",
};

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);

  if (state.success === "confirm_email") {
    return (
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        Check your inbox — confirm your email address to activate the account, then log in.
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {ERRORS[state.error] ?? ERRORS.generic}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Full name</span>
        <input
          name="full_name"
          autoComplete="name"
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          required
        />
      </label>
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
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          required
          aria-describedby="pw-hint"
        />
        <span id="pw-hint" className="mt-1 block text-xs text-navy-500">
          At least 10 characters, mixing letters and numbers.
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
