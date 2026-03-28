import { createClient } from "@/lib/supabase/server";
import { formatDisplayAddress } from "@/lib/utils";
import { LoginButton } from "@/components/login-button";
import { ActiveEventCard } from "@/components/active-event-card";
import { SubmittedEventCard } from "@/components/submitted-event-card";
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
  let userResponse: Pick<Response, "id" | "role" | "before_role" | "after_role" | "pickup_address" | "return_address" | "available_seats" | "departure_time"> | null = null;
  let assignedRiders: { full_name: string; avatar_url: string | null }[] = [];
  let assignedDriver: { full_name: string; avatar_url: string | null } | null = null;
  if (user && activeEvent) {
    const { data: response } = await supabase
      .from("responses")
      .select("id, role, before_role, after_role, pickup_address, return_address, available_seats, departure_time")
      .eq("event_id", activeEvent.id)
      .eq("user_id", user.id)
      .maybeSingle() as { data: Pick<Response, "id" | "role" | "before_role" | "after_role" | "pickup_address" | "return_address" | "available_seats" | "departure_time"> | null };
    userResponse = response;

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

        // Fetch assigned riders with profiles
        const { data: riders } = await supabase
          .from("carpool_riders")
          .select("rider_id, pickup_order")
          .eq("carpool_id", driverCarpool.id)
          .order("pickup_order", { ascending: true }) as { data: { rider_id: string; pickup_order: number }[] | null };

        if (riders && riders.length > 0) {
          const riderIds = riders.map((r: { rider_id: string }) => r.rider_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", riderIds) as { data: { id: string; full_name: string; avatar_url: string | null }[] | null };

          if (profiles) {
            // Maintain pickup order
            assignedRiders = riderIds
              .map((id: string) => profiles.find((p) => p.id === id))
              .filter((p): p is { id: string; full_name: string; avatar_url: string | null } => !!p)
              .map((p) => ({ full_name: p.full_name, avatar_url: p.avatar_url }));
          }
        }
      } else {
        // Check if assigned as a rider
        const { data: riderAssignment } = await supabase
          .from("carpool_riders")
          .select("id, carpool_id")
          .eq("rider_id", user.id)
          .maybeSingle() as { data: Pick<CarpoolRider, "id" | "carpool_id"> | null };

        if (riderAssignment) {
          // Verify the carpool belongs to this event and get the driver
          const { data: carpool } = await supabase
            .from("carpools")
            .select("id, driver_id")
            .eq("id", riderAssignment.carpool_id)
            .eq("event_id", activeEvent.id)
            .maybeSingle() as { data: Pick<Carpool, "id" | "driver_id"> | null };

          if (carpool) {
            userStatus = "ride-assigned";

            // Fetch the driver's profile
            const { data: driverProfile } = await supabase
              .from("profiles")
              .select("full_name, avatar_url")
              .eq("id", carpool.driver_id)
              .single();

            if (driverProfile) {
              assignedDriver = driverProfile;
            }
          }
        }
      }
    }
  }

  const hasSubmitted = userStatus === "submitted" || userStatus === "ride-assigned";

  return (
    <div className="flex flex-1 w-full max-w-lg flex-col items-center justify-center px-6">
      {/* Brand — hidden after submission */}
      {!hasSubmitted && (
        <>
          <p className="text-xs font-medium tracking-[0.3em] text-muted-foreground uppercase">
            Atlanta
          </p>
          <h1 className="mt-1 text-5xl font-bold tracking-tight tall:text-6xl xtall:text-7xl">
            SOON
          </h1>
        </>
      )}

      {/* Main content area */}
      <div className={`${hasSubmitted ? "" : "mt-6 tall:mt-8 xtall:mt-10"} flex w-full flex-col items-center gap-4`}>
        {!user && <LoginButton />}
        {user && activeEvent && hasSubmitted && userResponse && (
          <SubmittedEventCard
            responseId={userResponse.id}
            eventId={activeEvent.id}
            eventDate={activeEvent.event_date}
            eventTime={activeEvent.event_time}
            title={activeEvent.title}
            location={activeEvent.location}
            status={userStatus as "submitted" | "ride-assigned"}
            beforeRole={userResponse.before_role}
            afterRole={userResponse.after_role}
            pickupAddress={userResponse.pickup_address}
            returnAddress={userResponse.return_address}
            availableSeats={userResponse.available_seats}
            departureTime={userResponse.departure_time}
            assignedRiders={assignedRiders}
            assignedDriver={assignedDriver}
          />
        )}
        {user && activeEvent && !hasSubmitted && (
          <ActiveEventCard
            eventId={activeEvent.id}
            eventDate={activeEvent.event_date}
            title={activeEvent.title}
            subtitle={`${new Date(activeEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}${activeEvent.event_time ? ` · ${new Date(`1970-01-01T${activeEvent.event_time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}`}
            address={formatDisplayAddress(activeEvent.location)}
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
