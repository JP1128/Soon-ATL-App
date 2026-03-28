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
  let userResponse: Pick<Response, "id" | "role" | "before_role" | "after_role" | "pickup_address" | "pickup_lat" | "pickup_lng" | "return_address" | "return_lat" | "return_lng" | "available_seats" | "departure_time"> | null = null;
  let assignedRiders: { id: string; full_name: string; avatar_url: string | null; phone_number: string | null; pickup_lat: number | null; pickup_lng: number | null; pickup_address: string | null; return_lat: number | null; return_lng: number | null; return_address: string | null }[] = [];
  let assignedDriver: { full_name: string; avatar_url: string | null; pickup_lat: number | null; pickup_lng: number | null } | null = null;
  let carpoolId: string | null = null;
  if (user && activeEvent) {
    const { data: response } = await supabase
      .from("responses")
      .select("id, role, before_role, after_role, pickup_address, pickup_lat, pickup_lng, return_address, return_lat, return_lng, available_seats, departure_time")
      .eq("event_id", activeEvent.id)
      .eq("user_id", user.id)
      .maybeSingle() as { data: Pick<Response, "id" | "role" | "before_role" | "after_role" | "pickup_address" | "pickup_lat" | "pickup_lng" | "return_address" | "return_lat" | "return_lng" | "available_seats" | "departure_time"> | null };
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
        carpoolId = driverCarpool.id;

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
            .select("id, full_name, avatar_url, phone_number")
            .in("id", riderIds) as { data: { id: string; full_name: string; avatar_url: string | null; phone_number: string | null }[] | null };

          // Fetch rider responses for pickup/return coordinates
          const { data: riderResponses } = await supabase
            .from("responses")
            .select("user_id, pickup_lat, pickup_lng, pickup_address, return_lat, return_lng, return_address")
            .eq("event_id", activeEvent.id)
            .in("user_id", riderIds) as { data: { user_id: string; pickup_lat: number | null; pickup_lng: number | null; pickup_address: string | null; return_lat: number | null; return_lng: number | null; return_address: string | null }[] | null };

          if (profiles) {
            // Maintain pickup order
            assignedRiders = riderIds
              .map((id: string) => {
                const profile = profiles.find((p) => p.id === id);
                const resp = riderResponses?.find((r: { user_id: string }) => r.user_id === id);
                if (!profile) return null;
                return {
                  id: profile.id,
                  full_name: profile.full_name,
                  avatar_url: profile.avatar_url,
                  phone_number: profile.phone_number,
                  pickup_lat: resp?.pickup_lat ?? null,
                  pickup_lng: resp?.pickup_lng ?? null,
                  pickup_address: resp?.pickup_address ?? null,
                  return_lat: resp?.return_lat ?? null,
                  return_lng: resp?.return_lng ?? null,
                  return_address: resp?.return_address ?? null,
                };
              })
              .filter((p): p is NonNullable<typeof p> => !!p);
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
            carpoolId = carpool.id;

            // Fetch the driver's profile
            const { data: driverProfile } = await supabase
              .from("profiles")
              .select("full_name, avatar_url")
              .eq("id", carpool.driver_id)
              .single() as { data: { full_name: string; avatar_url: string | null } | null };

            // Fetch the driver's response for pickup coordinates
            const { data: driverResponse } = await supabase
              .from("responses")
              .select("pickup_lat, pickup_lng")
              .eq("event_id", activeEvent.id)
              .eq("user_id", carpool.driver_id)
              .maybeSingle() as { data: { pickup_lat: number | null; pickup_lng: number | null } | null };

            if (driverProfile) {
              assignedDriver = {
                ...driverProfile,
                pickup_lat: driverResponse?.pickup_lat ?? null,
                pickup_lng: driverResponse?.pickup_lng ?? null,
              };
            }
          }
        }
      }
    }
  }

  const hasSubmitted = userStatus === "submitted" || userStatus === "ride-assigned";

  return (
    <div className={`flex w-full max-w-lg flex-col items-center px-6 ${hasSubmitted ? "flex-1 pt-6 pb-4" : "flex-1 justify-center"}`}>
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
      <div className={`${hasSubmitted ? "flex-1" : "mt-6 tall:mt-8 xtall:mt-10"} flex w-full flex-col items-center gap-4`}>
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
            carpoolId={carpoolId}
            carpoolsSentAt={activeEvent.carpools_sent_at}
            pickupLat={userResponse.pickup_lat}
            pickupLng={userResponse.pickup_lng}
            returnLat={userResponse.return_lat}
            returnLng={userResponse.return_lng}
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
