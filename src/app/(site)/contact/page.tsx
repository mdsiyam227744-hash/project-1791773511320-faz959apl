import type { Metadata } from "next";
import ContactForm from "./contact-form";
import { ContactButtons } from "@/components/brand";
import { getContact } from "@/lib/settings";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const contact = await getContact();
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-bold">Contact our team</h1>
      <p className="mt-2 max-w-2xl text-navy-600">
        Ask about a visa route, an application in progress, or overseas employment. We reply during
        business hours.
      </p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Direct channels</h2>
          <div className="mt-3">
            <ContactButtons />
          </div>
          {contact.phoneDisplay ? (
            <p className="mt-4 text-sm">
              <span className="text-navy-500">Phone:</span> {contact.phoneDisplay}
            </p>
          ) : null}
          {contact.emailDisplay ? (
            <p className="mt-1 text-sm">
              <span className="text-navy-500">Email:</span>{" "}
              <a href={`mailto:${contact.emailDisplay}`} className="underline">
                {contact.emailDisplay}
              </a>
            </p>
          ) : null}
        </div>
        <div>
          <h2 className="text-lg font-semibold">Send a message</h2>
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
