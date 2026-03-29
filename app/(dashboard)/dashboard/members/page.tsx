import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MembersList } from "@/components/dashboard/members-list";
import type { Profile } from "@/types/database";

export default async function MembersPage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = (await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Profile, "role"> | null };

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="fixed inset-0 z-10 bg-background px-5 pt-4">
      <div className="mx-auto h-full max-w-lg">
        <MembersList />
      </div>
    </div>
  );
}
