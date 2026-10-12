import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { logoutAction } from "@/app/(auth)/actions";
import { t } from "@/lib/i18n";
import { isStaffish } from "@/lib/staffish";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const locale = (profile?.locale as "en" | "bn") ?? "en";
  const staff = await isStaffish();

  return (
    <div className="flex min-h-screen flex-col bg-navy-50">
      <header className="border-b border-navy-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/account" className="font-semibold text-navy-900">
            {t(locale, "dash.title")}
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {staff ? (
              <Link
                href="/admin"
                className="rounded-md bg-[var(--brand-secondary)] px-3 py-1.5 font-medium text-navy-950"
              >
                {t(locale, "nav.admin")}
              </Link>
            ) : null}
            <Link href="/account/orders" className="rounded-md px-3 py-1.5 text-navy-700 hover:bg-navy-50">
              {t(locale, "orders.title")}
            </Link>
            <Link href="/account/profile" className="rounded-md px-3 py-1.5 text-navy-700 hover:bg-navy-50">
              {t(locale, "dash.profile")}
            </Link>
            <form action={logoutAction}>
              <button className="rounded-md px-3 py-1.5 text-navy-700 hover:bg-navy-50">
                {t(locale, "nav.logout")}
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
