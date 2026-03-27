import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: _eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const riderId = url.searchParams.get("riderId");

  if (!riderId) {
    return NextResponse.json(
      { error: "riderId query param is required" },
      { status: 400 }
    );
  }

  // Count how many times each driver has given this rider a ride across all events
  const { data, error } = await supabase
    .from("carpool_riders")
    .select("carpool_id, carpools!inner(driver_id)")
    .eq("rider_id", riderId) as {
    data: Array<{
      carpool_id: string;
      carpools: { driver_id: string };
    }> | null;
    error: unknown;
  };

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch ride history" },
      { status: 500 }
    );
  }

  // Aggregate counts by driver
  const countMap = new Map<string, number>();
  for (const row of data ?? []) {
    const driverId = row.carpools.driver_id;
    countMap.set(driverId, (countMap.get(driverId) ?? 0) + 1);
  }

  const history = Array.from(countMap.entries()).map(([driver_id, count]) => ({
    driver_id,
    count,
  }));

  return NextResponse.json({ history });
}
