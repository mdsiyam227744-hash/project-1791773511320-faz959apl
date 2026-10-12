"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

/**
 * Customer authentication server actions.
 * Registration uses email + password only (no OTP required).
 * Password strength is validated server-side in addition to client hints.
 */
function isStrongPassword(pw: string): boolean {
  return pw.length >= 10 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

export type AuthState = { error?: string; success?: string };

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_MAX;
}

function cleanRedirectPath(input: string | null | undefined): string {
  if (!input) return "/account";
  if (!input.startsWith("/") || input.startsWith("//")) return "/account";
  return input;
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email || !password) return { error: "missing" };
  if (!isStrongPassword(password)) return { error: "weak_password" };

  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`register:${ip}`)) return { error: "rate_limited" };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) return { error: "email_in_use" };
    return { error: "generic" };
  }

  // If the provider requires email confirmation, data.session is null here.
  if (!data.session) return { success: "confirm_email" };

  redirect(cleanRedirectPath(String(formData.get("next") ?? "")));
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "missing" };

  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`login:${ip}:${email}`)) return { error: "rate_limited" };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "invalid" };

  redirect(cleanRedirectPath(String(formData.get("next") ?? "")));
}

export async function logoutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function forgotPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "missing" };

  const h = await headers();
  if (!rateLimit(`forgot:${h.get("x-forwarded-for") ?? "local"}`)) return { error: "rate_limited" };

  const supabase = createClient();
  const origin = h.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  // Always the same response regardless of account existence (no enumeration).
  return { success: "sent" };
}

export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (!isStrongPassword(password)) return { error: "weak_password" };

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "generic" };
  return { success: "updated" };
}
