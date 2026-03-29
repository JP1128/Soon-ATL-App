import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  optimizedMatchCarpools,
  buildHaversineDistanceLookup,
  routeOrder,
  DESTINATION_ID,
  type OptimizationMetrics,
  type IterationSnapshot,
} from "@/lib/matching/algorithm";
import {
  geocodeAddress,
  fetchRouteLegs,
} from "@/lib/google-maps/distance-matrix";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: Request,
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
    .select("*")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  interface ResponseRow {
    user_id: string;
    role: string;
    before_role: string | null;
    after_role: string | null;
    pickup_lat: number | null;
    pickup_lng: number | null;
    available_seats: number | null;
    profiles: { id: string; full_name: string; avatar_url: string | null };
    preferences: Array<{ target_user_id: string; type: "prefer" | "avoid" }>;
  }

  const { data: responses } = await supabase
    .from("responses")
    .select(
      "user_id, role, before_role, after_role, pickup_lat, pickup_lng, available_seats, profiles:user_id(id, full_name, avatar_url), preferences(*)",
    )
    .eq("event_id", eventId) as { data: ResponseRow[] | null };

  if (!responses || responses.length === 0) {
    return NextResponse.json(
      { error: "No responses to match" },
      { status: 400 },
    );
  }

  const preferences = responses.flatMap((r) =>
    (r.preferences ?? []).map((p) => ({
      userId: r.user_id,
      targetUserId: p.target_user_id,
      type: p.type,
    })),
  );

  // Build profile lookup
  const profileMap: Record<
    string,
    { id: string; full_name: string; avatar_url: string | null }
  > = {};
  for (const r of responses) {
    profileMap[r.user_id] = r.profiles;
  }

  interface DriverRouteStats {
    distanceM: number;
    durationS: number;
  }

  const result: Record<
    string,
    Array<{ driverId: string; riderIds: string[] }>
  > = {};

  const metrics: Record<string, OptimizationMetrics> = {};
  const history: Record<string, IterationSnapshot[]> = {};
  const driverStats: Record<string, Record<string, DriverRouteStats>> = {};

  // Geocode event location to get destination coordinates
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  let destLat = 0;
  let destLng = 0;

  if (apiKey && event.location) {
    const coords = await geocodeAddress(event.location, apiKey);
    if (coords) {
      destLat = coords.lat;
      destLng = coords.lng;
    }
  }

  for (const legKey of ["before", "after"] as const) {
    const roleField = legKey === "before" ? "before_role" : "after_role";

    const drivers = responses
      .filter(
        (r) =>
          r[roleField] === "driver" &&
          r.pickup_lat != null &&
          r.pickup_lng != null,
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
          r.pickup_lng != null,
      )
      .map((r) => ({
        userId: r.user_id,
        lat: r.pickup_lat!,
        lng: r.pickup_lng!,
      }));

    if (drivers.length === 0 || riders.length === 0) {
      result[legKey] = [];
      metrics[legKey] = {
        greedyDistanceM: 0,
        optimizedDistanceM: 0,
        assignedRiders: 0,
        unassignedRiders: riders.length,
        preferencesSatisfied: 0,
        preferencesTotal: 0,
        iterations: 0,
        riderSpread: [0, 0, 0],
      };
      continue;
    }

    // Build point map for haversine distance lookup (used by optimizer)
    const points = new Map<string, { lat: number; lng: number }>();
    for (const d of drivers) points.set(d.userId, { lat: d.lat, lng: d.lng });
    for (const r of riders) points.set(r.userId, { lat: r.lat, lng: r.lng });
    if (destLat !== 0 || destLng !== 0) {
      points.set(DESTINATION_ID, { lat: destLat, lng: destLng });
    }

    // Optimize using haversine (free, fast, good proxy for relative distances)
    const optimized = optimizedMatchCarpools(
      drivers,
      riders,
      preferences,
      destLat,
      destLng,
    );
    result[legKey] = optimized.assignments;
    metrics[legKey] = optimized.metrics;
    history[legKey] = optimized.history;

    // Compute per-driver route order using haversine lookup
    const haversineLookup = buildHaversineDistanceLookup(points);
    const driverRoutes: string[][] = [];
    for (const a of optimized.assignments) {
      if (a.riderIds.length === 0) continue;
      driverRoutes.push(routeOrder(a.driverId, a.riderIds, DESTINATION_ID, haversineLookup));
    }

    // Fetch real driving distances/durations only for sequential route legs
    const legDriverStats: Record<string, DriverRouteStats> = {};
    if (apiKey && driverRoutes.length > 0) {
      try {
        const legResults = await fetchRouteLegs(driverRoutes, points, apiKey);
        for (const a of optimized.assignments) {
          const order = routeOrder(a.driverId, a.riderIds, DESTINATION_ID, haversineLookup);
          let distanceM = 0;
          let durationS = 0;
          for (let i = 0; i < order.length - 1; i++) {
            const leg = legResults.get(`${order[i]}→${order[i + 1]}`);
            if (leg) {
              distanceM += leg.distanceM;
              durationS += leg.durationS;
            } else {
              // Fallback to haversine for distance, no duration
              distanceM += haversineLookup(order[i], order[i + 1]);
            }
          }
          legDriverStats[a.driverId] = { distanceM, durationS };
        }
      } catch (e) {
        console.warn("Route legs API failed, using haversine:", e);
        for (const a of optimized.assignments) {
          const order = routeOrder(a.driverId, a.riderIds, DESTINATION_ID, haversineLookup);
          let distanceM = 0;
          for (let i = 0; i < order.length - 1; i++) {
            distanceM += haversineLookup(order[i], order[i + 1]);
          }
          legDriverStats[a.driverId] = { distanceM, durationS: 0 };
        }
      }
    } else {
      for (const a of optimized.assignments) {
        const order = routeOrder(a.driverId, a.riderIds, DESTINATION_ID, haversineLookup);
        let distanceM = 0;
        for (let i = 0; i < order.length - 1; i++) {
          distanceM += haversineLookup(order[i], order[i + 1]);
        }
        legDriverStats[a.driverId] = { distanceM, durationS: 0 };
      }
    }
    driverStats[legKey] = legDriverStats;
  }

  const responsePayload = { assignments: result, metrics, history, profiles: profileMap, driverStats };

  // Persist the last suggestion (without history — too large) so the page can show it on revisit
  await supabase
    .from("events")
    .update({ last_assistance: { assignments: result, metrics, profiles: profileMap, driverStats } })
    .eq("id", eventId);

  return NextResponse.json(responsePayload);
}
