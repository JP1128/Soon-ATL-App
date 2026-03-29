import { createClient } from "@/lib/supabase/server";
import { getEffectiveUser } from "@/lib/impersonate";
import { BottomNav } from "./bottom-nav";
import type { Profile } from "@/types/database";

export async function BottomNavServer(): Promise<React.ReactElement | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Get the real user's profile (for admin/organizer checks)
  const { data: realProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single() as { data: Profile | null };

  if (!realProfile) {
    return null;
  }

  const effectiveUser = await getEffectiveUser();
  const isImpersonating = effectiveUser?.isImpersonating ?? false;

  // When impersonating, show the impersonated user's profile in the chip
  let displayProfile = realProfile;
  if (isImpersonating && effectiveUser) {
    const { data: impersonatedProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", effectiveUser.effectiveUserId)
      .single() as { data: Profile | null };
    if (impersonatedProfile) {
      displayProfile = impersonatedProfile;
    }
  }

  return (
    <BottomNav
      fullName={displayProfile.full_name}
      avatarUrl={displayProfile.avatar_url}
      isOrganizer={realProfile.role === "organizer" || realProfile.role === "admin"}
      isAdmin={realProfile.role === "admin"}
      hasPhoneNumber={displayProfile.phone_number != null}
      isImpersonating={isImpersonating}
    />
  );
}
