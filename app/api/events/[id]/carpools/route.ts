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
