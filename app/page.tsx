import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ActiveEventCard } from "@/components/active-event-card";
import type { Event, Profile, Response, Carpool, CarpoolRider } from "@/types/database";

type UserEventStatus = "needs-response" | "submitted" | "ride-assigned";

export default async function HomePage(): Promise<React.ReactElement> {
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
      .single() as { data: Profile | null };
    profile = data;
  }

  // Find the single active (open or published) event
  let activeEvent: Event | null = null;
  if (user) {
    const { data } = await supabase
      .from("events")
      .select("*")
      .in("status", ["open", "closed", "published"])
      .order("event_date", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: Event | null };
    activeEvent = data;
  }

  // Determine user's status for the active event
  let userStatus: UserEventStatus = "needs-response";
  if (user && activeEvent) {
    const { data: response } = await supabase
      .from("responses")
      .select("id, role")
      .eq("event_id", activeEvent.id)
      .eq("user_id", user.id)
      .maybeSingle() as { data: Pick<Response, "id" | "role"> | null };

    if (response) {
      userStatus = "submitted";

      // Check if assigned as a driver
      const { data: driverCarpool } = await supabase
        .from("carpools")
        .select("id")
        .eq("event_id", activeEvent.id)
        .eq("driver_id", user.id)
        .maybeSingle() as { data: Pick<Carpool, "id"> | null };

      if (driverCarpool) {
        userStatus = "ride-assigned";
      } else {
        // Check if assigned as a rider
        const { data: riderAssignment } = await supabase
          .from("carpool_riders")
          .select("id, carpool_id")
          .eq("rider_id", user.id)
          .maybeSingle() as { data: Pick<CarpoolRider, "id" | "carpool_id"> | null };

        if (riderAssignment) {
          // Verify the carpool belongs to this event
          const { data: carpool } = await supabase
            .from("carpools")
            .select("id")
            .eq("id", riderAssignment.carpool_id)
            .eq("event_id", activeEvent.id)
            .maybeSingle() as { data: Pick<Carpool, "id"> | null };

          if (carpool) {
            userStatus = "ride-assigned";
          }
        }
      }
    }
  }

  return (
    <div className="flex flex-1 w-full max-w-lg flex-col items-center justify-center px-6">
      {/* Brand */}
      <p className="text-xs font-medium tracking-[0.3em] text-muted-foreground uppercase">
        Atlanta
      </p>
      <h1 className="mt-1 text-5xl font-bold tracking-tight tall:text-6xl xtall:text-7xl">
        SOON
      </h1>

      {/* Main content area */}
      <div className="mt-6 tall:mt-8 xtall:mt-10 flex w-full flex-col items-center gap-4">
        {!user && (
          <a href="/api/auth/google">
            <Button size="lg" className="rounded-full px-8">Login</Button>
          </a>
        )}
        {user && activeEvent && (
          <ActiveEventCard
            eventId={activeEvent.id}
            title={activeEvent.title}
            subtitle={`${new Date(activeEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}${activeEvent.event_time ? ` · ${new Date(`1970-01-01T${activeEvent.event_time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""} · ${activeEvent.location}`}
            status={userStatus}
            hasPhoneNumber={!!profile?.phone_number}
          />
        )}
        {user && !activeEvent && (
          <p className="text-sm text-muted-foreground">No open events right now.</p>
        )}
      </div>
    </div>
  );
}
