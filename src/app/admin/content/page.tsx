import { requireStaff } from "@/lib/auth";
import { getBrand, getContact, buildWhatsAppLink, buildImoLink } from "@/lib/settings";
import { updateBrand, updateContact } from "./actions";
import { LOCALES } from "@/lib/i18n";

export default async function AdminContent() {
  const { staff } = await requireStaff();
  const [brand, contact] = await Promise.all([getBrand(), getContact()]);
  const waPreview = buildWhatsAppLink(contact.whatsappNumber, contact.whatsappDefaultMessage);
  const imoPreview = buildImoLink(contact.imoContact, contact.imoMode);
  const inputCls = "w-full rounded-md border border-navy-200 px-3 py-2 text-sm";

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">Content &amp; branding</h1>

      <section className="mt-6 rounded-lg border border-navy-100 bg-white p-5">
        <h2 className="text-lg font-semibold">Business identity</h2>
        <form action={updateBrand} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Business name (used site-wide)</span>
            <input name="business_name" defaultValue={brand.businessName} className={inputCls} required />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tagline (English)</span>
              <input name="tagline_en" defaultValue={brand.tagline.en} className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tagline (Bangla)</span>
              <input name="tagline_bn" defaultValue={brand.tagline.bn} className={inputCls} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Primary color (hex)</span>
              <input name="primary_color" defaultValue={brand.primaryColor} pattern="#[0-9a-fA-F]{6}" className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Secondary color (hex)</span>
              <input name="secondary_color" defaultValue={brand.secondaryColor} pattern="#[0-9a-fA-F]{6}" className={inputCls} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Default site language</span>
            <select name="default_locale" defaultValue={brand.defaultLocale} className={inputCls}>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>{l.labelNative}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Custom logo SVG (optional — overrides the bundled VisaBridge Global logo)
            </span>
            <textarea name="logo_svg" rows={3} defaultValue={brand.logoSvg ?? ""} className={`${inputCls} font-mono text-xs`} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Custom favicon SVG (optional — overrides the bundled icon)
            </span>
            <textarea name="favicon_svg" rows={3} defaultValue={brand.faviconSvg ?? ""} className={`${inputCls} font-mono text-xs`} />
          </label>
          <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white">
            Save branding
          </button>
          <p className="text-xs text-navy-500">
            Changes apply to the live website immediately after saving.
          </p>
        </form>
      </section>

      <section className="mt-8 rounded-lg border border-navy-100 bg-white p-5">
        <h2 className="text-lg font-semibold">Contact channels — WhatsApp &amp; imo</h2>
        <form action={updateContact} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">WhatsApp number (full international format, e.g. 8801XXXXXXXXX)</span>
            <input name="whatsapp_number" defaultValue={contact.whatsappNumber ?? ""} className={inputCls} placeholder="8801XXXXXXXXX" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">WhatsApp default message</span>
            <input name="whatsapp_default_message" defaultValue={contact.whatsappDefaultMessage} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">WhatsApp button label</span>
            <input name="whatsapp_button_label" defaultValue={contact.whatsappButtonLabel ?? ""} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              imo contact — a verified https profile link (imo has no public chat deep link for
              businesses; without a link the site shows a practical fallback notice)
            </span>
            <input name="imo_contact" defaultValue={contact.imoContact ?? ""} className={inputCls} placeholder="https://imo.im/u/…" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">imo mode</span>
            <select name="imo_mode" defaultValue={contact.imoMode} className={inputCls}>
              <option value="profile_url">Profile link (button opens the link)</option>
              <option value="fallback_notice">Fallback notice (button explains how to reach us)</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Display phone</span>
              <input name="phone_display" defaultValue={contact.phoneDisplay ?? ""} className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Display email</span>
              <input name="email_display" defaultValue={contact.emailDisplay ?? ""} className={inputCls} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">imo button label</span>
            <input name="imo_button_label" defaultValue={contact.imoButtonLabel ?? ""} className={inputCls} />
          </label>
          <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white">
            Save contact channels
          </button>
        </form>

        <div className="mt-4 rounded-md bg-navy-50 p-3 text-sm">
          <p className="font-medium">Current live result:</p>
          <p className="mt-1 text-xs text-navy-600">
            WhatsApp button: {waPreview ? (
              <a href={waPreview} target="_blank" rel="noopener noreferrer" className="underline break-all">{waPreview}</a>
            ) : "hidden (number not configured)"}
          </p>
          <p className="text-xs text-navy-600">
            imo button: {imoPreview ? (
              <a href={imoPreview} target="_blank" rel="noopener noreferrer" className="underline break-all">{imoPreview}</a>
            ) : "fallback notice shown"}
          </p>
        </div>
      </section>
    </div>
  );
}
