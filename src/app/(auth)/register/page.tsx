import type { Metadata } from "next";
import Link from "next/link";
import RegisterForm from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-2 text-sm text-navy-600">
        An email address and password are all you need. We never ask for OTP codes to register.
      </p>
      <RegisterForm />
      <p className="mt-6 text-sm text-navy-600">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
