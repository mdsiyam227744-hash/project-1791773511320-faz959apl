import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "./login-form";
import { getBrand } from "@/lib/settings";
import { BrandMark } from "@/components/brand";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const brand = await getBrand();
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-6">
        <BrandMark name={brand.businessName} logoSvg={brand.logoSvg} tagline={brand.tagline.en} />
      </div>
      <h1 className="text-2xl font-bold">Log in</h1>
      <LoginForm />
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
