import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Get this user's existing response for this event
  const { data, error } = await supabase
    .from("responses")
    .select("*, preferences(*)")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
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
        user_id: user.id,
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
        available_seats: role === "driver" ? available_seats : null,
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

  return NextResponse.json(response, { status: 201 });
}
