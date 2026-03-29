import { createClient } from "@/lib/supabase/server";
import { getEffectiveUser } from "@/lib/impersonate";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/forms/profile-form";
import type { Profile } from "@/types/database";

export default async function DashboardProfilePage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const effectiveUser = await getEffectiveUser();
  const effectiveUserId = effectiveUser?.effectiveUserId ?? user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", effectiveUserId)
    .single() as { data: Profile | null };

  if (!profile) {
    redirect("/");
  }

  return (
    <div>
      <ProfileForm profile={profile} />
    </div>
  );
}
