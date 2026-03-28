import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/forms/profile-form";
import { NotificationPrompt } from "@/components/notification-prompt";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import type { Profile } from "@/types/database";

export default async function ProfilePage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single() as { data: Profile | null };

  if (!profile) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 w-full flex-col items-center justify-center">
      <div className="w-full max-w-lg px-5 space-y-6">
          <ProfileForm profile={profile} />
          <PwaInstallBanner />
          <NotificationPrompt />
      </div>
    </div>
  );
}
