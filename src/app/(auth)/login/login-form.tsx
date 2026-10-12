"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type AuthState } from "../actions";

const initial: AuthState = {};

const ERRORS: Record<string, string> = {
  missing: "Please fill in all fields.",
  invalid: "Incorrect email or password.",
  rate_limited: "Too many attempts — wait a minute and try again.",
};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const params = useSearchParams();
  const next = params.get("next") ?? "";

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {ERRORS[state.error] ?? "Login failed. Please try again."}
        </p>
      ) : null}
      <input type="hidden" name="next" value={next} />
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
          autoComplete="current-password"
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          required
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
