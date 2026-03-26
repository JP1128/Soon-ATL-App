import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProfileChip } from "@/components/navigation/profile-chip";
import type { Event, Profile } from "@/types/database";

export default async function HomePage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  let isOrganizer = false;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single() as { data: Profile | null };
    profile = data;
    isOrganizer = profile?.role === "organizer";
  }

  // Find the single active (open) event
  let activeEvent: Event | null = null;
  if (user) {
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("status", "open")
      .limit(1)
      .maybeSingle() as { data: Event | null };
    activeEvent = data;
  }

  // If a member is logged in and there's an active event, go directly to the event form
  if (user && activeEvent && !isOrganizer) {
    redirect(`/event/${activeEvent.id}`);
  }

  return (
    <div className="flex w-full max-w-lg flex-col items-center px-6">
      {/* Brand */}
      <p className="text-xs font-medium tracking-[0.3em] text-muted-foreground uppercase">
        Atlanta
      </p>
      <h1 className="mt-1 text-6xl font-bold tracking-tight sm:text-7xl">
        SOON
      </h1>

      {/* Main content area */}
      <div className="mt-10 flex w-full flex-col items-center gap-4">
        {!user && (
          <a href="/api/auth/google">
            <Button size="lg" className="rounded-full px-8">Login</Button>
          </a>
        )}
        {user && activeEvent && isOrganizer && (
          <Link
            href={`/event/${activeEvent.id}`}
            className="w-full rounded-2xl border p-5 text-left transition-colors hover:bg-muted/50"
          >
            <p className="font-semibold">{activeEvent.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(activeEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })} · {activeEvent.location}
            </p>
          </Link>
        )}
        {user && !activeEvent && (
          <p className="text-sm text-muted-foreground">No open events right now.</p>
        )}
      </div>

      {/* Profile chip */}
      {user && profile && (
        <div className="mt-12">
          <ProfileChip
            fullName={profile.full_name}
            avatarUrl={profile.avatar_url}
            isOrganizer={isOrganizer}
          />
        </div>
      )}
    </div>
  );
}
