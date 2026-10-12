import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { STAFF_ROLE_LABELS } from "@/lib/auth";
import { logoutAction } from "@/app/(auth)/actions";
import { t } from "@/lib/i18n";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireStaff(); // redirects non-staff to /account
  const locale = "en" as const;

  const nav = [
    { href: "/admin", label: t(locale, "admin.dashboard") },
    { href: "/admin/applications", label: t(locale, "admin.applications") },
    { href: "/admin/visas", label: t(locale, "admin.visas") },
    { href: "/admin/countries", label: t(locale, "admin.countries") },
    { href: "/admin/jobs", label: t(locale, "admin.jobs") },
    { href: "/admin/consultations", label: t(locale, "admin.consultations") },
    { href: "/admin/fees", label: t(locale, "admin.fees") },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/payments", label: "Payments" },
    { href: "/admin/airports", label: "Airports" },
    { href: "/admin/content", label: t(locale, "admin.content") },
    { href: "/admin/staff", label: t(locale, "admin.staff") },
    { href: "/admin/audit", label: t(locale, "admin.audit") },
  ];

  return (
    <div className="flex min-h-screen bg-navy-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-navy-100 bg-white md:flex">
        <div className="border-b border-navy-100 px-4 py-4">
          <p className="text-sm font-bold text-navy-900">{t(locale, "admin.title")}</p>
          <p className="mt-0.5 text-xs text-navy-500">
            {staff.display_name} · {STAFF_ROLE_LABELS[staff.role]}
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 p-2" aria-label="Admin">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-navy-700 hover:bg-navy-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-navy-100 p-2">
          <form action={logoutAction}>
            <button className="w-full rounded-md px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50">
              {t(locale, "nav.logout")}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1">
        {/* Mobile top nav */}
        <div className="border-b border-navy-100 bg-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-bold">{t(locale, "admin.title")}</span>
            <span className="text-xs text-navy-500">{STAFF_ROLE_LABELS[staff.role]}</span>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2" aria-label="Admin mobile">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-navy-700 hover:bg-navy-50"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
