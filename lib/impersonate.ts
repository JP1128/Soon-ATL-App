import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

const IMPERSONATE_COOKIE = "impersonate_user_id";

interface EffectiveUser {
  /** The real authenticated user ID (admin) */
  realUserId: string;
  /** The effective user ID (impersonated or real) */
  effectiveUserId: string;
  /** Whether impersonation is active */
  isImpersonating: boolean;
}

/**
 * Returns the effective user ID, checking for admin impersonation.
 * Only admins can impersonate — if a non-admin has the cookie, it's ignored.
 */
export async function getEffectiveUser(): Promise<EffectiveUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const cookieStore = await cookies();
  const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;

  if (!impersonateId || impersonateId === user.id) {
    return {
      realUserId: user.id,
      effectiveUserId: user.id,
      isImpersonating: false,
    };
  }

  // Verify the real user is an admin
  const { data: profile } = (await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Profile, "role"> | null };

  if (!profile || profile.role !== "admin") {
    return {
      realUserId: user.id,
      effectiveUserId: user.id,
      isImpersonating: false,
    };
  }

  return {
    realUserId: user.id,
    effectiveUserId: impersonateId,
    isImpersonating: true,
  };
}
