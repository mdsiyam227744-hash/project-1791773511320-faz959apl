import type { Metadata } from "next";
import ForgotForm from "./forgot-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="mt-2 text-sm text-navy-600">
        Enter the email you registered with. If it exists, we send a reset link.
      </p>
      <ForgotForm />
    </div>
  );
}
