"use client";

import { useActionState } from "react";
import { submitConsultation, type ContactState } from "./actions";

const initial: ContactState = {};

export default function ContactForm() {
  const [state, formAction, pending] = useActionState(submitConsultation, initial);

  if (state.ok) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        Message received. Our team will reply using the contact details you provided.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error === "invalid" ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          Please check the fields — name, a valid email, and a message of at least 10 characters.
        </p>
      ) : null}
      {state.error === "unavailable" ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          Messages cannot be received right now. Please use the direct contact channels instead.
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Your name</span>
        <input
          name="name"
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          required
          minLength={2}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input
          name="email"
          type="email"
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Phone (optional)</span>
        <input
          name="phone"
          type="tel"
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Message</span>
        <textarea
          name="message"
          rows={4}
          minLength={10}
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          required
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
