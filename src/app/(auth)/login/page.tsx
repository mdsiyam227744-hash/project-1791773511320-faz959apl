import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "./login-form";
import { getBrand } from "@/lib/settings";
import { BrandMark } from "@/components/brand";

export const metadata: Metadata = { title: "Log in" };

function LoginFormFallback() {
  return (
    <div className="mt-6 space-y-4" aria-hidden="true">
      <div className="space-y-1">
        <div className="h-4 w-28 rounded bg-navy-100" />
        <div className="h-9 w-full rounded-md border border-navy-100 bg-navy-50" />
      </div>
      <div className="space-y-1">
        <div className="h-4 w-24 rounded bg-navy-100" />
        <div className="h-9 w-full rounded-md border border-navy-100 bg-navy-50" />
      </div>
      <div className="h-10 w-full rounded-md bg-[var(--brand-primary)] opacity-40" />
    </div>
  );
}

export default async function LoginPage() {
  const brand = await getBrand();
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-6">
        <BrandMark name={brand.businessName} logoSvg={brand.logoSvg} tagline={brand.tagline.en} />
      </div>
      <h1 className="text-2xl font-bold">Log in</h1>
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
      <div className="mt-6 space-y-2 text-sm text-navy-600">
        <p>
          New here?{" "}
          <Link href="/register" className="underline">
            Create an account
          </Link>
        </p>
        <p>
          <Link href="/forgot-password" className="underline">
            Forgot your password?
          </Link>
        </p>
      </div>
    </div>
  );
}
