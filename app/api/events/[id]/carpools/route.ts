import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  notifyUsersIndividually,
  type PushPayload,
} from "@/lib/notifications/push";
import type { PublishedCarpoolEntry } from "@/types/database";

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
      "id, user_id, role, before_role, after_role, available_seats, pickup_address, pickup_lat, pickup_lng, departure_time, note, profiles:user_id(id, full_name, avatar_url, phone_number)"
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
      pickup_lat: number | null;
      pickup_lng: number | null;
      departure_time: string | null;
      note: string | null;
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
      "id, driver_id, leg, carpool_riders(rider_id, pickup_order)"
    )
    .eq("event_id", eventId) as {
    data: Array<{
      id: string;
      driver_id: string;
      leg: string;
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
  const { driverId, riderId, leg } = body as { driverId: string; riderId: string; leg: string };

  if (!driverId || !riderId || !leg) {
    return NextResponse.json(
      { error: "driverId, riderId, and leg are required" },
      { status: 400 }
    );
  }

  // Remove rider from any existing carpool in this event for the same leg
  const { data: existingCarpools } = await supabase
    .from("carpools")
    .select("id")
    .eq("event_id", eventId)
    .eq("leg", leg) as { data: Array<{ id: string }> | null };

  if (existingCarpools && existingCarpools.length > 0) {
    const carpoolIds = existingCarpools.map((c) => c.id);
    await supabase
      .from("carpool_riders")
      .delete()
      .eq("rider_id", riderId)
      .in("carpool_id", carpoolIds);
  }

  // Find or create a carpool for the driver in this leg
  let { data: carpool } = await supabase
    .from("carpools")
    .select("id")
    .eq("event_id", eventId)
    .eq("driver_id", driverId)
    .eq("leg", leg)
    .single();

  if (!carpool) {
    const { data: newCarpool, error: createError } = await supabase
      .from("carpools")
      .insert({
        event_id: eventId,
        driver_id: driverId,
        leg,
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

export async function DELETE(
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
  const { riderId, leg } = body as { riderId: string; leg: string };

  if (!riderId || !leg) {
    return NextResponse.json(
      { error: "riderId and leg are required" },
      { status: 400 }
    );
  }

  // Find all carpools for this event and leg, and remove the rider
  const { data: existingCarpools } = await supabase
    .from("carpools")
    .select("id")
    .eq("event_id", eventId)
    .eq("leg", leg) as { data: Array<{ id: string }> | null };

  if (existingCarpools && existingCarpools.length > 0) {
    const carpoolIds = existingCarpools.map((c) => c.id);
    await supabase
      .from("carpool_riders")
      .delete()
      .eq("rider_id", riderId)
      .in("carpool_id", carpoolIds);
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Snapshot current carpools + riders into published_carpools, grouped by leg
  // First, fetch the old published snapshot and event title for diff-based notifications
  const { data: eventData } = await supabase
    .from("events")
    .select("title, published_carpools")
    .eq("id", eventId)
    .single() as { data: { title: string; published_carpools: { before: PublishedCarpoolEntry[]; after: PublishedCarpoolEntry[] } | null } | null };

  const { data: carpools } = await supabase
    .from("carpools")
    .select("id, driver_id, leg, carpool_riders(rider_id, pickup_order)")
    .eq("event_id", eventId) as {
    data: Array<{
      id: string;
      driver_id: string;
      leg: string;
      carpool_riders: Array<{ rider_id: string; pickup_order: number }>;
    }> | null;
  };

  const toEntries = (items: typeof carpools): Array<{ id: string; driver_id: string; riders: Array<{ rider_id: string; pickup_order: number }> }> =>
    (items ?? []).map((c) => ({
      id: c.id,
      driver_id: c.driver_id,
      riders: (c.carpool_riders ?? [])
        .sort((a, b) => a.pickup_order - b.pickup_order)
        .map((r) => ({ rider_id: r.rider_id, pickup_order: r.pickup_order })),
    }));

  const publishedCarpools = {
    before: toEntries((carpools ?? []).filter((c) => c.leg === "before")),
    after: toEntries((carpools ?? []).filter((c) => c.leg === "after")),
  };

  const { data, error } = await supabase
    .from("events")
    .update({
      carpools_sent_at: new Date().toISOString(),
      published_carpools: publishedCarpools,
    })
    .eq("id", eventId)
    .select("carpools_sent_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to send carpool assignments" },
      { status: 500 }
    );
  }

  // --- Diff-based notifications ---
  // Build old assignment maps: riderId -> driverId, driverId -> Set<riderId>
  const oldRiderToDriver = new Map<string, string>();
  const oldDriverRiders = new Map<string, Set<string>>();
  const oldPublished = eventData?.published_carpools;
  if (oldPublished) {
    for (const leg of [oldPublished.before, oldPublished.after]) {
      for (const entry of leg ?? []) {
        const driverRiderSet = oldDriverRiders.get(entry.driver_id) ?? new Set<string>();
        for (const r of entry.riders) {
          oldRiderToDriver.set(r.rider_id, entry.driver_id);
          driverRiderSet.add(r.rider_id);
        }
        oldDriverRiders.set(entry.driver_id, driverRiderSet);
      }
    }
  }

  // Build new assignment maps
  const newRiderToDriver = new Map<string, string>();
  const newDriverRiders = new Map<string, Set<string>>();
  for (const leg of [publishedCarpools.before, publishedCarpools.after]) {
    for (const entry of leg ?? []) {
      const driverRiderSet = newDriverRiders.get(entry.driver_id) ?? new Set<string>();
      for (const r of entry.riders) {
        newRiderToDriver.set(r.rider_id, entry.driver_id);
        driverRiderSet.add(r.rider_id);
      }
      newDriverRiders.set(entry.driver_id, driverRiderSet);
    }
  }

  // Collect all user IDs we need names for
  const allUserIds = new Set<string>();
  for (const [riderId] of oldRiderToDriver) allUserIds.add(riderId);
  for (const [riderId] of newRiderToDriver) allUserIds.add(riderId);
  for (const [driverId] of oldDriverRiders) allUserIds.add(driverId);
  for (const [driverId] of newDriverRiders) allUserIds.add(driverId);

  // Fetch names
  const nameMap = new Map<string, string>();
  if (allUserIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(allUserIds)) as { data: Array<{ id: string; full_name: string }> | null };
    for (const p of profiles ?? []) {
      nameMap.set(p.id, p.full_name);
    }
  }

  const eventTitle = eventData?.title ?? "the event";
  const notifications: Array<{ userId: string; payload: PushPayload }> = [];

  // --- Rider notifications ---
  // All riders in the new assignments
  for (const [riderId, newDriverId] of newRiderToDriver) {
    const oldDriverId = oldRiderToDriver.get(riderId);
    const driverName = nameMap.get(newDriverId) ?? "Your driver";

    if (!oldDriverId) {
      // New assignment: rider didn't have a driver before
      notifications.push({
        userId: riderId,
        payload: { title: eventTitle, body: `${driverName} is your driver for ${eventTitle}`, url: "/", tag: `carpool-rider-${eventId}` },
      });
    } else if (oldDriverId !== newDriverId) {
      // Driver changed
      notifications.push({
        userId: riderId,
        payload: { title: eventTitle, body: `${driverName} is your new driver`, url: "/", tag: `carpool-rider-${eventId}` },
      });
    }
  }

  // Riders who were removed (in old but not in new)
  for (const [riderId, oldDriverId] of oldRiderToDriver) {
    if (!newRiderToDriver.has(riderId)) {
      const oldDriverName = nameMap.get(oldDriverId) ?? "Your driver";
      notifications.push({
        userId: riderId,
        payload: { title: eventTitle, body: `${oldDriverName} is no longer your driver. We will notify you when a driver has been assigned for you`, url: "/", tag: `carpool-rider-${eventId}` },
      });
    }
  }

  // --- Driver notifications ---
  for (const [driverId, newRiders] of newDriverRiders) {
    const oldRiders = oldDriverRiders.get(driverId) ?? new Set<string>();
    const addedRiders = [...newRiders].filter((r) => !oldRiders.has(r));
    const removedRiders = [...oldRiders].filter((r) => !newRiders.has(r));

    if (addedRiders.length > 0 || removedRiders.length > 0) {
      notifications.push({
        userId: driverId,
        payload: { title: eventTitle, body: "There was a change to your carpool assignment. Please review the pickup order and send it to your riders.", url: "/", tag: `carpool-driver-${eventId}` },
      });
    }
  }

  // Send all notifications (non-blocking)
  if (notifications.length > 0) {
    notifyUsersIndividually(supabase, notifications).catch((err) =>
      console.error("Failed to send carpool notifications:", err)
    );
  }

  return NextResponse.json({ success: true, carpools_sent_at: data.carpools_sent_at });
}
