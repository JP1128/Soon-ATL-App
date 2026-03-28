import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PublishedCarpoolEntry } from "@/types/database";

export async function PATCH(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as { carpoolId: string; riderOrder: string[] };
  const { carpoolId, riderOrder } = body;

  if (!carpoolId || !Array.isArray(riderOrder)) {
    return NextResponse.json({ error: "Missing carpoolId or riderOrder" }, { status: 400 });
  }

  // Verify the user is the driver of this carpool
  const { data: carpool } = await supabase
    .from("carpools")
    .select("id, driver_id, event_id, leg")
    .eq("id", carpoolId)
    .single() as { data: { id: string; driver_id: string; event_id: string; leg: string } | null };

  if (!carpool || carpool.driver_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Update pickup_order for each rider
  const updates = riderOrder.map((riderId, index) =>
    supabase
      .from("carpool_riders")
      .update({ pickup_order: index + 1 })
      .eq("carpool_id", carpoolId)
      .eq("rider_id", riderId)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);

  if (failed?.error) {
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }

  // Sync the updated pickup order into published_carpools snapshot
  const { data: event } = await supabase
    .from("events")
    .select("published_carpools")
    .eq("id", carpool.event_id)
    .single() as { data: { published_carpools: { before: PublishedCarpoolEntry[]; after: PublishedCarpoolEntry[] } | null } | null };

  if (event?.published_carpools) {
    const legKey = carpool.leg as "before" | "after";
    const updatedLeg = (event.published_carpools[legKey] ?? []).map((entry) => {
      if (entry.id !== carpoolId) return entry;
      return {
        ...entry,
        riders: riderOrder.map((riderId, index) => ({
          rider_id: riderId,
          pickup_order: index + 1,
        })),
      };
    });

    const updatedSnapshot = {
      ...event.published_carpools,
      [legKey]: updatedLeg,
    };

    await supabase
      .from("events")
      .update({ published_carpools: updatedSnapshot })
      .eq("id", carpool.event_id);
  }

  // Record sent state on the carpool
  const now = new Date().toISOString();
  await supabase
    .from("carpools")
    .update({
      pickup_order_sent_at: now,
      pickup_order_sent_riders: riderOrder,
    })
    .eq("id", carpoolId);

  return NextResponse.json({ success: true, pickup_order_sent_at: now, pickup_order_sent_riders: riderOrder });
}
