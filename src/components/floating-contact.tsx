import Link from "next/link";
import { getContact, buildWhatsAppLink, buildImoLink } from "@/lib/settings";

/**
 * Floating contact buttons — WhatsApp, imo, Facebook.
 *
 * Rendered inside the public site layout so they appear in the bottom-right
 * corner of every public page, on all viewport sizes. Destinations come only
 * from administrator configuration; a channel that is not configured shows an
 * honest unavailable state instead of linking somewhere wrong. The buttons
 * stack vertically with the inaccessible-corner margin so page controls near
 * the corner stay reachable, and the column sits below wide sticky footers.
 */
export async function FloatingContactButtons() {
  const contact = await getContact();

  const wa = contact.whatsappEnabled
    ? buildWhatsAppLink(contact.whatsappNumber, contact.whatsappDefaultMessage)
    : null;
  const imo = contact.imoEnabled
    ? buildImoLink(contact.imoContact, contact.imoMode)
    : null;
  const fb =
    contact.facebookEnabled && contact.facebookUrl?.startsWith("https://")
      ? contact.facebookUrl
      : null;
  const noneConfigured = !wa && !imo && !fb;

  return (
    <div
      className="fixed right-3 bottom-16 z-40 flex flex-col items-end gap-2.5 sm:right-4 sm:bottom-4"
      aria-label="Contact shortcuts"
    >
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp"
          title="Chat with us on WhatsApp"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:opacity-90 focus-visible:outline-2"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm5.4 14.1c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-5.8-5.1c-.6-1-.9-2-.6-2.6.2-.5.8-1.3 1.3-1.4h.7c.2 0 .5.1.7.5l.9 2c.1.2.1.4 0 .6l-.5.7c-.2.2-.2.4-.1.6a8 8 0 0 0 3.5 3c.3.1.5.1.7-.1l.7-.8c.2-.2.4-.3.7-.2l2 .9c.3.2.5.3.5.5s0 .8-.3 1.3z" />
          </svg>
        </a>
      ) : null}

      {imo ? (
        <a
          href={imo}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contact us on imo"
          title="Contact us on imo"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#5646FF] text-white shadow-lg transition hover:opacity-90 focus-visible:outline-2"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
            <g>
              <circle cx="7.06" cy="11.6" r="1.35" fill="#fff" />
              <circle cx="12" cy="11.6" r="1.35" fill="#fff" />
              <circle cx="16.94" cy="11.6" r="1.35" fill="#fff" />
            </g>
          </svg>
        </a>
      ) : null}

      {fb ? (
        <a
          href={fb}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit our Facebook page"
          title="Visit our Facebook page"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1877F2] text-white shadow-lg transition hover:opacity-90 focus-visible:outline-2"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.45-4.92 8.45-9.94z" />
          </svg>
        </a>
      ) : null}

      {noneConfigured ? (
        <Link
          href="/contact"
          aria-label="No chat channels are configured yet — open the contact page"
          title="Contact channels are being set up — use the contact page"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-navy-200 bg-white text-navy-600 shadow-lg transition hover:bg-navy-50 focus-visible:outline-2"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}
