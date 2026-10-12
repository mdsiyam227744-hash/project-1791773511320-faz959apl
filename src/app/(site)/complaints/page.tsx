import type { Metadata } from "next";
import ContactForm from "../contact/contact-form";
import { ContactButtons } from "@/components/brand";

export const metadata: Metadata = { title: "Complaints & support" };

export default function ComplaintsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold">Complaints &amp; customer support</h1>
      <div className="prose-legal mt-4 text-sm leading-relaxed">
        <p>
          If something has gone wrong — a delayed response, an unexpected charge, or a service issue
          — we want to hear it. Complaints are reviewed by a manager, not the agent who handled the
          original case.
        </p>
        <h2>How to complain</h2>
        <ol className="list-decimal pl-5">
          <li>Send your complaint with your application reference number using the form below or any contact channel.</li>
          <li>We acknowledge within 2 business days and investigate.</li>
          <li>You receive a written outcome with any remedy — refund, re-service, or correction.</li>
        </ol>
        <h2>Your rights</h2>
        <p>
          Service fees for work not yet started are refundable on cancellation. Government fees are
          governed by the authority&rsquo;s own rules and are outside our control — we state this
          before you pay.
        </p>
      </div>

      <div className="mt-8">
        <ContactButtons />
      </div>
      <div className="mt-8 max-w-xl">
        <h2 className="mb-3 text-lg font-semibold">Submit in writing</h2>
        <ContactForm />
      </div>
    </div>
  );
}
