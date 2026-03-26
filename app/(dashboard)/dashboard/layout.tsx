import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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

  if (!profile) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 w-full flex-col">
      <div className="flex flex-1 items-center overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-5 pb-24">
          {children}
        </div>
      </div>
    </div>
  );
}
