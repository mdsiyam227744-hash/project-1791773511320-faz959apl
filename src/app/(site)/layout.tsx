import Link from "next/link";
import { getBrand, getPageNotice } from "@/lib/settings";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/brand";
import { FloatingContactButtons } from "@/components/floating-contact";
import { StatusNotice } from "@/components/status-notice";
import type { Locale } from "@/lib/i18n";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  const locale: Locale = brand.defaultLocale;
  const configured = isSupabaseConfigured();
  const [notice] = configured ? await Promise.all([getPageNotice(locale)]) : [null];

  const nav = [
    { href: "/", label: t(locale, "nav.home") },
    { href: "/about", label: t(locale, "nav.about") },
    { href: "/countries", label: t(locale, "nav.countries") },
    { href: "/visa-categories", label: t(locale, "nav.visas") },
    { href: "/jobs", label: t(locale, "nav.jobs") },
    { href: "/planner", label: t(locale, "nav.planner") },
    { href: "/flights", label: t(locale, "nav.flights") },
    { href: "/airports", label: t(locale, "nav.airports") },
    { href: "/contact", label: t(locale, "nav.contact") },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2"
      >
        Skip to content
      </a>
      <StatusNotice
        message={
          notice
            ? locale === "bn"
              ? notice.messageBn
              : notice.messageEn
            : "Our services are being set up right now — the catalog is not available yet. Please check back shortly or contact us for immediate assistance."
        }
        severity={notice?.severity ?? "info"}
      />

      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label={`${brand.businessName} — ${brand.tagline[locale]}`}>
            <BrandMark
              name={brand.businessName}
              logoSvg={brand.logoSvg}
              tagline={brand.tagline[locale]}
            />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-navy-700 hover:text-[var(--brand-primary)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
            >
              {t(locale, "nav.login")}
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {t(locale, "nav.register")}
            </Link>
          </div>
        </div>
        {/* Mobile navigation */}
        <nav
          aria-label="Mobile"
          className="flex gap-1 overflow-x-auto border-t border-navy-100 px-4 py-2 lg:hidden"
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-navy-700 hover:bg-navy-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <FloatingContactButtons />

      <footer className="mt-16 border-t border-navy-100 bg-navy-950 text-navy-100">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-4">
          <div className="space-y-3">
            <BrandMark name={brand.businessName} logoSvg={brand.logoSvg} variant="dark" />
            <p className="text-xs leading-relaxed text-navy-200">
              {t(locale, "common.disclaimer")}
            </p>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-white">Services</h2>
            <ul className="space-y-1 text-sm">
              <li><Link href="/visa-categories" className="hover:underline">{t(locale, "nav.visas")}</Link></li>
              <li><Link href="/jobs" className="hover:underline">{t(locale, "nav.jobs")}</Link></li>
              <li><Link href="/planner" className="hover:underline">{t(locale, "nav.planner")}</Link></li>
              <li><Link href="/process" className="hover:underline">{t(locale, "process.title")}</Link></li>
              <li><Link href="/documents" className="hover:underline">{t(locale, "documents.title")}</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-white">Company</h2>
            <ul className="space-y-1 text-sm">
              <li><Link href="/about" className="hover:underline">{t(locale, "nav.about")}</Link></li>
              <li><Link href="/countries" className="hover:underline">{t(locale, "nav.countries")}</Link></li>
              <li><Link href="/contact" className="hover:underline">{t(locale, "nav.contact")}</Link></li>
              <li><Link href="/faq" className="hover:underline">{t(locale, "nav.faq")}</Link></li>
            </ul>
            {configured ? null : (
              <p className="mt-3 text-xs text-navy-300">
                Database services are temporarily unavailable — some sections may show limited
                information. Our team can be reached through the contact page.
              </p>
            )}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-white">Legal</h2>
            <ul className="space-y-1 text-sm">
              <li><Link href="/privacy" className="hover:underline">{t(locale, "footer.privacy")}</Link></li>
              <li><Link href="/terms" className="hover:underline">{t(locale, "footer.terms")}</Link></li>
              <li><Link href="/refunds" className="hover:underline">{t(locale, "footer.refunds")}</Link></li>
              <li><Link href="/complaints" className="hover:underline">{t(locale, "footer.complaints")}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-navy-800 py-4 text-center text-xs text-navy-300">
          © {new Date().getFullYear()} {brand.businessName}. {t(locale, "footer.rights")}
        </div>
      </footer>
    </div>
  );
}
