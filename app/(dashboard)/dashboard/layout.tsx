import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardProvider } from "@/components/dashboard/dashboard-context";
import type { Profile } from "@/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
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

  if (profile?.role !== "organizer") {
    redirect("/");
  }

  return (
    <DashboardProvider
      fullName={profile.full_name}
      avatarUrl={profile.avatar_url}
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-lg px-5 pt-6 pb-24">
            {children}
          </div>
        </div>
      </div>
    </DashboardProvider>
  );
}
