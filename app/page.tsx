import { createClient } from "@/lib/supabase/server";
import { getEffectiveUser } from "@/lib/impersonate";
import { formatDisplayAddress } from "@/lib/utils";
import { LoginButton } from "@/components/login-button";
import { ActiveEventCard } from "@/components/active-event-card";
import { SubmittedEventCard } from "@/components/submitted-event-card";
import type { Event, Profile, Response, PublishedCarpoolEntry } from "@/types/database";

type UserEventStatus = "needs-response" | "submitted" | "ride-assigned";

export default async function HomePage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveUser = await getEffectiveUser();
  const effectiveUserId = effectiveUser?.effectiveUserId ?? user?.id;

  let profile: Profile | null = null;
  if (user && effectiveUserId) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", effectiveUserId)
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
  let beforeAssignedRiders: { id: string; full_name: string; avatar_url: string | null; phone_number: string | null; pickup_lat: number | null; pickup_lng: number | null; pickup_address: string | null; return_lat: number | null; return_lng: number | null; return_address: string | null }[] = [];
  let afterAssignedRiders: { id: string; full_name: string; avatar_url: string | null; phone_number: string | null; pickup_lat: number | null; pickup_lng: number | null; pickup_address: string | null; return_lat: number | null; return_lng: number | null; return_address: string | null }[] = [];
  let beforeAssignedDriver: { full_name: string; avatar_url: string | null; pickup_lat: number | null; pickup_lng: number | null } | null = null;
  let afterAssignedDriver: { full_name: string; avatar_url: string | null; pickup_lat: number | null; pickup_lng: number | null } | null = null;
  let beforeCarpoolId: string | null = null;
  let afterCarpoolId: string | null = null;
  let beforePickupOrderSentAt: string | null = null;
  let afterPickupOrderSentAt: string | null = null;
  let beforePickupOrderSentRiders: string[] = [];
  let afterPickupOrderSentRiders: string[] = [];
  if (user && activeEvent) {
    const { data: response } = await supabase
      .from("responses")
      .select("id, role, before_role, after_role, pickup_address, pickup_lat, pickup_lng, return_address, return_lat, return_lng, available_seats, departure_time")
      .eq("event_id", activeEvent.id)
      .eq("user_id", effectiveUserId!)
      .maybeSingle() as { data: Pick<Response, "id" | "role" | "before_role" | "after_role" | "pickup_address" | "pickup_lat" | "pickup_lng" | "return_address" | "return_lat" | "return_lng" | "available_seats" | "departure_time"> | null };
    userResponse = response;

    if (response) {
      userStatus = "submitted";

      // Only show carpool assignments from the published snapshot
      const published = activeEvent.published_carpools as { before: PublishedCarpoolEntry[]; after: PublishedCarpoolEntry[] } | null;
      if (published) {
        // Helper to resolve rider profiles from a list of rider IDs
        async function resolveRiders(riderIds: string[]): Promise<typeof beforeAssignedRiders> {
          if (riderIds.length === 0) return [];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url, phone_number")
            .in("id", riderIds) as { data: { id: string; full_name: string; avatar_url: string | null; phone_number: string | null }[] | null };

          const { data: riderResponses } = await supabase
            .from("responses")
            .select("user_id, pickup_lat, pickup_lng, pickup_address, return_lat, return_lng, return_address")
            .eq("event_id", activeEvent!.id)
            .in("user_id", riderIds) as { data: { user_id: string; pickup_lat: number | null; pickup_lng: number | null; pickup_address: string | null; return_lat: number | null; return_lng: number | null; return_address: string | null }[] | null };

          if (!profiles) return [];
          return riderIds
            .map((id: string) => {
              const p = profiles.find((pr) => pr.id === id);
              const resp = riderResponses?.find((r: { user_id: string }) => r.user_id === id);
              if (!p) return null;
              return {
                id: p.id,
                full_name: p.full_name,
                avatar_url: p.avatar_url,
                phone_number: p.phone_number,
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

        // Helper to resolve a driver profile
        async function resolveDriver(driverId: string): Promise<typeof beforeAssignedDriver> {
          const { data: driverProfile } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", driverId)
            .single() as { data: { full_name: string; avatar_url: string | null } | null };

          const { data: driverResponse } = await supabase
            .from("responses")
            .select("pickup_lat, pickup_lng")
            .eq("event_id", activeEvent!.id)
            .eq("user_id", driverId)
            .maybeSingle() as { data: { pickup_lat: number | null; pickup_lng: number | null } | null };

          if (!driverProfile) return null;
          return {
            ...driverProfile,
            pickup_lat: driverResponse?.pickup_lat ?? null,
            pickup_lng: driverResponse?.pickup_lng ?? null,
          };
        }

        // Process each leg
        for (const legKey of ["before", "after"] as const) {
          const legEntries = published[legKey] ?? [];
          if (legEntries.length === 0) continue;

          // Check if user is a driver in this leg
          const driverEntry = legEntries.find((c) => c.driver_id === effectiveUserId);
          if (driverEntry) {
            userStatus = "ride-assigned";
            const riderIds = driverEntry.riders
              .sort((a, b) => a.pickup_order - b.pickup_order)
              .map((r) => r.rider_id);
            const riders = await resolveRiders(riderIds);

            // Fetch pickup order sent state
            const { data: carpoolSentData } = await supabase
              .from("carpools")
              .select("pickup_order_sent_at, pickup_order_sent_riders")
              .eq("id", driverEntry.id)
              .single() as { data: { pickup_order_sent_at: string | null; pickup_order_sent_riders: string[] | null } | null };

            if (legKey === "before") {
              beforeCarpoolId = driverEntry.id;
              beforeAssignedRiders = riders;
              beforePickupOrderSentAt = carpoolSentData?.pickup_order_sent_at ?? null;
              beforePickupOrderSentRiders = carpoolSentData?.pickup_order_sent_riders ?? [];
            } else {
              afterCarpoolId = driverEntry.id;
              afterAssignedRiders = riders;
              afterPickupOrderSentAt = carpoolSentData?.pickup_order_sent_at ?? null;
              afterPickupOrderSentRiders = carpoolSentData?.pickup_order_sent_riders ?? [];
            }
          } else {
            // Check if user is a rider in this leg
            const riderEntry = legEntries.find((c) =>
              c.riders.some((r) => r.rider_id === effectiveUserId)
            );
            if (riderEntry) {
              userStatus = "ride-assigned";
              const driver = await resolveDriver(riderEntry.driver_id);
              if (legKey === "before") {
                beforeCarpoolId = riderEntry.id;
                beforeAssignedDriver = driver;
              } else {
                afterCarpoolId = riderEntry.id;
                afterAssignedDriver = driver;
              }
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
            beforeAssignedRiders={beforeAssignedRiders}
            afterAssignedRiders={afterAssignedRiders}
            beforeAssignedDriver={beforeAssignedDriver}
            afterAssignedDriver={afterAssignedDriver}
            beforeCarpoolId={beforeCarpoolId}
            afterCarpoolId={afterCarpoolId}
            beforePickupOrderSentAt={beforePickupOrderSentAt}
            afterPickupOrderSentAt={afterPickupOrderSentAt}
            beforePickupOrderSentRiders={beforePickupOrderSentRiders}
            afterPickupOrderSentRiders={afterPickupOrderSentRiders}
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
