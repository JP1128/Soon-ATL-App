import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all responses with profile data
  const { data: responses, error: responsesError } = await supabase
    .from("responses")
    .select(
      "id, user_id, role, before_role, after_role, available_seats, pickup_address, profiles:user_id(id, full_name, avatar_url, phone_number)"
    )
    .eq("event_id", eventId) as {
    data: Array<{
      id: string;
      user_id: string;
      role: string;
      before_role: string | null;
      after_role: string | null;
      available_seats: number | null;
      pickup_address: string | null;
      profiles: {
        id: string;
        full_name: string;
        avatar_url: string | null;
        phone_number: string | null;
      };
    }> | null;
    error: unknown;
  };

  if (responsesError) {
    return NextResponse.json(
      { error: "Failed to fetch responses" },
      { status: 500 }
    );
  }

  // Get existing carpools with riders
  const { data: carpools } = await supabase
    .from("carpools")
    .select(
      "id, driver_id, carpool_riders(rider_id, pickup_order)"
    )
    .eq("event_id", eventId) as {
    data: Array<{
      id: string;
      driver_id: string;
      carpool_riders: Array<{
        rider_id: string;
        pickup_order: number;
      }>;
    }> | null;
  };

  return NextResponse.json({
    responses: responses ?? [],
    carpools: carpools ?? [],
  });
}

export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { driverId, riderId } = body as { driverId: string; riderId: string };

  if (!driverId || !riderId) {
    return NextResponse.json(
      { error: "driverId and riderId are required" },
      { status: 400 }
    );
  }

  // Remove rider from any existing carpool in this event
  const { data: existingCarpools } = await supabase
    .from("carpools")
    .select("id")
    .eq("event_id", eventId) as { data: Array<{ id: string }> | null };

  if (existingCarpools && existingCarpools.length > 0) {
    const carpoolIds = existingCarpools.map((c) => c.id);
    await supabase
      .from("carpool_riders")
      .delete()
      .eq("rider_id", riderId)
      .in("carpool_id", carpoolIds);
  }

  // Find or create a carpool for the driver
  let { data: carpool } = await supabase
    .from("carpools")
    .select("id")
    .eq("event_id", eventId)
    .eq("driver_id", driverId)
    .single();

  if (!carpool) {
    const { data: newCarpool, error: createError } = await supabase
      .from("carpools")
      .insert({
        event_id: eventId,
        driver_id: driverId,
        route_summary: {},
        total_distance_meters: 0,
        status: "manual",
      })
      .select("id")
      .single();

    if (createError || !newCarpool) {
      return NextResponse.json(
        { error: "Failed to create carpool" },
        { status: 500 }
      );
    }
    carpool = newCarpool;
  }

  // Get current max pickup_order for this carpool
  const { data: currentRiders } = await supabase
    .from("carpool_riders")
    .select("pickup_order")
    .eq("carpool_id", carpool.id)
    .order("pickup_order", { ascending: false })
    .limit(1);

  const nextOrder =
    currentRiders && currentRiders.length > 0
      ? currentRiders[0].pickup_order + 1
      : 1;

  // Add rider to carpool
  const { error: insertError } = await supabase
    .from("carpool_riders")
    .insert({
      carpool_id: carpool.id,
      rider_id: riderId,
      pickup_order: nextOrder,
    });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to add rider" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
