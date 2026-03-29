import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** RLS-bound client using the current user's session cookies. */
export async function createClient(): Promise<ReturnType<typeof createServerClient>> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can be called from Server Components where cookies
            // are read-only. This is safe to ignore when the middleware
            // handles session refresh.
          }
        },
      },
    }
  );
}

/** Service-role client that bypasses RLS. Use only in API routes after verifying auth. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminClient(): SupabaseClient<any, "public", any> {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
}
