import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware: refreshes the Supabase session and guards protected route groups.
 * Customer routes require a session; /admin additionally requires an active
 * staff record (re-checked server-side in the admin layout and every action —
 * this is a convenience redirect, not the authorization boundary).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isProtected =
      path.startsWith("/account") || path.startsWith("/admin") || path.startsWith("/apply");
    const isAuthPage = path === "/login" || path === "/register";

    if (!user && isProtected) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/login";
      redirect.searchParams.set("next", path);
      return NextResponse.redirect(redirect);
    }
    if (user && isAuthPage) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/account";
      redirect.search = "";
      return NextResponse.redirect(redirect);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/apply/:path*",
    "/reset-password",
    "/login",
    "/register",
  ],
};
