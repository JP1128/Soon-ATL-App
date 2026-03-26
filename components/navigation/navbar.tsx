import { createClient } from "@/lib/supabase/server";
import { NavbarClient } from "./navbar-client";
import type { Profile } from "@/types/database";

export async function Navbar(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return <NavbarClient user={user} profile={profile} />;
}
