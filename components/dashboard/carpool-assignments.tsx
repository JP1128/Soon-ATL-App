"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Car01Icon, SteeringIcon, UserGroupIcon, UserAdd01Icon, UserRemove01Icon, SentIcon, MapsSearchIcon, TextIcon, Clock01Icon, AlertCircleIcon, Navigation03Icon } from "@hugeicons/core-free-icons";
import { cn, formatPhoneNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ── Haversine + route helpers (module-level, no hooks) ────── */
const ROAD_FACTOR = 1.3;
const AVG_SPEED_KMH = 55;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest-neighbor chain: start → pickups → optional destination.
 *  Returns { minutes, km } */
function nnRoute(
  startLat: number,
  startLng: number,
  coords: Array<{ lat: number; lng: number }>,
  destination?: { lat: number; lng: number } | null
): { minutes: number; km: number } {
  if (coords.length === 0 && !destination) return { minutes: 0, km: 0 };
  let totalKm = 0;
  let current = { lat: startLat, lng: startLng };
  const remaining = [...coords];
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const km = haversineKm(current, remaining[i]);
      if (km < bestKm) {
        bestKm = km;
        bestIdx = i;
      }
    }
    totalKm += bestKm;
    current = remaining[bestIdx];
    remaining.splice(bestIdx, 1);
  }
  if (destination) {
    totalKm += haversineKm(current, destination);
  }
  const roadKm = totalKm * ROAD_FACTOR;
  return {
    km: Math.round(roadKm),
    minutes: Math.round((roadKm / AVG_SPEED_KMH) * 60),
  };
}

interface ProfileData {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone_number: string | null;
}

interface ResponseRow {
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
  profiles: ProfileData;
}

interface CarpoolRow {
  id: string;
  driver_id: string;
  carpool_riders: Array<{
    rider_id: string;
    pickup_order: number;
  }>;
}

type Leg = "before" | "after";

interface DriverEntry {
  userId: string;
  profile: ProfileData;
  availableSeats: number;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  departureTime: string | null;
  note: string | null;
  assignedRiders: RiderEntry[];
}

interface RiderEntry {
  userId: string;
  profile: ProfileData;
  departureTime: string | null;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  note: string | null;
}

interface CarpoolAssignmentsProps {
  eventId: string;
  eventLocation: string;
  carpoolsSentAt: string | null;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatPhone(phone: string | null): string {
  if (!phone) return "No phone";
  return formatPhoneNumber(phone);
}

function formatDepartureTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function stripStateZip(address: string): string {
  return address.replace(/,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?,?\s*(USA|US)?$/i, "").replace(/,\s*$/, "");
}

function ScrollReveal({ children, className, scrollRoot }: { children: React.ReactNode; className?: string; scrollRoot: React.RefObject<HTMLDivElement | null> }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { root: scrollRoot.current, threshold: 0.1, rootMargin: "0px 0px -120px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot]);

  return (
    <div
      ref={ref}
      style={{
        transform: isVisible ? "translateX(0)" : "translateX(1.5rem)",
        opacity: isVisible ? 1 : 0,
        transition: isVisible
          ? "transform 300ms ease-out, opacity 300ms ease-out"
          : "transform 150ms ease-in, opacity 150ms ease-in",
      }}
      className={className}
    >
      {children}
    </div>
  );
}

import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps/constants";

export function CarpoolAssignments({
  eventId,
  eventLocation,
  carpoolsSentAt,
}: CarpoolAssignmentsProps): React.ReactElement {
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [carpools, setCarpools] = useState<CarpoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [leg, setLeg] = useState<Leg>("before");
  const [listView, setListView] = useState<"drivers" | "riders">("drivers");
  const [search, setSearch] = useState("");
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [expandedOffset, setExpandedOffset] = useState(0);
  const [animatingUp, setAnimatingUp] = useState(false);
  const driverCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [addRiderTarget, setAddRiderTarget] = useState<{
    driverId: string;
    driverName: string;
    availableSeats: number;
    currentRiderCount: number;
    driverLat: number | null;
    driverLng: number | null;
    assignedRiderCoords: Array<{ lat: number; lng: number }>;
  } | null>(null);
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(true);
  const [riderDetailTarget, setRiderDetailTarget] = useState<{
    rider: RiderEntry;
    currentDriver: { userId: string; name: string } | null;
  } | null>(null);
  const [rideHistory, setRideHistory] = useState<Map<string, number>>(new Map());
  const [placeNames, setPlaceNames] = useState<Map<string, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(carpoolsSentAt);
  const [sending, setSending] = useState(false);

  const checkScroll = useCallback((): void => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 10);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", checkScroll, { passive: true });

    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    for (const child of el.children) {
      ro.observe(child);
    }

    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, loading]);

  useEffect(() => {
    async function fetchData(): Promise<void> {
      const res = await fetch(`/api/events/${eventId}/carpools`);
      if (res.ok) {
        const data = await res.json();
        setResponses(data.responses);
        setCarpools(data.carpools);
      }
      setLoading(false);
    }
    fetchData();
  }, [eventId]);

  // Load Google Maps JS API for place name resolution
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: "weekly",
  });

  // Geocode event location once
  const [eventCoords, setEventCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!mapsLoaded || !eventLocation) return;
    const geocoder = new google.maps.Geocoder();
    let cancelled = false;
    geocoder.geocode({ address: eventLocation }, (results, status) => {
      if (cancelled || status !== "OK" || !results?.[0]) return;
      const loc = results[0].geometry.location;
      setEventCoords({ lat: loc.lat(), lng: loc.lng() });
    });
    return (): void => { cancelled = true; };
  }, [mapsLoaded, eventLocation]);

  // Resolve place names for driver pickup locations
  useEffect(() => {
    if (!mapsLoaded || responses.length === 0) return;

    const driversWithCoords = responses.filter(
      (r) => (r.before_role === "driver" || r.after_role === "driver") && r.pickup_lat && r.pickup_lng
    );

    if (driversWithCoords.length === 0) return;

    const geocoder = new google.maps.Geocoder();
    let cancelled = false;

    async function resolveNames(): Promise<void> {
      const newNames = new Map<string, string>();

      await Promise.all(
        driversWithCoords.map(async (driver) => {
          // Skip if already resolved
          if (placeNames.has(driver.user_id)) return;

          try {
            const result = await geocoder.geocode({
              location: { lat: driver.pickup_lat!, lng: driver.pickup_lng! },
            });

            if (cancelled) return;

            // Look for a result with establishment or point_of_interest type
            const establishment = result.results.find((r) =>
              r.types.some((t) =>
                ["establishment", "point_of_interest", "food", "store", "restaurant", "cafe", "university", "school", "church", "park", "stadium", "airport"].includes(t)
              )
            );

            if (establishment) {
              // Extract the place name (first address component, or formatted address before the first comma)
              const name = establishment.formatted_address.split(",")[0];
              newNames.set(driver.user_id, name);
            }
          } catch {
            // Ignore geocoding errors
          }
        })
      );

      if (!cancelled && newNames.size > 0) {
        setPlaceNames((prev) => {
          const updated = new Map(prev);
          for (const [k, v] of newNames) {
            updated.set(k, v);
          }
          return updated;
        });
      }
    }

    resolveNames();
    return () => { cancelled = true; };
  }, [mapsLoaded, responses, placeNames]);

  const { drivers, riders, unassignedRiders, assignedRiderIds } = useMemo(() => {
    const roleField = leg === "before" ? "before_role" : "after_role";

    // Build profile map
    const profileMap = new Map<string, ProfileData>();
    for (const r of responses) {
      if (r.profiles) {
        profileMap.set(r.user_id, r.profiles);
      }
    }

    // Get drivers and riders for this leg
    const legDrivers = responses.filter((r) => r[roleField] === "driver");
    const legRiders = responses.filter((r) => r[roleField] === "rider");

    // Build assignment map from carpools: driver_id -> rider_ids
    const assignmentMap = new Map<string, string[]>();
    for (const c of carpools) {
      const riderIds = c.carpool_riders
        .sort((a, b) => a.pickup_order - b.pickup_order)
        .map((cr) => cr.rider_id);
      assignmentMap.set(c.driver_id, riderIds);
    }

    // Build response lookup for rider details
    const responseMap = new Map<string, ResponseRow>();
    for (const r of responses) {
      responseMap.set(r.user_id, r);
    }

    // Build driver entries
    const driverEntries: DriverEntry[] = legDrivers.map((d) => {
      const assigned = assignmentMap.get(d.user_id) ?? [];
      const assignedRiders: RiderEntry[] = assigned
        .filter((riderId) => {
          // Only include riders who are actually riders in this leg
          return legRiders.some((r) => r.user_id === riderId);
        })
        .map((riderId) => {
          const resp = responseMap.get(riderId);
          return {
            userId: riderId,
            profile: profileMap.get(riderId) ?? {
              id: riderId,
              full_name: "Unknown",
              avatar_url: null,
              phone_number: null,
            },
            departureTime: resp?.departure_time ?? null,
            pickupAddress: resp?.pickup_address ?? null,
            pickupLat: resp?.pickup_lat ?? null,
            pickupLng: resp?.pickup_lng ?? null,
            note: resp?.note ?? null,
          };
        });

      return {
        userId: d.user_id,
        profile: d.profiles,
        availableSeats: d.available_seats ?? 0,
        pickupAddress: d.pickup_address,
        pickupLat: d.pickup_lat,
        pickupLng: d.pickup_lng,
        departureTime: d.departure_time,
        note: d.note,
        assignedRiders,
      };
    });

    // Find unassigned riders
    const assignedRiderIds = new Set(
      driverEntries.flatMap((d) => d.assignedRiders.map((r) => r.userId))
    );
    const unassigned: RiderEntry[] = legRiders
      .filter((r) => !assignedRiderIds.has(r.user_id))
      .map((r) => ({
        userId: r.user_id,
        profile: r.profiles,
        departureTime: r.departure_time,
        pickupAddress: r.pickup_address,
        pickupLat: r.pickup_lat,
        pickupLng: r.pickup_lng,
        note: r.note,
      }));

    return {
      drivers: driverEntries,
      riders: legRiders,
      unassignedRiders: unassigned,
      assignedRiderIds,
    };
  }, [responses, carpools, leg]);

  // Unassigned rider counts per leg (for tab badges)
  const unassignedCounts = useMemo(() => {
    const counts: Record<Leg, number> = { before: 0, after: 0 };
    for (const legKey of ["before", "after"] as Leg[]) {
      const roleField = legKey === "before" ? "before_role" : "after_role";
      const legRiders = responses.filter((r) => r[roleField] === "rider");
      const legDrivers = responses.filter((r) => r[roleField] === "driver");
      const assignmentMap = new Map<string, string[]>();
      for (const c of carpools) {
        assignmentMap.set(c.driver_id, c.carpool_riders.map((cr) => cr.rider_id));
      }
      const assigned = new Set(
        legDrivers.flatMap((d) => {
          const riderIds = assignmentMap.get(d.user_id) ?? [];
          return riderIds.filter((rid) => legRiders.some((r) => r.user_id === rid));
        })
      );
      counts[legKey] = legRiders.filter((r) => !assigned.has(r.user_id)).length;
    }
    return counts;
  }, [responses, carpools]);

  // Build full rider list with assignment status
  const allRiderEntries = useMemo(() => {
    const roleField = leg === "before" ? "before_role" : "after_role";
    const legRiders = responses.filter((r) => r[roleField] === "rider");
    return legRiders.map((r) => ({
      userId: r.user_id,
      profile: r.profiles,
      assigned: assignedRiderIds.has(r.user_id),
      pickupLat: r.pickup_lat,
      pickupLng: r.pickup_lng,
    })).sort((a, b) => {
      // Unassigned first
      if (a.assigned !== b.assigned) return a.assigned ? 1 : -1;
      // Then alphabetically by first name
      return a.profile.full_name.localeCompare(b.profile.full_name);
    });
  }, [responses, leg, assignedRiderIds]);

  // Map rider -> assigned driver for the overlay
  const riderDriverMap = useMemo(() => {
    const map = new Map<string, { driverId: string; driverName: string }>();
    for (const driver of drivers) {
      for (const rider of driver.assignedRiders) {
        map.set(rider.userId, { driverId: driver.userId, driverName: driver.profile.full_name });
      }
    }
    return map;
  }, [drivers]);

  // Riders shown in the overlay
  const overlayRiders = useMemo(() => {
    const roleField = leg === "before" ? "before_role" : "after_role";
    const legRiders = responses.filter((r) => r[roleField] === "rider");
    const entries = legRiders
      .map((r) => ({
        userId: r.user_id,
        profile: r.profiles,
        assignedTo: riderDriverMap.get(r.user_id) ?? null,
        pickupLat: r.pickup_lat,
        pickupLng: r.pickup_lng,
      }))
      // Exclude riders already assigned to the target driver
      .filter((r) => !(r.assignedTo && addRiderTarget && r.assignedTo.driverId === addRiderTarget.driverId));
    if (showOnlyUnassigned) {
      return entries.filter((r) => !r.assignedTo);
    }
    return entries;
  }, [responses, leg, riderDriverMap, showOnlyUnassigned, addRiderTarget]);

  // Filter by search
  const lowerSearch = search.toLowerCase();
  const filteredDrivers = useMemo(() => {
    if (!lowerSearch) return drivers;
    return drivers.filter((d) => {
      const driverMatch = d.profile.full_name
        .toLowerCase()
        .includes(lowerSearch);
      const riderMatch = d.assignedRiders.some((r) =>
        r.profile.full_name.toLowerCase().includes(lowerSearch)
      );
      return driverMatch || riderMatch;
    });
  }, [drivers, lowerSearch]);

  const filteredRiders = useMemo(() => {
    if (!lowerSearch) return allRiderEntries;
    return allRiderEntries.filter((r) =>
      r.profile.full_name.toLowerCase().includes(lowerSearch)
    );
  }, [allRiderEntries, lowerSearch]);

  function toggleDriver(userId: string): void {
    setExpandedDriver((prev) => {
      const next = prev === userId ? null : userId;
      if (next) {
        // Capture the card's current offset relative to scroll container
        const cardEl = driverCardRefs.current.get(userId);
        const scrollEl = scrollRef.current;
        if (cardEl && scrollEl) {
          const offset = cardEl.offsetTop - scrollEl.scrollTop;
          setExpandedOffset(offset);
          setAnimatingUp(true);
        }
        if (scrollEl) {
          scrollEl.scrollTop = 0;
        }
        // Next frame: animate to translateY(0)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setAnimatingUp(false);
          });
        });
      } else {
        setExpandedOffset(0);
        setAnimatingUp(false);
      }
      return next;
    });
    // Recheck scroll after expand animation
    setTimeout(checkScroll, 250);
  }

  async function handleAddRiders(riderIds: string[]): Promise<void> {
    if (!addRiderTarget || riderIds.length === 0) return;
    const { driverId } = addRiderTarget;

    // Optimistically update local state
    setCarpools((prev) => {
      let updated = prev.map((c) => ({
        ...c,
        carpool_riders: c.carpool_riders.filter((cr) => !riderIds.includes(cr.rider_id)),
      }));

      const existing = updated.find((c) => c.driver_id === driverId);
      if (existing) {
        let nextOrder = existing.carpool_riders.length + 1;
        for (const riderId of riderIds) {
          existing.carpool_riders = [
            ...existing.carpool_riders,
            { rider_id: riderId, pickup_order: nextOrder++ },
          ];
        }
      } else {
        updated.push({
          id: crypto.randomUUID(),
          driver_id: driverId,
          carpool_riders: riderIds.map((riderId, i) => ({ rider_id: riderId, pickup_order: i + 1 })),
        });
      }

      return updated;
    });

    setAddRiderTarget(null);

    // Persist to server
    try {
      for (const riderId of riderIds) {
        await fetch(`/api/events/${eventId}/carpools`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId, riderId }),
        });
      }
    } catch {
      const res = await fetch(`/api/events/${eventId}/carpools`);
      if (res.ok) {
        const data = await res.json();
        setCarpools(data.carpools);
      }
    }
  }

  async function handleRemoveRider(riderId: string): Promise<void> {
    // Optimistically remove from local state
    setCarpools((prev) =>
      prev.map((c) => ({
        ...c,
        carpool_riders: c.carpool_riders.filter((cr) => cr.rider_id !== riderId),
      }))
    );
    setRiderDetailTarget(null);

    try {
      await fetch(`/api/events/${eventId}/carpools`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId }),
      });
    } catch {
      const res = await fetch(`/api/events/${eventId}/carpools`);
      if (res.ok) {
        const data = await res.json();
        setCarpools(data.carpools);
      }
    }
  }

  async function handleReassignRider(riderId: string, newDriverId: string): Promise<void> {
    // Optimistically update
    setCarpools((prev) => {
      const updated = prev.map((c) => ({
        ...c,
        carpool_riders: c.carpool_riders.filter((cr) => cr.rider_id !== riderId),
      }));

      const existing = updated.find((c) => c.driver_id === newDriverId);
      if (existing) {
        existing.carpool_riders = [
          ...existing.carpool_riders,
          { rider_id: riderId, pickup_order: existing.carpool_riders.length + 1 },
        ];
      } else {
        updated.push({
          id: crypto.randomUUID(),
          driver_id: newDriverId,
          carpool_riders: [{ rider_id: riderId, pickup_order: 1 }],
        });
      }
      return updated;
    });
    setRiderDetailTarget(null);

    try {
      await fetch(`/api/events/${eventId}/carpools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: newDriverId, riderId }),
      });
    } catch {
      const res = await fetch(`/api/events/${eventId}/carpools`);
      if (res.ok) {
        const data = await res.json();
        setCarpools(data.carpools);
      }
    }
  }

  async function handleSend(): Promise<void> {
    setSending(true);
    try {
      const res = await fetch(`/api/events/${eventId}/carpools`, {
        method: "PATCH",
      });
      if (res.ok) {
        const data = await res.json();
        setSentAt(data.carpools_sent_at);
      }
    } catch {
      // silently fail
    } finally {
      setSending(false);
      setShowSendConfirm(false);
    }
  }

  // Fetch ride history when rider detail overlay opens
  useEffect(() => {
    if (!riderDetailTarget) {
      setRideHistory(new Map());
      return;
    }

    async function fetchHistory(): Promise<void> {
      try {
        const res = await fetch(
          `/api/events/${eventId}/carpools/history?riderId=${riderDetailTarget!.rider.userId}`
        );
        if (res.ok) {
          const data = await res.json();
          const map = new Map<string, number>();
          for (const entry of data.history as Array<{ driver_id: string; count: number }>) {
            map.set(entry.driver_id, entry.count);
          }
          setRideHistory(map);
        }
      } catch {
        // Ignore — ride history is non-critical
      }
    }
    fetchHistory();
  }, [riderDetailTarget, eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Fixed header: title, toggles, stats, search */}
      <div className="flex-none space-y-5 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Carpool Assignment</h1>
          <Button size="sm" onClick={() => setShowSendConfirm(true)}>
            <HugeiconsIcon icon={SentIcon} className="size-4" strokeWidth={1.5} />
            {sentAt ? "Review Update" : "Review"}
          </Button>
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          {/* Before / After toggle */}
          <div className="flex rounded-lg bg-secondary/50 p-0.5">
            <button
              type="button"
              onClick={() => setLeg("before")}
              className={cn(
                "inline-flex flex-1 items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                leg === "before"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Before event"
            >
              Before
              {unassignedCounts.before > 0 && (
                <span className="size-1.5 rounded-full bg-destructive ml-1" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setLeg("after")}
              className={cn(
                "inline-flex flex-1 items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                leg === "after"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="After event"
            >
              After
              {unassignedCounts.after > 0 && (
                <span className="size-1.5 rounded-full bg-destructive ml-1" />
              )}
            </button>
          </div>

          {/* Driver / Rider toggle */}
          <div className="flex rounded-lg bg-secondary/50 p-0.5">
          <button
            type="button"
            onClick={() => setListView("drivers")}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              listView === "drivers"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <HugeiconsIcon icon={SteeringIcon} className="size-4" strokeWidth={1.5} />
            Drivers ({drivers.length})
          </button>
          <button
            type="button"
            onClick={() => setListView("riders")}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              listView === "riders"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <HugeiconsIcon icon={UserGroupIcon} className="size-4" strokeWidth={1.5} />
            Riders ({riders.length})
            {unassignedRiders.length > 0 && (
              <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                {unassignedRiders.length}
              </span>
            )}
          </button>
        </div>
        </div>

        {/* Search */}
        <Input
          placeholder={listView === "drivers" ? "Search drivers…" : "Search riders…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Top scroll indicator */}
      <div
        className={cn(
          "flex-none flex justify-center h-5 items-center transition-opacity duration-200",
          canScrollUp ? "opacity-100" : "opacity-0"
        )}
      >
        <span className="text-[10px] tracking-[0.25em] text-muted-foreground/50">•••</span>
      </div>

      {/* Scroll area — relative wrapper so bottom dot is absolute and doesn't steal height */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className={cn(
            "absolute inset-0 overflow-x-hidden overscroll-contain scrollbar-none",
            expandedDriver && listView === "drivers" ? "overflow-hidden" : "overflow-y-auto"
          )}
          style={
            expandedDriver && listView === "drivers"
              ? undefined
              : {
                  maskImage: `linear-gradient(to bottom, ${canScrollUp ? "transparent, black 1.5rem" : "black 0%"}, black calc(100% - 7.5rem), transparent calc(100% - 6rem), transparent)`,
                  WebkitMaskImage: `linear-gradient(to bottom, ${canScrollUp ? "transparent, black 1.5rem" : "black 0%"}, black calc(100% - 7.5rem), transparent calc(100% - 6rem), transparent)`,
                }
          }
        >
          <div className={cn("space-y-1.5 pb-28", expandedDriver && listView === "drivers" && "h-full space-y-0!")}>
          {listView === "drivers" ? (
            filteredDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drivers found</p>
            ) : (
              filteredDrivers.map((driver) => {
                const isExpanded = expandedDriver === driver.userId;
                const isHidden = expandedDriver !== null && !isExpanded;
                const isFull = driver.availableSeats > 0 && driver.assignedRiders.length >= driver.availableSeats;
                return (
                  <ScrollReveal key={driver.userId} scrollRoot={scrollRef} className={cn(isExpanded && "h-full", isHidden && "h-0 m-0! p-0! overflow-hidden")}>
                    <div
                      ref={(el) => {
                        if (el) driverCardRefs.current.set(driver.userId, el);
                        else driverCardRefs.current.delete(driver.userId);
                      }}
                      className={cn(
                        "rounded-lg border overflow-hidden transition-all duration-200 ease-out",
                        isExpanded && "h-full flex flex-col overflow-y-auto",
                        isHidden && "opacity-0 h-0 border-transparent m-0! p-0! pointer-events-none",
                      )}
                      style={
                        isExpanded
                          ? {
                              transform: animatingUp ? `translateY(${expandedOffset}px)` : "translateY(0)",
                              transition: "transform 250ms ease-out, height 200ms ease-out",
                            }
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleDriver(driver.userId)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-secondary/30"
                      >
                        <Avatar size="sm">
                          {driver.profile.avatar_url && (
                            <AvatarImage
                              src={driver.profile.avatar_url}
                              alt={driver.profile.full_name}
                            />
                          )}
                          <AvatarFallback>
                            {getInitials(driver.profile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {driver.profile.full_name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {formatPhone(driver.profile.phone_number)}
                            {(() => {
                              const earliest = driver.assignedRiders
                                .filter((r) => r.departureTime)
                                .map((r) => r.departureTime!)
                                .sort()[0];
                              if (!earliest) return null;
                              const hasConflict = driver.departureTime && earliest > driver.departureTime;
                              return (
                                <>
                                  <span className="mx-1">·</span>
                                  <span className={cn(hasConflict && "text-destructive font-medium")}>
                                    {hasConflict && <HugeiconsIcon icon={AlertCircleIcon} className="size-3 inline-block align-[-2px] mr-0.5" strokeWidth={2} />}Pickup {formatDepartureTime(earliest)}
                                  </span>
                                </>
                              );
                            })()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("flex items-center gap-1 text-xs text-muted-foreground", isFull && "line-through")}>
                            <HugeiconsIcon
                              icon={Car01Icon}
                              className="size-3.5"
                              strokeWidth={1.5}
                            />
                            {driver.assignedRiders.length}/{driver.availableSeats}
                          </span>
                          <HugeiconsIcon
                            icon={ArrowDown01Icon}
                            className={cn(
                              "size-4 text-muted-foreground transition-transform duration-200",
                              isExpanded && "rotate-180"
                            )}
                            strokeWidth={1.5}
                          />
                        </div>
                      </button>

                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-200 ease-out",
                          isExpanded ? "grid-rows-[1fr] flex-1" : "grid-rows-[0fr]"
                        )}
                      >
                        <div className={cn("overflow-hidden", isExpanded && "flex flex-col")}>
                          <div className={cn("border-t bg-secondary/20 px-3 py-2", isExpanded && "flex-1")}>
                            {/* Driver details */}
                            {(driver.pickupAddress || driver.departureTime || driver.note) && (
                              <div className="space-y-1.5 pb-2 mb-1.5 border-b border-border/50">
                                {driver.pickupAddress && (
                                  <div className="flex items-start gap-1.5">
                                    <HugeiconsIcon icon={MapsSearchIcon} className="size-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                                    <p className="text-[11px] text-muted-foreground leading-tight">{stripStateZip(driver.pickupAddress)}</p>
                                  </div>
                                )}
                                {driver.departureTime && (
                                  <div className="flex items-center gap-1.5">
                                    <HugeiconsIcon icon={Clock01Icon} className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                                    <p className="text-[11px] text-muted-foreground">Latest departure <span className="font-medium text-foreground">{formatDepartureTime(driver.departureTime)}</span></p>
                                  </div>
                                )}
                                {driver.note && (
                                  <div className="flex items-start gap-1.5">
                                    <HugeiconsIcon icon={TextIcon} className="size-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                                    <p className="text-[11px] text-muted-foreground leading-tight italic">{driver.note}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            {(() => {
                              // Route stats: driver → rider pickups → event
                              if (driver.pickupLat == null || driver.pickupLng == null) return null;
                              const riderCoords = driver.assignedRiders
                                .filter((r) => r.pickupLat != null && r.pickupLng != null)
                                .map((r) => ({ lat: r.pickupLat!, lng: r.pickupLng! }));
                              const route = nnRoute(driver.pickupLat!, driver.pickupLng!, riderCoords, eventCoords);
                              if (route.minutes === 0) return null;
                              return (
                                <div className="flex items-center gap-1.5 pb-1.5">
                                  <HugeiconsIcon icon={Navigation03Icon} className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                                  <p className="text-[11px] text-muted-foreground">
                                    ~{route.minutes} min · {Math.round(route.km * 0.621371)} mi
                                  </p>
                                </div>
                              );
                            })()}
                            {driver.assignedRiders.length > 0 && (() => {
                              const riderTimes = driver.assignedRiders
                                .filter((r) => r.departureTime)
                                .map((r) => r.departureTime!);
                              if (riderTimes.length === 0) return null;
                              const earliest = riderTimes.sort()[0];
                              const hasConflict = driver.departureTime && earliest > driver.departureTime;
                              return (
                                <div className="flex items-center gap-1.5 pb-1.5">
                                  <HugeiconsIcon icon={hasConflict ? AlertCircleIcon : Clock01Icon} className={cn("size-3.5 shrink-0", hasConflict ? "text-destructive" : "text-muted-foreground")} strokeWidth={1.5} />
                                  <p className={cn("text-[11px]", hasConflict ? "text-destructive" : "text-muted-foreground")}>
                                    Pickup <span className={cn("font-medium", hasConflict ? "text-destructive" : "text-foreground")}>{formatDepartureTime(earliest)}</span>
                                    {hasConflict && <> · departs {formatDepartureTime(driver.departureTime!)}</>}
                                  </p>
                                </div>
                              );
                            })()}
                            {driver.assignedRiders.length === 0 ? (
                              <p className="py-1.5 text-[11px] text-muted-foreground">
                                No riders assigned
                              </p>
                            ) : (
                              <div className="divide-y divide-border/50">
                                {driver.assignedRiders.map((rider) => (
                                  <button
                                    type="button"
                                    key={rider.userId}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRiderDetailTarget({
                                        rider,
                                        currentDriver: { userId: driver.userId, name: driver.profile.full_name },
                                      });
                                    }}
                                    className="flex w-full items-center gap-2.5 py-1.5 text-left transition-colors hover:bg-secondary/30 rounded-md -mx-1 px-1"
                                  >
                                    <Avatar size="sm">
                                      {rider.profile.avatar_url && (
                                        <AvatarImage
                                          src={rider.profile.avatar_url}
                                          alt={rider.profile.full_name}
                                        />
                                      )}
                                      <AvatarFallback>
                                        {getInitials(rider.profile.full_name)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs">
                                        {rider.profile.full_name}
                                      </p>
                                      <p className="truncate text-[11px] text-muted-foreground">
                                        {formatPhone(rider.profile.phone_number)}
                                        {rider.departureTime && (
                                          <>
                                            <span className="mx-0.5">·</span>
                                            <span className={cn(driver.departureTime && rider.departureTime > driver.departureTime && "text-destructive font-medium")}>
                                              {driver.departureTime && rider.departureTime > driver.departureTime && <HugeiconsIcon icon={AlertCircleIcon} className="size-3 inline-block align-[-2px] mr-0.5" strokeWidth={2} />}
                                              {formatDepartureTime(rider.departureTime)}
                                            </span>
                                          </>
                                        )}
                                      </p>
                                      {rider.pickupAddress && (
                                        <p className="truncate text-[11px] text-muted-foreground">
                                          {stripStateZip(rider.pickupAddress)}
                                        </p>
                                      )}
                                      {rider.note && (
                                        <p className="truncate text-[11px] text-muted-foreground italic">
                                          {rider.note}
                                        </p>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                            {driver.availableSeats > 0 && driver.assignedRiders.length < driver.availableSeats && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddRiderTarget({
                                    driverId: driver.userId,
                                    driverName: driver.profile.full_name,
                                    availableSeats: driver.availableSeats,
                                    currentRiderCount: driver.assignedRiders.length,
                                    driverLat: driver.pickupLat,
                                    driverLng: driver.pickupLng,
                                    assignedRiderCoords: driver.assignedRiders
                                      .filter((r) => r.pickupLat != null && r.pickupLng != null)
                                      .map((r) => ({ lat: r.pickupLat!, lng: r.pickupLng! })),
                                  });
                                }}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 py-1.5 mt-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                              >
                                <HugeiconsIcon icon={UserAdd01Icon} className="size-3.5" strokeWidth={1.5} />
                                Add rider
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollReveal>
                );
              })
            )
          ) : (
            filteredRiders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No riders found</p>
            ) : (
              filteredRiders.map((rider) => {
                const assignedDriver = riderDriverMap.get(rider.userId);
                return (
                  <ScrollReveal key={rider.userId} scrollRoot={scrollRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setRiderDetailTarget({
                          rider: { userId: rider.userId, profile: rider.profile, departureTime: null, pickupAddress: null, pickupLat: rider.pickupLat ?? null, pickupLng: rider.pickupLng ?? null, note: null },
                          currentDriver: assignedDriver
                            ? { userId: assignedDriver.driverId, name: assignedDriver.driverName }
                            : null,
                        });
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-secondary/30",
                        !rider.assigned && "border-destructive/30 bg-destructive/5"
                      )}
                    >
                      <Avatar size="sm">
                        {rider.profile.avatar_url && (
                          <AvatarImage
                            src={rider.profile.avatar_url}
                            alt={rider.profile.full_name}
                          />
                        )}
                        <AvatarFallback>
                          {getInitials(rider.profile.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {rider.profile.full_name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {formatPhone(rider.profile.phone_number)}
                        </p>
                      </div>
                      {rider.assigned ? (
                        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                          {assignedDriver?.driverName.split(" ")[0] ?? "Assigned"}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-medium text-destructive">
                          Unassigned
                        </span>
                      )}
                    </button>
                  </ScrollReveal>
                );
              })
            )
          )}
        </div>
        </div>

        {/* Bottom scroll indicator — absolute so it doesn't steal scroll height */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-24 z-10 flex justify-center pointer-events-none transition-opacity duration-200",
            canScrollDown ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="text-[10px] tracking-[0.25em] text-muted-foreground/50">•••</span>
        </div>
      </div>

      {/* Rider selection overlay */}
      <RiderSelectionOverlay
        open={addRiderTarget !== null}
        onClose={() => setAddRiderTarget(null)}
        onSelect={handleAddRiders}
        riders={overlayRiders}
        showOnlyUnassigned={showOnlyUnassigned}
        onToggleFilter={setShowOnlyUnassigned}
        targetDriverName={addRiderTarget?.driverName ?? ""}
        remainingSeats={addRiderTarget ? addRiderTarget.availableSeats - addRiderTarget.currentRiderCount : 0}
        driverLat={addRiderTarget?.driverLat ?? null}
        driverLng={addRiderTarget?.driverLng ?? null}
        assignedRiderCoords={addRiderTarget?.assignedRiderCoords ?? []}
        eventCoords={eventCoords}
      />

      {/* Rider detail overlay */}
      <RiderDetailOverlay
        open={riderDetailTarget !== null}
        onClose={() => setRiderDetailTarget(null)}
        rider={riderDetailTarget?.rider ?? null}
        currentDriver={riderDetailTarget?.currentDriver ?? null}
        drivers={drivers}
        rideHistory={rideHistory}
        onRemove={handleRemoveRider}
        onReassign={handleReassignRider}
        eventCoords={eventCoords}
      />

      {/* Send confirmation overlay */}
      <SendConfirmOverlay
        open={showSendConfirm}
        onClose={() => setShowSendConfirm(false)}
        onConfirm={handleSend}
        isUpdate={sentAt !== null}
        unassignedRiders={unassignedRiders}
        sending={sending}
        drivers={drivers}
        eventCoords={eventCoords}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rider selection overlay                                           */
/* ------------------------------------------------------------------ */

interface OverlayRider {
  userId: string;
  profile: ProfileData;
  assignedTo: { driverId: string; driverName: string } | null;
  pickupLat: number | null;
  pickupLng: number | null;
}

function RiderSelectionOverlay({
  open,
  onClose,
  onSelect,
  riders,
  showOnlyUnassigned,
  onToggleFilter,
  targetDriverName,
  remainingSeats,
  driverLat,
  driverLng,
  assignedRiderCoords,
  eventCoords,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (riderIds: string[]) => void;
  riders: OverlayRider[];
  showOnlyUnassigned: boolean;
  onToggleFilter: (value: boolean) => void;
  targetDriverName: string;
  remainingSeats: number;
  driverLat: number | null;
  driverLng: number | null;
  assignedRiderCoords: Array<{ lat: number; lng: number }>;
  eventCoords: { lat: number; lng: number } | null;
}): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(new Set());

  // Every selected rider needs a seat on this driver (including swaps from other drivers)
  const atCapacity = selectedRiderIds.size >= remainingSeats;

  function toggleRider(riderId: string): void {
    setSelectedRiderIds((prev) => {
      const next = new Set(prev);
      if (next.has(riderId)) {
        next.delete(riderId);
      } else {
        // Check if adding this rider would exceed capacity
        if (next.size < remainingSeats) {
          next.add(riderId);
        }
      }
      return next;
    });
  }

  useEffect(() => {
    if (open) {
      setMounted(true);
      setSelectedRiderIds(new Set());
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Estimate detour times — recalculates when selection changes
  const detourMinutes = useMemo(() => {
    if (!open || !driverLat || !driverLng) return new Map<string, number>();
    const ridersWithCoords = riders.filter((r) => r.pickupLat != null && r.pickupLng != null);
    if (ridersWithCoords.length === 0) return new Map<string, number>();

    // Build list of pickup points: driver + already-selected riders
    const pickupPoints: Array<{ lat: number; lng: number }> = [{ lat: driverLat, lng: driverLng }];
    for (const id of selectedRiderIds) {
      const r = ridersWithCoords.find((r) => r.userId === id);
      if (r) pickupPoints.push({ lat: r.pickupLat!, lng: r.pickupLng! });
    }

    const results = new Map<string, number>();
    for (const rider of ridersWithCoords) {
      const riderLoc = { lat: rider.pickupLat!, lng: rider.pickupLng! };
      let minKm = Infinity;
      for (const pt of pickupPoints) {
        const km = haversineKm(pt, riderLoc);
        if (km < minKm) minKm = km;
      }
      const detourMin = Math.round((minKm * ROAD_FACTOR / AVG_SPEED_KMH) * 60);
      results.set(rider.userId, detourMin);
    }

    return results;
  }, [open, driverLat, driverLng, riders, selectedRiderIds]);

  // Current route time for already-assigned riders → event
  const currentRouteMin = useMemo(() => {
    if (!driverLat || !driverLng) return 0;
    if (assignedRiderCoords.length === 0 && !eventCoords) return 0;
    return nnRoute(driverLat, driverLng, assignedRiderCoords, eventCoords).minutes;
  }, [driverLat, driverLng, assignedRiderCoords, eventCoords]);

  // Total estimated route time for assigned + selected riders → event
  const totalRouteMin = useMemo(() => {
    if (!driverLat || !driverLng || selectedRiderIds.size === 0) return 0;

    const selectedCoords: Array<{ lat: number; lng: number }> = [];
    for (const id of selectedRiderIds) {
      const r = riders.find((r) => r.userId === id);
      if (r?.pickupLat != null && r?.pickupLng != null) {
        selectedCoords.push({ lat: r.pickupLat, lng: r.pickupLng });
      }
    }
    if (selectedCoords.length === 0) return 0;

    const allCoords = [...assignedRiderCoords, ...selectedCoords];
    return nnRoute(driverLat, driverLng, allCoords, eventCoords).minutes;
  }, [driverLat, driverLng, riders, selectedRiderIds, assignedRiderCoords, eventCoords]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-60" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/80 transition-opacity duration-100 supports-backdrop-filter:backdrop-blur-xs",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-100",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <div className="pointer-events-auto w-full max-w-[calc(100%-2rem)] sm:max-w-sm rounded-4xl bg-popover p-6 ring-1 ring-foreground/5">
          {/* Title */}
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Add rider to {targetDriverName}
          </p>

          {/* All / Unassigned toggle */}
          <div className="flex rounded-lg bg-secondary/50 p-0.5 mb-4">
            <button
              type="button"
              onClick={() => onToggleFilter(true)}
              className={cn(
                "inline-flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                showOnlyUnassigned
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Unassigned
            </button>
            <button
              type="button"
              onClick={() => onToggleFilter(false)}
              className={cn(
                "inline-flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                !showOnlyUnassigned
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All riders
            </button>
          </div>

          {/* Rider list */}
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-1 scrollbar-none">
            {riders.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No riders available
              </p>
            ) : (
              riders.map((rider) => {
                const isSelected = selectedRiderIds.has(rider.userId);
                const isSwap = rider.assignedTo !== null;
                const wouldExceed = !isSelected && atCapacity;
                const detour = detourMinutes.get(rider.userId);
                return (
                  <button
                    key={rider.userId}
                    type="button"
                    onClick={() => toggleRider(rider.userId)}
                    disabled={wouldExceed}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : wouldExceed
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-secondary/40"
                    )}
                  >
                    <Avatar size="sm">
                      {rider.profile.avatar_url && (
                        <AvatarImage
                          src={rider.profile.avatar_url}
                          alt={rider.profile.full_name}
                        />
                      )}
                      <AvatarFallback>
                        {getInitials(rider.profile.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {rider.profile.full_name}
                      </p>
                      <p className={cn(
                        "truncate text-[11px]",
                        rider.assignedTo ? "text-muted-foreground" : "text-destructive"
                      )}>
                        {rider.assignedTo
                          ? rider.assignedTo.driverName
                          : "Unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {detour != null ? (
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          detour <= 5
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : detour <= 15
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-destructive/10 text-destructive"
                        )}>
                          ~{detour} min
                        </span>
                      ) : null}

                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Route time estimate */}
          {selectedRiderIds.size === 0 && currentRouteMin > 0 && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Current route: ~{currentRouteMin} min
            </p>
          )}
          {selectedRiderIds.size > 0 && totalRouteMin > 0 && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Est. total route: ~{totalRouteMin} min
            </p>
          )}

          {/* Action buttons */}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-4xl border border-input bg-input/30 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-input/50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedRiderIds.size === 0}
              onClick={() => {
                if (selectedRiderIds.size > 0) onSelect(Array.from(selectedRiderIds));
              }}
              className={cn(
                "flex-1 rounded-4xl px-4 py-2.5 text-sm font-medium transition-colors",
                selectedRiderIds.size > 0
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-input bg-input/30 text-muted-foreground cursor-not-allowed"
              )}
            >
              {selectedRiderIds.size > 0
                ? `Assign${selectedRiderIds.size > 1 ? ` (${selectedRiderIds.size})` : ""}`
                : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/*  Rider detail overlay                                              */
/* ------------------------------------------------------------------ */

function RiderDetailOverlay({
  open,
  onClose,
  rider,
  currentDriver,
  drivers,
  rideHistory,
  onRemove,
  onReassign,
  eventCoords,
}: {
  open: boolean;
  onClose: () => void;
  rider: RiderEntry | null;
  currentDriver: { userId: string; name: string } | null;
  drivers: DriverEntry[];
  rideHistory: Map<string, number>;
  onRemove: (riderId: string) => void;
  onReassign: (riderId: string, driverId: string) => void;
  eventCoords: { lat: number; lng: number } | null;
}): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [replaceRiderId, setReplaceRiderId] = useState<string | null>(null);
  const [removeMode, setRemoveMode] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setSelectedDriverId(null);
      setReplaceRiderId(null);
      setRemoveMode(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Exclude the current driver from the reassignment list (show all if unassigned)
  const availableDrivers = useMemo(() => {
    return currentDriver
      ? drivers.filter((d) => d.userId !== currentDriver.userId)
      : drivers;
  }, [drivers, currentDriver]);

  const selectedDriver = selectedDriverId
    ? availableDrivers.find((d) => d.userId === selectedDriverId) ?? null
    : null;
  const isSelectedDriverFull = selectedDriver
    ? selectedDriver.assignedRiders.length >= selectedDriver.availableSeats && selectedDriver.availableSeats > 0
    : false;

  // Compute added time per driver if this rider is added to their route
  const addedTimePerDriver = useMemo(() => {
    const results = new Map<string, number>();
    if (!rider || rider.pickupLat == null || rider.pickupLng == null) return results;
    for (const driver of availableDrivers) {
      if (driver.pickupLat == null || driver.pickupLng == null) continue;
      const existingCoords = driver.assignedRiders
        .filter((r) => r.pickupLat != null && r.pickupLng != null)
        .map((r) => ({ lat: r.pickupLat!, lng: r.pickupLng! }));
      const current = nnRoute(driver.pickupLat, driver.pickupLng, existingCoords, eventCoords);
      const withRider = nnRoute(driver.pickupLat, driver.pickupLng, [...existingCoords, { lat: rider.pickupLat, lng: rider.pickupLng }], eventCoords);
      results.set(driver.userId, withRider.minutes - current.minutes);
    }
    return results;
  }, [rider, availableDrivers, eventCoords]);

  // Compute total route time for the selected driver (with this rider added)
  const selectedDriverTotalMin = useMemo(() => {
    if (!selectedDriver || !rider || selectedDriver.pickupLat == null || selectedDriver.pickupLng == null) return null;
    const existingCoords = selectedDriver.assignedRiders
      .filter((r) => r.pickupLat != null && r.pickupLng != null)
      .map((r) => ({ lat: r.pickupLat!, lng: r.pickupLng! }));
    const riderCoord = rider.pickupLat != null && rider.pickupLng != null
      ? [{ lat: rider.pickupLat, lng: rider.pickupLng }]
      : [];
    // If replacing, remove the replaced rider's coords
    const filteredCoords = replaceRiderId
      ? existingCoords.filter((_, i) => selectedDriver.assignedRiders.filter((r) => r.pickupLat != null && r.pickupLng != null)[i]?.userId !== replaceRiderId)
      : existingCoords;
    return nnRoute(selectedDriver.pickupLat, selectedDriver.pickupLng, [...filteredCoords, ...riderCoord], eventCoords).minutes;
  }, [selectedDriver, rider, replaceRiderId, eventCoords]);

  // Compute time diff for replacing each existing rider in the selected driver's car
  const replaceTimeDiffs = useMemo(() => {
    const results = new Map<string, number>();
    if (!selectedDriver || !rider || selectedDriver.pickupLat == null || selectedDriver.pickupLng == null) return results;
    if (rider.pickupLat == null || rider.pickupLng == null) return results;

    const allRiders = selectedDriver.assignedRiders.filter((r) => r.pickupLat != null && r.pickupLng != null);
    const allCoords = allRiders.map((r) => ({ lat: r.pickupLat!, lng: r.pickupLng! }));
    const currentMin = nnRoute(selectedDriver.pickupLat, selectedDriver.pickupLng, allCoords, eventCoords).minutes;

    for (const existingRider of allRiders) {
      // Replace this rider's coords with the new rider's coords
      const swappedCoords = allCoords
        .filter((_, i) => allRiders[i].userId !== existingRider.userId)
        .concat({ lat: rider.pickupLat, lng: rider.pickupLng });
      const swappedMin = nnRoute(selectedDriver.pickupLat, selectedDriver.pickupLng, swappedCoords, eventCoords).minutes;
      results.set(existingRider.userId, swappedMin - currentMin);
    }
    return results;
  }, [selectedDriver, rider, eventCoords]);

  if (!mounted || !rider) return null;

  function handleDriverTap(driverId: string): void {
    setSelectedDriverId((prev) => (prev === driverId ? null : driverId));
    setReplaceRiderId(null);
  }

  return createPortal(
    <div className="fixed inset-0 z-60" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/80 transition-opacity duration-100 supports-backdrop-filter:backdrop-blur-xs",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-100",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <div className="pointer-events-auto relative w-full max-w-[calc(100%-2rem)] sm:max-w-sm rounded-4xl bg-popover p-6 ring-1 ring-foreground/5">
          {/* Remove toggle — top right (only for assigned riders) */}
          {currentDriver && (
            <button
              type="button"
              onClick={() => {
                setRemoveMode((prev) => !prev);
                setSelectedDriverId(null);
                setReplaceRiderId(null);
              }}
              className={cn(
                "absolute top-5 right-5 flex items-center gap-1 rounded-4xl border px-3 py-1.5 text-[11px] font-medium transition-colors",
                removeMode
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-input bg-input/30 text-muted-foreground hover:bg-input/50"
              )}
            >
              <HugeiconsIcon icon={UserRemove01Icon} size={13} strokeWidth={1.5} />
              Remove
            </button>
          )}

          {/* Rider profile header */}
          <div className="flex items-center gap-3 mb-1">
            <Avatar>
              {rider.profile.avatar_url && (
                <AvatarImage src={rider.profile.avatar_url} alt={rider.profile.full_name} />
              )}
              <AvatarFallback>{getInitials(rider.profile.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{rider.profile.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatPhone(rider.profile.phone_number)}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            {currentDriver
              ? <>Currently with <span className="font-medium text-foreground">{currentDriver.name}</span></>
              : <span className="font-medium text-destructive">Unassigned</span>}
          </p>

          {/* Assign / Reassign section */}
          <p className={cn("text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 transition-opacity duration-200", removeMode && "opacity-40")}>
            {currentDriver ? "Reassign to" : "Assign to"}
          </p>

          <div className={cn("max-h-[50vh] overflow-y-auto -mx-2 px-2 py-1 space-y-1 scrollbar-none transition-opacity duration-200", removeMode && "opacity-40 pointer-events-none")}>
            {availableDrivers.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No other drivers available
              </p>
            ) : (
              availableDrivers.map((driver) => {
                const isSelected = selectedDriverId === driver.userId;
                const isHidden = selectedDriverId !== null && !isSelected;
                const rides = rideHistory.get(driver.userId) ?? 0;
                const isFull = driver.assignedRiders.length >= driver.availableSeats && driver.availableSeats > 0;

                return (
                  <div
                    key={driver.userId}
                    className={cn(
                      "rounded-lg border overflow-hidden transition-all duration-200 ease-out",
                      isSelected && "ring-1 ring-primary/30 bg-primary/5",
                      isHidden && "opacity-0 h-0 border-transparent m-0! p-0! pointer-events-none",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleDriverTap(driver.userId)}
                      className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-secondary/30"
                    >
                      <Avatar size="sm">
                        {driver.profile.avatar_url && (
                          <AvatarImage src={driver.profile.avatar_url} alt={driver.profile.full_name} />
                        )}
                        <AvatarFallback>{getInitials(driver.profile.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{driver.profile.full_name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(() => {
                          const added = addedTimePerDriver.get(driver.userId);
                          if (added == null) return null;
                          return (
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              added <= 5 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : added <= 15 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-destructive/10 text-destructive"
                            )}>
                              +{added} min
                            </span>
                          );
                        })()}
                        <span className={cn(
                          "flex items-center gap-1 text-xs text-muted-foreground",
                          isFull && "line-through"
                        )}>
                          <HugeiconsIcon icon={Car01Icon} className="size-3.5" strokeWidth={1.5} />
                          {driver.assignedRiders.length}/{driver.availableSeats}
                        </span>
                      </div>
                    </button>

                    {/* Detail: current riders + ride history */}
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200 ease-out",
                        isSelected ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="border-t bg-secondary/20 px-3 py-1.5">
                        {/* Ride history */}
                        <p className="text-[11px] text-muted-foreground py-1">
                          {rides > 0
                            ? `${driver.profile.full_name.split(" ")[0]} has given ${rider.profile.full_name.split(" ")[0]} a ride ${rides} time${rides !== 1 ? "s" : ""}`
                            : `No previous rides together`}
                        </p>

                        {/* Current riders */}
                        {driver.assignedRiders.length === 0 ? (
                          <p className="py-1 text-[11px] text-muted-foreground">
                            No riders assigned
                          </p>
                        ) : (
                          <div className="divide-y divide-border/50">
                            {driver.assignedRiders.map((r) => (
                              <button
                                type="button"
                                key={r.userId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReplaceRiderId((prev) => (prev === r.userId ? null : r.userId));
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 py-1.5 rounded-md px-1 -mx-1 text-left transition-colors",
                                  replaceRiderId === r.userId
                                    ? "bg-destructive/10 ring-1 ring-destructive/30"
                                    : "hover:bg-secondary/30"
                                )}
                              >
                                <Avatar size="sm">
                                  {r.profile.avatar_url && (
                                    <AvatarImage src={r.profile.avatar_url} alt={r.profile.full_name} />
                                  )}
                                  <AvatarFallback>{getInitials(r.profile.full_name)}</AvatarFallback>
                                </Avatar>
                                <p className="truncate text-xs flex-1">{r.profile.full_name}</p>
                                {(() => {
                                  const diff = replaceTimeDiffs.get(r.userId);
                                  if (diff == null) return null;
                                  return (
                                    <span className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
                                      diff <= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                        : diff <= 5 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                        : "bg-destructive/10 text-destructive"
                                    )}>
                                      {diff <= 0 ? `${diff} min` : `+${diff} min`}
                                    </span>
                                  );
                                })()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Total route time for selected driver */}
          {selectedDriverId && selectedDriverTotalMin != null && !removeMode && (
            <p className="text-xs text-muted-foreground mt-4 mb-1 text-center">
              Est. total route: <span className="font-medium text-foreground">~{selectedDriverTotalMin} min</span>
            </p>
          )}

          {/* Action buttons */}
          <div className={cn("flex gap-3", selectedDriverId && selectedDriverTotalMin != null && !removeMode ? "mt-2" : "mt-4")}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-4xl border border-input bg-input/30 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-input/50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!removeMode && (!selectedDriverId || (isSelectedDriverFull && !replaceRiderId))}
              onClick={() => {
                if (rider) {
                  if (removeMode) {
                    onRemove(rider.userId);
                  } else if (selectedDriverId) {
                    if (replaceRiderId) {
                      onRemove(replaceRiderId);
                      onReassign(rider.userId, selectedDriverId);
                    } else {
                      onReassign(rider.userId, selectedDriverId);
                    }
                  }
                }
              }}
              className={cn(
                "flex-1 rounded-4xl px-4 py-2.5 text-sm font-medium transition-colors",
                removeMode
                  ? "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : selectedDriverId && !(isSelectedDriverFull && !replaceRiderId)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-input bg-input/30 text-muted-foreground cursor-not-allowed"
              )}
            >
              {removeMode ? "Remove" : replaceRiderId ? "Replace" : currentDriver ? "Reassign" : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/*  Send confirmation overlay                                         */
/* ------------------------------------------------------------------ */

const ROUTE_COLORS = ["#4285F4", "#34A853", "#FBBC04", "#EA4335", "#FF6D01", "#46BDC6", "#7B1FA2", "#C2185B"];

/** Muted map style to match app design */
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "road.arterial", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "road.highway", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.local", stylers: [{ visibility: "simplified" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
];

/** Route.computeRoutes() — typed ahead of @types/google.maps */
interface RoutesAPIRoute {
  computeRoutes(request: {
    origin: google.maps.LatLng;
    destination: google.maps.LatLng;
    intermediates?: Array<{ location: google.maps.LatLng }>;
    travelMode?: string;
    fields?: string[];
  }): Promise<{ routes: Array<{ createPolylines(): google.maps.Polyline[] }> }>;
}

function SendConfirmOverlay({
  open,
  onClose,
  onConfirm,
  isUpdate,
  unassignedRiders,
  sending,
  drivers,
  eventCoords,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isUpdate: boolean;
  unassignedRiders: RiderEntry[];
  sending: boolean;
  drivers: DriverEntry[];
  eventCoords: { lat: number; lng: number } | null;
}): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Static route info per driver (markers, colors)
  const routeInfo = useMemo(() => {
    return drivers
      .filter((d) => d.pickupLat != null && d.pickupLng != null)
      .map((driver, i) => {
        const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
        const driverPos = { lat: driver.pickupLat!, lng: driver.pickupLng! };
        const riderPositions = driver.assignedRiders
          .filter((r) => r.pickupLat != null && r.pickupLng != null)
          .map((r) => ({ lat: r.pickupLat!, lng: r.pickupLng!, name: r.profile.full_name }));
        return { driverId: driver.userId, driverName: driver.profile.full_name, color, driverPos, riderPositions };
      });
  }, [drivers]);

  function svgIcon(svg: string, size: number): google.maps.Icon {
    return {
      url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2),
    };
  }

  // Create markers imperatively when the map instance is ready
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    // Clear previous markers
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];

    // Destination marker — dark pin with white inner ring
    if (eventCoords) {
      markersRef.current.push(new google.maps.Marker({
        map,
        position: eventCoords,
        title: "Destination",
        icon: svgIcon('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="#1a1a1a" stroke="white" stroke-width="3"/><circle cx="18" cy="18" r="5" fill="white"/></svg>', 36),
        zIndex: 1000,
      }));
    }

    // Driver + rider markers
    for (const route of routeInfo) {
      markersRef.current.push(new google.maps.Marker({
        map,
        position: route.driverPos,
        title: route.driverName,
        icon: svgIcon(`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="${route.color}" stroke="white" stroke-width="2.5"/><text x="15" y="20" text-anchor="middle" fill="white" font-size="14" font-weight="600" font-family="Figtree,system-ui,sans-serif">D</text></svg>`, 30),
        zIndex: 900,
      }));

      for (const r of route.riderPositions) {
        markersRef.current.push(new google.maps.Marker({
          map,
          position: r,
          title: r.name,
          icon: svgIcon(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" fill="${route.color}" stroke="white" stroke-width="2.5"/></svg>`, 22),
          zIndex: 800,
        }));
      }
    }

    // Unassigned riders — muted gray with dashed stroke
    for (const rider of unassignedRiders) {
      if (rider.pickupLat != null && rider.pickupLng != null) {
        markersRef.current.push(new google.maps.Marker({
          map,
          position: { lat: rider.pickupLat, lng: rider.pickupLng },
          title: `${rider.profile.full_name} (unassigned)`,
          icon: svgIcon('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" fill="#d4d4d4" stroke="#a3a3a3" stroke-width="2" stroke-dasharray="4 2"/></svg>', 22),
          zIndex: 700,
        }));
      }
    }

    return () => {
      for (const m of markersRef.current) m.setMap(null);
      markersRef.current = [];
    };
  }, [mapInstance, routeInfo, eventCoords, unassignedRiders]);

  // Fetch road-following routes using the Routes API
  useEffect(() => {
    const map = mapInstance;
    if (!map || !open || routeInfo.length === 0 || !eventCoords) return;
    let cancelled = false;

    async function fetchRoutes(): Promise<void> {
      const { Route } = (await google.maps.importLibrary("routes")) as unknown as { Route: RoutesAPIRoute };

      await Promise.all(
        routeInfo.map(async (route) => {
          const intermediates = route.riderPositions.map((r) => ({
            location: new google.maps.LatLng(r.lat, r.lng),
          }));
          try {
            const { routes: computed } = await Route.computeRoutes({
              origin: new google.maps.LatLng(route.driverPos.lat, route.driverPos.lng),
              destination: new google.maps.LatLng(eventCoords!.lat, eventCoords!.lng),
              intermediates,
              travelMode: "DRIVING" as google.maps.TravelMode,
              fields: ["path"],
            });
            if (!cancelled && computed[0]) {
              const polylines = computed[0].createPolylines();
              for (const p of polylines) {
                p.setOptions({ strokeColor: route.color, strokeOpacity: 0.8, strokeWeight: 3 });
                p.setMap(map);
                polylinesRef.current.push(p);
              }
            }
          } catch {
            // Fallback: straight line
            if (!cancelled) {
              const fallbackPath = [route.driverPos, ...route.riderPositions];
              if (eventCoords) fallbackPath.push(eventCoords);
              const p = new google.maps.Polyline({
                path: fallbackPath,
                strokeColor: route.color,
                strokeOpacity: 0.8,
                strokeWeight: 3,
                map,
              });
              polylinesRef.current.push(p);
            }
          }
        })
      );
    }
    fetchRoutes();

    return () => {
      cancelled = true;
      for (const p of polylinesRef.current) p.setMap(null);
      polylinesRef.current = [];
    };
  }, [mapInstance, open, routeInfo, eventCoords]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMapInstance(map);

    // Collect all pickup points (drivers + riders + unassigned)
    const points: google.maps.LatLngLiteral[] = [];
    for (const route of routeInfo) {
      points.push(route.driverPos);
      for (const r of route.riderPositions) points.push(r);
    }
    for (const rider of unassignedRiders) {
      if (rider.pickupLat != null && rider.pickupLng != null) {
        points.push({ lat: rider.pickupLat, lng: rider.pickupLng });
      }
    }

    if (points.length === 0) {
      if (eventCoords) map.setCenter(eventCoords);
      return;
    }

    // Find the densest cluster: for each point, count neighbors within ~4km
    const CLUSTER_RADIUS_KM = 4;
    let bestIdx = 0;
    let bestCount = 0;
    for (let i = 0; i < points.length; i++) {
      let count = 0;
      for (let j = 0; j < points.length; j++) {
        if (haversineKm(points[i], points[j]) <= CLUSTER_RADIUS_KM) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        bestIdx = i;
      }
    }

    // Build bounds from points in the densest cluster
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) {
      if (haversineKm(points[bestIdx], p) <= CLUSTER_RADIUS_KM) {
        bounds.extend(p);
      }
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 50);
  }, [routeInfo, eventCoords, unassignedRiders]);

  if (!mounted) return null;

  const hasUnassigned = unassignedRiders.length > 0;
  const center = eventCoords ?? { lat: 33.749, lng: -84.388 };

  return createPortal(
    <div className="fixed inset-0 z-60" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/80 transition-opacity duration-100 supports-backdrop-filter:backdrop-blur-xs",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center p-4 pointer-events-none transition-all duration-100",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <div className="pointer-events-auto flex flex-col w-full max-w-lg h-full rounded-3xl bg-popover ring-1 ring-foreground/5 overflow-hidden">
          {/* Map */}
          <div className="flex-1 min-h-0 rounded-t-3xl overflow-hidden">
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={center}
              zoom={10}
              onLoad={onMapLoad}
              options={{
                disableDefaultUI: true,
                zoomControl: true,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                styles: MAP_STYLES,
                backgroundColor: "#f5f5f5",
              }}
            />
          </div>

          {/* Bottom section */}
          <div className="flex-none p-5 space-y-3">
            <p className="text-sm font-semibold">
              {isUpdate ? "Send Update?" : "Send Carpool Assignments?"}
            </p>

            {hasUnassigned && (
              <div>
                <div className="flex items-center -space-x-2 mb-2">
                  {unassignedRiders.slice(0, 5).map((rider) => (
                    <Avatar key={rider.userId} size="sm" className="ring-2 ring-popover">
                      {rider.profile.avatar_url && (
                        <AvatarImage src={rider.profile.avatar_url} alt={rider.profile.full_name} />
                      )}
                      <AvatarFallback>{getInitials(rider.profile.full_name)}</AvatarFallback>
                    </Avatar>
                  ))}
                  {unassignedRiders.length > 5 && (
                    <div className="flex items-center justify-center size-8 rounded-full bg-secondary text-[10px] font-medium text-muted-foreground ring-2 ring-popover">
                      +{unassignedRiders.length - 5}
                    </div>
                  )}
                </div>
                <p className="text-xs text-destructive">
                  {unassignedRiders.length === 1
                    ? "There is 1 unassigned rider."
                    : `There are ${unassignedRiders.length} unassigned riders.`}
                </p>
              </div>
            )}

            {isUpdate && (
              <p className="text-xs text-muted-foreground">
                Only affected members will be notified.
              </p>
            )}

            {!hasUnassigned && !isUpdate && (
              <p className="text-xs text-muted-foreground">
                This will send assignments to all members.
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="flex-1 rounded-4xl border border-input bg-input/30 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-input/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={sending}
                className="flex-1 rounded-4xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <HugeiconsIcon icon={SentIcon} className="size-4 inline-block align-[-1px] mr-1" strokeWidth={1.5} />
                {sending ? "Sending…" : isUpdate ? "Send Update" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
