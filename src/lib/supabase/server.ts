import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Authenticated client for server components/actions — session from cookies.
 * Next 15: cookies() is async, so the adapters are async (supported by @supabase/ssr).
 *
 * The client is intentionally untyped beyond `unknown`: generating full Database
 * types requires an accessible database. Embedded-join results are narrowed at
 * their call sites (see `src/lib/joins.ts`).
 */
export function createClient() {
  if (!url || !anonKey) {
    throw new Error("Supabase environment is not configured.");
  }
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: async () => (await cookies()).getAll(),
      setAll: async (cookiesToSet) => {
        try {
          const store = await cookies();
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options);
        } catch {
          // Called from a Server Component render — session refresh handled by middleware.
        }
      },
    },
  });
}

/**
 * Service-role client: server-only, bypasses RLS. Used only for operations that
 * genuinely require it (e.g. admin document reads, anonymous guest consultation
 * inserts inside a server route). Never import from client code.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service credentials are not configured.");
  }
  return createServerClient(url, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function isServiceConfigured(): boolean {
  return Boolean(url && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
