import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const statusConfig: Record<UserEventStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
    "needs-response": { label: "Response needed", variant: "secondary" },
    submitted: { label: "Response submitted", variant: "outline" },
    "ride-assigned": { label: "Ride assigned", variant: "default" },
  };

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
        {user && activeEvent && (
          <Link
            href={`/event/${activeEvent.id}`}
            className="w-full rounded-2xl border p-5 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{activeEvent.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(activeEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })} · {activeEvent.location}
                </p>
              </div>
              <Badge variant={statusConfig[userStatus].variant} className="shrink-0">
                {statusConfig[userStatus].label}
              </Badge>
            </div>
          </Link>
        )}
        {user && !activeEvent && (
          <p className="text-sm text-muted-foreground">No open events right now.</p>
        )}
      </div>
    </div>
  );
}
