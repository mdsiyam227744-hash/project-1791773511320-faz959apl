import { requireUser, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCountries } from "@/lib/catalog";
import { LOCALES } from "@/lib/i18n";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, countries] = await Promise.all([getProfile(user.id), listCountries()]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Profile</h1>
      <p className="mt-1 text-sm text-navy-600">{user.email}</p>
      <ProfileForm
        initial={{
          full_name: profile?.full_name ?? "",
          phone: profile?.phone ?? "",
          city: profile?.city ?? "",
          country_iso2: "",
          locale: profile?.locale ?? "en",
        }}
        countries={countries.map((c) => ({ iso2: c.iso2, name: c.name_en }))}
        locales={LOCALES.map((l) => ({ code: l.code, label: l.labelNative }))}
      />
    </div>
  );
}
