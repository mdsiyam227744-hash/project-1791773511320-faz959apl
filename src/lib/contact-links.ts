/**
 * Contact deep links with strict validation.
 * Dependency-free so it can be unit-tested with the plain Node test runner.
 */

/**
 * Official WhatsApp click-to-chat format: https://wa.me/<number>?text=<msg>
 * The number must already include its country code; formatting characters are
 * stripped but no country code is ever guessed.
 */
export function buildWhatsAppLink(
  number: string | null | undefined,
  message?: string | null,
): string | null {
  if (!number) return null;
  const digits = number.replace(/[^\d]/g, "");
  if (digits.length < 8) return null; // refuse obviously invalid numbers
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/**
 * imo has no universally supported public business deep link. Only an
 * admin-verified https profile URL is used verbatim; otherwise the caller
 * renders a fallback notice instead of a fake chat link.
 */
export function buildImoLink(
  contact: string | null | undefined,
  mode: string | null | undefined,
): string | null {
  if (!contact || mode !== "profile_url") return null;
  return contact.startsWith("https://") ? contact : null;
}
