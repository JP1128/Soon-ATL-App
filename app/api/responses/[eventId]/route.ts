import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUser } from "@/lib/impersonate";
import { notifyUsers } from "@/lib/notifications/push";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUser = await getEffectiveUser();
  const effectiveUserId = effectiveUser?.effectiveUserId ?? user.id;

  // Get this user's existing response for this event
  const { data, error } = await supabase
    .from("responses")
    .select("*, preferences(*)")
    .eq("event_id", eventId)
    .eq("user_id", effectiveUserId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch response" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUser = await getEffectiveUser();
  const effectiveUserId = effectiveUser?.effectiveUserId ?? user.id;

  // Verify event exists and is open
  const { data: event } = await supabase
    .from("events")
    .select("status")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.status !== "open") {
    return NextResponse.json(
      { error: "This event is not accepting responses" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const {
    role,
    before_role,
    after_role,
    pickup_address,
    pickup_lat,
    pickup_lng,
    dropoff_address,
    dropoff_lat,
    dropoff_lng,
    needs_return_ride,
    return_address,
    return_lat,
    return_lng,
    available_seats,
    departure_time,
    note,
    preferences,
  } = body;

  if (!role || !["driver", "rider", "attending"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Upsert response (one per user per event)
  const { data: response, error: responseError } = await supabase
    .from("responses")
    .upsert(
      {
        event_id: eventId,
        user_id: effectiveUserId,
        role,
        pickup_address: pickup_address || null,
        pickup_lat: pickup_lat || null,
        pickup_lng: pickup_lng || null,
        dropoff_address: dropoff_address || null,
        dropoff_lat: dropoff_lat || null,
        dropoff_lng: dropoff_lng || null,
        needs_return_ride: needs_return_ride ?? false,
        return_address: return_address || null,
        return_lat: return_lat || null,
        return_lng: return_lng || null,
        available_seats: (role === "driver" || before_role === "driver" || after_role === "driver") ? available_seats : null,
        before_role: before_role || null,
        after_role: after_role || null,
        departure_time: departure_time || null,
        note: note || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,user_id" }
    )
    .select()
    .single();

  if (responseError) {
    return NextResponse.json({ error: "Failed to save response" }, { status: 500 });
  }

  // Handle preferences — delete existing, then insert new
  if (Array.isArray(preferences)) {
    await supabase.from("preferences").delete().eq("response_id", response.id);

    if (preferences.length > 0) {
      const prefRows = preferences.map(
        (p: { target_user_id: string; type: string }) => ({
          response_id: response.id,
          target_user_id: p.target_user_id,
          type: p.type,
        })
      );

      await supabase.from("preferences").insert(prefRows);
    }
  }

  // Notify organizers about the new response
  const { data: submitter } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", effectiveUserId)
    .single() as { data: { full_name: string } | null };

  const { data: eventInfo } = await supabase
    .from("events")
    .select("title")
    .eq("id", eventId)
    .single() as { data: { title: string } | null };

  // Count unassigned riders: riders who responded but aren't in any carpool
  const { data: riderResponses } = await supabase
    .from("responses")
    .select("user_id")
    .eq("event_id", eventId)
    .in("role", ["rider"]) as { data: Array<{ user_id: string }> | null };

  // Also count those with before_role or after_role = rider
  const { data: legRiderResponses } = await supabase
    .from("responses")
    .select("user_id, before_role, after_role")
    .eq("event_id", eventId) as { data: Array<{ user_id: string; before_role: string | null; after_role: string | null }> | null };

  const allRiderIds = new Set<string>();
  for (const r of riderResponses ?? []) allRiderIds.add(r.user_id);
  for (const r of legRiderResponses ?? []) {
    if (r.before_role === "rider" || r.after_role === "rider") allRiderIds.add(r.user_id);
  }

  // Get riders already assigned to carpools
  const { data: eventCarpools } = await supabase
    .from("carpools")
    .select("id")
    .eq("event_id", eventId) as { data: Array<{ id: string }> | null };

  let assignedRiderCount = 0;
  if (eventCarpools && eventCarpools.length > 0) {
    const carpoolIds = eventCarpools.map((c) => c.id);
    const { data: assignedRiders } = await supabase
      .from("carpool_riders")
      .select("rider_id")
      .in("carpool_id", carpoolIds) as { data: Array<{ rider_id: string }> | null };
    assignedRiderCount = new Set((assignedRiders ?? []).map((r) => r.rider_id)).size;
  }

  const unassignedCount = allRiderIds.size - assignedRiderCount;
  const submitterName = submitter?.full_name ?? "Someone";
  const eventTitle = eventInfo?.title ?? "the event";

  // Get all organizer IDs
  const { data: organizers } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "organizer") as { data: Array<{ id: string }> | null };

  if (organizers && organizers.length > 0) {
    const organizerIds = organizers.map((o) => o.id);
    notifyUsers(supabase, organizerIds, {
      title: `${submitterName} responded — ${unassignedCount} unassigned`,
      body: "Review the carpool assignments.",
      url: `/dashboard/events/${eventId}`,
      tag: `response-${eventId}`,
    }).catch((err) => console.error("Failed to send response notification:", err));
  }

  return NextResponse.json(response, { status: 201 });
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUser = await getEffectiveUser();
  const effectiveUserId = effectiveUser?.effectiveUserId ?? user.id;

  // Find the user's response for this event
  const { data: response } = await supabase
    .from("responses")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", effectiveUserId)
    .maybeSingle();

  if (!response) {
    return NextResponse.json({ error: "Response not found" }, { status: 404 });
  }

  // Delete preferences first (foreign key constraint)
  await supabase.from("preferences").delete().eq("response_id", response.id);

  // Clean up carpool assignments for this user/event
  // Remove as rider from any carpools
  const { data: carpoolsForEvent } = await supabase
    .from("carpools")
    .select("id")
    .eq("event_id", eventId) as { data: { id: string }[] | null };

  if (carpoolsForEvent && carpoolsForEvent.length > 0) {
    const carpoolIds = carpoolsForEvent.map((c: { id: string }) => c.id);
    await supabase
      .from("carpool_riders")
      .delete()
      .in("carpool_id", carpoolIds)
      .eq("rider_id", effectiveUserId);
  }

  // Remove carpools where this user is the driver
  // First delete riders assigned to those carpools
  const { data: driverCarpools } = await supabase
    .from("carpools")
    .select("id")
    .eq("event_id", eventId)
    .eq("driver_id", effectiveUserId) as { data: { id: string }[] | null };

  if (driverCarpools && driverCarpools.length > 0) {
    const driverCarpoolIds = driverCarpools.map((c: { id: string }) => c.id);
    await supabase.from("carpool_riders").delete().in("carpool_id", driverCarpoolIds);
    await supabase.from("carpools").delete().in("id", driverCarpoolIds);
  }

  // Delete the response
  const { error } = await supabase
    .from("responses")
    .delete()
    .eq("id", response.id)
    .eq("user_id", effectiveUserId);

  if (error) {
    return NextResponse.json({ error: "Failed to remove response" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
