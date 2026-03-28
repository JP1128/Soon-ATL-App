import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchCarpools } from "@/lib/matching/algorithm";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get event
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.status !== "closed") {
    return NextResponse.json(
      { error: "Close responses before generating matches" },
      { status: 400 }
    );
  }

  interface ResponseRow {
    user_id: string;
    role: string;
    before_role: string | null;
    after_role: string | null;
    pickup_lat: number | null;
    pickup_lng: number | null;
    available_seats: number | null;
    preferences: Array<{ target_user_id: string; type: "prefer" | "avoid" }>;
  }

  // Get all responses for this event
  const { data: responses } = await supabase
    .from("responses")
    .select("*, preferences(*)")
    .eq("event_id", eventId) as { data: ResponseRow[] | null };

  if (!responses || responses.length === 0) {
    return NextResponse.json(
      { error: "No responses to match" },
      { status: 400 }
    );
  }

  // Collect all preferences
  const preferences = responses.flatMap((r) =>
    (r.preferences ?? []).map((p) => ({
      userId: r.user_id,
      targetUserId: p.target_user_id,
      type: p.type,
    }))
  );

  // Delete existing carpools for this event
  await supabase.from("carpools").delete().eq("event_id", eventId);

  const allAssignments: Array<{ leg: string; driverId: string; riderIds: string[] }> = [];

  // Run matching for each leg
  for (const legKey of ["before", "after"] as const) {
    const roleField = legKey === "before" ? "before_role" : "after_role";

    const drivers = responses
      .filter(
        (r) =>
          r[roleField] === "driver" &&
          r.pickup_lat != null &&
          r.pickup_lng != null
      )
      .map((r) => ({
        userId: r.user_id,
        lat: r.pickup_lat!,
        lng: r.pickup_lng!,
        availableSeats: r.available_seats ?? 3,
      }));

    const riders = responses
      .filter(
        (r) =>
          r[roleField] === "rider" &&
          r.pickup_lat != null &&
          r.pickup_lng != null
      )
      .map((r) => ({
        userId: r.user_id,
        lat: r.pickup_lat!,
        lng: r.pickup_lng!,
      }));

    if (drivers.length === 0 || riders.length === 0) continue;

    // Use 0,0 as placeholder destination — will use actual event coordinates later
    const assignments = matchCarpools(drivers, riders, preferences, 0, 0);

    // Insert new carpools for this leg
    for (const assignment of assignments) {
      const { data: carpool, error: carpoolError } = await supabase
        .from("carpools")
        .insert({
          event_id: eventId,
          driver_id: assignment.driverId,
          leg: legKey,
          status: "auto",
        })
        .select()
        .single();

      if (carpoolError || !carpool) continue;

      if (assignment.riderIds.length > 0) {
        const riderRows = assignment.riderIds.map((riderId, index) => ({
          carpool_id: carpool.id,
          rider_id: riderId,
          pickup_order: index + 1,
        }));

        await supabase.from("carpool_riders").insert(riderRows);
      }

      allAssignments.push({ leg: legKey, ...assignment });
    }
  }

  return NextResponse.json({ success: true, assignments: allAssignments });
}
