import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getEffectiveUser } from "@/lib/impersonate";
import type { PublishedCarpoolEntry } from "@/types/database";

export async function PATCH(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUser = await getEffectiveUser();
  const effectiveUserId = effectiveUser?.effectiveUserId ?? user.id;

  const body = await request.json() as { carpoolId: string; leg?: string; riderOrder: string[] };
  const { carpoolId, leg, riderOrder } = body;

  if (!carpoolId || !Array.isArray(riderOrder)) {
    return NextResponse.json({ error: "Missing carpoolId or riderOrder" }, { status: 400 });
  }

  // Use admin client to bypass RLS for reads & writes (auth already verified above)
  const admin = createAdminClient();

  // Look up the carpool — try by ID first, then fall back to driver+event+leg
  // (published_carpools snapshot may hold stale IDs after a re-match)
  let carpool: { id: string; driver_id: string; event_id: string; leg: string } | null = null;

  const { data: byId } = await admin
    .from("carpools")
    .select("id, driver_id, event_id, leg")
    .eq("id", carpoolId)
    .maybeSingle() as { data: { id: string; driver_id: string; event_id: string; leg: string } | null };

  if (byId && byId.driver_id === effectiveUserId) {
    carpool = byId;
  } else if (leg) {
    // Fallback: the published snapshot may reference a deleted carpool ID.
    // Find the event that contains this carpoolId in its published_carpools JSON,
    // then look up the current carpool by driver + event + leg.
    let eventId = byId?.event_id;

    if (!eventId) {
      // Search events whose published_carpools JSON contains the stale carpool ID
      const { data: events } = await admin
        .from("events")
        .select("id, published_carpools")
        .not("published_carpools", "is", null) as {
        data: Array<{ id: string; published_carpools: { before: PublishedCarpoolEntry[]; after: PublishedCarpoolEntry[] } }> | null;
      };

      if (events) {
        for (const ev of events) {
          const allEntries = [...(ev.published_carpools.before ?? []), ...(ev.published_carpools.after ?? [])];
          if (allEntries.some((e) => e.id === carpoolId)) {
            eventId = ev.id;
            break;
          }
        }
      }
    }

    if (eventId) {
      const { data: byDriver } = await admin
        .from("carpools")
        .select("id, driver_id, event_id, leg")
        .eq("event_id", eventId)
        .eq("driver_id", effectiveUserId)
        .eq("leg", leg)
        .maybeSingle() as { data: { id: string; driver_id: string; event_id: string; leg: string } | null };
      carpool = byDriver;
    }
  }

  if (!carpool) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Ensure carpool_riders rows exist (they may be missing if the snapshot
  // was published before the current carpool records were created)
  const { data: existingRiders } = await admin
    .from("carpool_riders")
    .select("rider_id")
    .eq("carpool_id", carpool.id) as { data: Array<{ rider_id: string }> | null };

  const existingRiderIds = new Set((existingRiders ?? []).map((r) => r.rider_id));
  const missingRiders = riderOrder.filter((id) => !existingRiderIds.has(id));

  if (missingRiders.length > 0) {
    await admin
      .from("carpool_riders")
      .insert(
        missingRiders.map((riderId) => ({
          carpool_id: carpool.id,
          rider_id: riderId,
          pickup_order: riderOrder.indexOf(riderId) + 1,
        }))
      );
  }

  // Update pickup_order for each rider
  const updates = riderOrder.map((riderId, index) =>
    admin
      .from("carpool_riders")
      .update({ pickup_order: index + 1 })
      .eq("carpool_id", carpool.id)
      .eq("rider_id", riderId)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);

  if (failed?.error) {
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }

  // Sync the updated pickup order into published_carpools snapshot
  const { data: event } = await admin
    .from("events")
    .select("published_carpools")
    .eq("id", carpool.event_id)
    .single() as { data: { published_carpools: { before: PublishedCarpoolEntry[]; after: PublishedCarpoolEntry[] } | null } | null };

  if (event?.published_carpools) {
    const legKey = carpool.leg as "before" | "after";
    const updatedLeg = (event.published_carpools[legKey] ?? []).map((entry) => {
      // Match by current carpool.id, the stale carpoolId from the snapshot, or driver_id
      if (entry.id !== carpool.id && entry.id !== carpoolId && entry.driver_id !== effectiveUserId) return entry;
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

    await admin
      .from("events")
      .update({ published_carpools: updatedSnapshot })
      .eq("id", carpool.event_id);
  }

  // Record sent state on the carpool
  const now = new Date().toISOString();
  await admin
    .from("carpools")
    .update({
      pickup_order_sent_at: now,
      pickup_order_sent_riders: riderOrder,
    })
    .eq("id", carpool.id);

  return NextResponse.json({ success: true, pickup_order_sent_at: now, pickup_order_sent_riders: riderOrder });
}
