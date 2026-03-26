"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/types/database";
import type { User } from "@supabase/supabase-js";

interface NavbarClientProps {
  user: User | null;
  profile: Profile | null;
}

export function NavbarClient({ user, profile }: NavbarClientProps): React.ReactElement {
  const router = useRouter();

  async function handleSignOut(): Promise<void> {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Soon ATL
        </Link>

        <nav className="flex items-center gap-2">
          {user ? (
            <>
              {profile?.role === "organizer" && (
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm">
                    Dashboard
                  </Button>
                </Link>
              )}
              <div className="flex items-center gap-3">
                {profile?.avatar_url && (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="size-7 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {profile?.full_name || user.email}
                </span>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
