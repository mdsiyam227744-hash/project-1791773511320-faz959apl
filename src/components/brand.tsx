import Link from "next/link";
import { getContact, buildWhatsAppLink, buildImoLink } from "@/lib/settings";
import { t, type Locale } from "@/lib/i18n";

export function BrandMark({ name, logoSvg }: { name: string; logoSvg: string | null }) {
  if (logoSvg) {
    // Admin-provided SVG logo, stored in the database.
    return <span dangerouslySetInnerHTML={{ __html: logoSvg }} className="inline-block h-8" />;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-[var(--brand-primary)] text-[var(--brand-secondary)] font-bold">
        {name.trim().charAt(0).toUpperCase() || "V"}
      </span>
      <span className="font-semibold tracking-tight text-[var(--brand-primary)]">{name}</span>
    </span>
  );
}

export async function ContactButtons({ locale = "en" as Locale }: { locale?: Locale }) {
  const contact = await getContact();
  const wa = buildWhatsAppLink(contact.whatsappNumber, contact.whatsappDefaultMessage);
  const imo = buildImoLink(contact.imoContact, contact.imoMode);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm5.4 14.1c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-5.8-5.1c-.6-1-.9-2-.6-2.6.2-.5.8-1.3 1.3-1.4h.7c.2 0 .5.1.7.5l.9 2c.1.2.1.4 0 .6l-.5.7c-.2.2-.2.4-.1.6a8 8 0 0 0 3.5 3c.3.1.5.1.7-.1l.7-.8c.2-.2.4-.3.7-.2l2 .9c.3.2.5.3.5.5s0 .8-.3 1.3z" />
          </svg>
          {contact.whatsappButtonLabel ?? t(locale, "contact.whatsapp")}
        </a>
      ) : null}
      {imo ? (
        <a
          href={imo}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#5646FF] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C6.5 2 2 6 2 11c0 2.9 1.5 5.4 3.9 7.1-.1.9-.5 2.3-1.6 3.2 1.9.1 3.6-.7 4.7-1.5 1 .2 2 .4 3 .4 5.5 0 10-4 10-9.1S17.5 2 12 2z" />
          </svg>
          {contact.imoButtonLabel ?? t(locale, "contact.imo")}
        </a>
      ) : null}
      {!wa && !imo ? (
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-full border border-navy-200 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
        >
          {t(locale, "nav.contact")}
        </Link>
      ) : null}
    </div>
  );
}
