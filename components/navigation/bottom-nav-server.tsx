import { createClient } from "@/lib/supabase/server";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single() as { data: Profile | null };

  if (!profile) {
    return null;
  }

  return (
    <BottomNav
      fullName={profile.full_name}
      avatarUrl={profile.avatar_url}
      isOrganizer={profile.role === "organizer"}
    />
  );
}
