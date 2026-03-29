import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ApplyRequestBody {
  assignments: {
    before: Array<{ driverId: string; riderIds: string[] }>;
    after: Array<{ driverId: string; riderIds: string[] }>;
  };
}

export async function POST(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id: eventId } = await params;
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

  if (profile?.role !== "organizer" && profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = (await request.json()) as ApplyRequestBody;

  if (!body.assignments) {
    return NextResponse.json({ error: "Missing assignments" }, { status: 400 });
  }

  // Delete existing carpools for this event
  await supabase.from("carpools").delete().eq("event_id", eventId);

  // Insert new carpools for each leg
  for (const legKey of ["before", "after"] as const) {
    const legAssignments = body.assignments[legKey] ?? [];

    for (const assignment of legAssignments) {
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
    }
  }

  return NextResponse.json({ success: true });
}
