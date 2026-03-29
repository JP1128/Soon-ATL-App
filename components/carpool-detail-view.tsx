"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { triggerFluidWave, dismissFluidWave } from "@/components/ui/fluid-wave-loader";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps/constants";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPhoneNumber } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  Call02Icon,
  Copy01Icon,
  SentIcon,
  Tick02Icon,
  UndoIcon,
  Clock01Icon,
  Road01Icon,
  DragDropVerticalIcon,
  MapsIcon,
  Message01Icon,
  MessageMultiple01Icon,
  MoreVerticalIcon,
  Navigation03Icon,
} from "@hugeicons/core-free-icons";

/* ── Types ─────────────────────────────────────────────────────── */

interface RiderData {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone_number: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_address: string | null;
  return_lat: number | null;
  return_lng: number | null;
  return_address: string | null;
}

interface DriverData {
  full_name: string;
  avatar_url: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
}

interface CarpoolDetailViewProps {
  title: string;
  location: string;
  leg: "before" | "after";
  riders: RiderData[];
  driver: DriverData | null;
  isDriver: boolean;
  driverPickupLat: number | null;
  driverPickupLng: number | null;
  driverPickupAddress: string | null;
  returnLat: number | null;
  returnLng: number | null;
  returnAddress: string | null;
  carpoolId: string | null;
  carpoolsSentAt: string | null;
  pickupOrderSentAt: string | null;
  pickupOrderSentRiders: string[];
  onBack: () => void;
  onSent?: (sentRiders: string[]) => void;
}

/* ── Map styles ────────────────────────────────────────────────── */

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

/** Route.computeRoutes() typed */
interface ComputedRouteLeg {
  distanceMeters?: number;
  durationMillis?: number;
}

interface ComputedRoute {
  createPolylines(): google.maps.Polyline[];
  distanceMeters?: number;
  legs?: ComputedRouteLeg[];
}

interface RoutesAPIRoute {
  computeRoutes(request: {
    origin: google.maps.LatLng;
    destination: google.maps.LatLng;
    intermediates?: Array<{ location: google.maps.LatLng }>;
    travelMode?: string;
    fields?: string[];
  }): Promise<{ routes: ComputedRoute[] }>;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function svgIcon(svg: string, size: number): google.maps.Icon {
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

function createAvatarIcon(
  avatarUrl: string | null,
  name: string,
  size: number,
  borderColor: string,
): Promise<google.maps.Icon> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const s = size * 2; // retina
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext("2d")!;

    const drawFallback = (): void => {
      // Filled circle with initials
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
      ctx.fillStyle = borderColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.fillStyle = borderColor;
      ctx.font = `600 ${s * 0.35}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(getInitials(name), s / 2, s / 2 + 1);
      resolve({
        url: canvas.toDataURL(),
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(size / 2, size / 2),
      });
    };

    if (!avatarUrl) {
      drawFallback();
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = (): void => {
      // Border circle
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
      ctx.fillStyle = borderColor;
      ctx.fill();
      // Clip to inner circle
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 4, 4, s - 8, s - 8);
      resolve({
        url: canvas.toDataURL(),
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(size / 2, size / 2),
      });
    };
    img.onerror = drawFallback;
    img.src = avatarUrl;
  });
}

function stripStateZip(address: string): string {
  return address
    .replace(/,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?,?\s*(USA|US)?$/i, "")
    .replace(/,\s*$/, "");
}

/* ── Sortable rider item ───────────────────────────────────────── */

function SortableRiderItem({
  rider,
  index,
  leg,
  isChanged,
  legDurationMin,
  cumulativeMin,
}: {
  rider: RiderData;
  index: number;
  leg: "before" | "after";
  isChanged: boolean;
  legDurationMin: number | null;
  cumulativeMin: number | null;
}): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rider.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };

  const addr = leg === "before" ? rider.pickup_address : rider.return_address;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg px-2 py-2 ${
        isDragging ? "bg-secondary shadow-sm" : ""
      }`}
    >
      <DropdownMenu>
        <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer rounded-md -mx-1 px-1 transition-colors hover:bg-secondary/60">
            <Avatar size="sm">
              {rider.avatar_url && <AvatarImage src={rider.avatar_url} />}
              <AvatarFallback>{getInitials(rider.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium leading-tight">{rider.full_name}</p>
                {isChanged && <span className="size-1.5 rounded-full bg-foreground shrink-0" />}
              </div>
              {rider.phone_number && (
                <p className="text-[11px] text-muted-foreground">
                  {formatPhoneNumber(rider.phone_number)}
                </p>
              )}
              {addr && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {stripStateZip(addr)}
                </p>
              )}
              {legDurationMin != null && cumulativeMin != null && (
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{legDurationMin} min from prev</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>ETA {new Date(Date.now() + cumulativeMin * 60000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                </div>
              )}
            </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-0 w-auto">
          <DropdownMenuItem
            disabled={!rider.phone_number}
            onClick={() => { if (rider.phone_number) window.open(`sms:${rider.phone_number}`, "_self"); }}
          >
            <HugeiconsIcon icon={Message01Icon} className="size-4" strokeWidth={1.5} />
            Message
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!rider.phone_number}
            onClick={() => { if (rider.phone_number) window.open(`tel:${rider.phone_number}`, "_self"); }}
          >
            <HugeiconsIcon icon={Call02Icon} className="size-4" strokeWidth={1.5} />
            Call
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!addr}
            onClick={() => { if (addr) navigator.clipboard.writeText(addr); }}
          >
            <HugeiconsIcon icon={Copy01Icon} className="size-4" strokeWidth={1.5} />
            Copy Address
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        {...attributes}
        {...listeners}
        className="touch-none rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

/* ── Component ─────────────────────────────────────────────────── */

export function CarpoolDetailView({
  title,
  location,
  leg,
  riders: initialRiders,
  driver,
  isDriver,
  driverPickupLat,
  driverPickupLng,
  driverPickupAddress,
  returnLat,
  returnLng,
  returnAddress,
  carpoolId,
  carpoolsSentAt,
  pickupOrderSentAt: initialPickupOrderSentAt,
  pickupOrderSentRiders: initialPickupOrderSentRiders,
  onBack,
  onSent,
}: CarpoolDetailViewProps): React.ReactElement {
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: "weekly",
  });

  const [riders, setRiders] = useState(initialRiders ?? []);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [eventCoords, setEventCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOrder, setSavedOrder] = useState(() => (initialRiders ?? []).map((r) => r.id));
  const orderChanged = useMemo(() => {
    const currentIds = riders.map((r) => r.id);
    return currentIds.some((id, i) => id !== savedOrder[i]);
  }, [riders, savedOrder]);
  const [sentRiders, setSentRiders] = useState(new Set<string>(initialPickupOrderSentRiders));
  const [lastSentAt, setLastSentAt] = useState<string | null>(initialPickupOrderSentAt);
  const hasNewOrRemovedRiders = useMemo(() => {
    const currentIds = riders.map((r) => r.id);
    if (currentIds.length !== sentRiders.size) return true;
    return currentIds.some((id) => !sentRiders.has(id));
  }, [riders, sentRiders]);
  const changedRiderIds = useMemo(() => {
    // If riders were added or removed, mark ALL riders as changed
    if (hasNewOrRemovedRiders) {
      return new Set(riders.map((r) => r.id));
    }
    // Otherwise, only mark riders whose position changed
    const changed = new Set<string>();
    const saved = savedOrder;
    riders.forEach((r, i) => {
      if (saved[i] !== r.id) changed.add(r.id);
    });
    return changed;
  }, [riders, hasNewOrRemovedRiders, savedOrder]);
  const needsSend = orderChanged || hasNewOrRemovedRiders;
  const [routeInfo, setRouteInfo] = useState<{ distanceMiles: number; durationMin: number; legDurationsMin: number[] } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  // Sync local state when props change (e.g. from realtime refresh)
  const ridersKey = (initialRiders ?? []).map((r) => r.id).join(",");
  useEffect(() => {
    const incoming = initialRiders ?? [];
    setRiders(incoming);
    setSavedOrder(incoming.map((r) => r.id));
  }, [ridersKey]);

  const sentRidersKey = initialPickupOrderSentRiders.join(",");
  useEffect(() => {
    setSentRiders(new Set<string>(initialPickupOrderSentRiders));
  }, [sentRidersKey]);

  useEffect(() => {
    setLastSentAt(initialPickupOrderSentAt);
  }, [initialPickupOrderSentAt]);

  // Geocode event location
  useEffect(() => {
    if (!mapsLoaded || !location) return;
    const geocoder = new google.maps.Geocoder();
    let cancelled = false;
    geocoder.geocode({ address: location }, (results, status) => {
      if (cancelled || status !== "OK" || !results?.[0]) return;
      const loc = results[0].geometry.location;
      setEventCoords({ lat: loc.lat(), lng: loc.lng() });
    });
    return (): void => {
      cancelled = true;
    };
  }, [mapsLoaded, location]);

  // Derive route positions based on leg
  const routeData = useMemo(() => {
    const driverPos =
      driverPickupLat != null && driverPickupLng != null
        ? { lat: driverPickupLat, lng: driverPickupLng }
        : null;

    const riderPositions = riders
      .map((r) => {
        const lat = leg === "before" ? r.pickup_lat : r.return_lat;
        const lng = leg === "before" ? r.pickup_lng : r.return_lng;
        if (lat == null || lng == null) return null;
        return { lat, lng, id: r.id, name: r.full_name, avatar_url: r.avatar_url };
      })
      .filter((p): p is NonNullable<typeof p> => !!p);

    // Before: driver → riders → event
    // After: event → riders → driver return
    let origin: { lat: number; lng: number } | null;
    let destination: { lat: number; lng: number } | null;

    if (leg === "before") {
      origin = driverPos;
      destination = eventCoords;
    } else {
      origin = eventCoords;
      destination =
        returnLat != null && returnLng != null
          ? { lat: returnLat, lng: returnLng }
          : driverPos;
    }

    return { driverPos, riderPositions, origin, destination };
  }, [riders, driverPickupLat, driverPickupLng, returnLat, returnLng, eventCoords, leg]);

  // Create/update markers
  useEffect(() => {
    const map = mapInstance;
    if (!map || !mapsLoaded) return;

    // Clear previous
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];

    let cancelled = false;

    async function createMarkers(): Promise<void> {
      if (!map || cancelled) return;

      // Destination marker
      if (eventCoords) {
        markersRef.current.push(
          new google.maps.Marker({
            map,
            position: eventCoords,
            title: "Destination",
            icon: svgIcon(
              '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="#1a1a1a" stroke="white" stroke-width="3"/><circle cx="18" cy="18" r="5" fill="white"/></svg>',
              36,
            ),
            zIndex: 1000,
          }),
        );
      }

      // Driver marker
      if (routeData.driverPos) {
        const driverAvatarUrl = isDriver ? null : driver?.avatar_url ?? null;
        const driverName = isDriver ? "You" : driver?.full_name ?? "Driver";
        const icon = await createAvatarIcon(driverAvatarUrl, driverName, 36, "#4285F4");
        if (cancelled) return;
        markersRef.current.push(
          new google.maps.Marker({
            map,
            position: routeData.driverPos,
            title: driverName,
            icon,
            zIndex: 900,
          }),
        );
      }

      // Rider markers
      for (const r of routeData.riderPositions) {
        const icon = await createAvatarIcon(r.avatar_url, r.name, 32, "#34A853");
        if (cancelled) return;
        markersRef.current.push(
          new google.maps.Marker({
            map,
            position: { lat: r.lat, lng: r.lng },
            title: r.name,
            icon,
            zIndex: 800,
          }),
        );
      }
    }

    createMarkers();

    return (): void => {
      cancelled = true;
      for (const m of markersRef.current) m.setMap(null);
      markersRef.current = [];
    };
  }, [mapInstance, mapsLoaded, routeData, eventCoords, driver, isDriver]);

  // Draw route polylines + get distance/duration via Routes API
  useEffect(() => {
    const map = mapInstance;
    if (!map || !mapsLoaded || !routeData.origin || !routeData.destination) return;
    let cancelled = false;

    // Clear previous polylines
    for (const p of polylinesRef.current) p.setMap(null);
    polylinesRef.current = [];
    setRouteLoading(true);

    async function fetchRoute(): Promise<void> {
      if (!map || cancelled || !routeData.origin || !routeData.destination) return;

      const intermediates = routeData.riderPositions.map((r) => ({
        location: new google.maps.LatLng(r.lat, r.lng),
      }));

      try {
        const { Route } = (await google.maps.importLibrary("routes")) as unknown as { Route: RoutesAPIRoute };

        const { routes: computed } = await Route.computeRoutes({
          origin: new google.maps.LatLng(routeData.origin.lat, routeData.origin.lng),
          destination: new google.maps.LatLng(routeData.destination.lat, routeData.destination.lng),
          intermediates,
          travelMode: "DRIVING" as google.maps.TravelMode,
          fields: ["path", "distanceMeters", "legs"],
        });

        if (cancelled) return;

        if (computed[0]) {
          // Draw polyline
          const polylines = computed[0].createPolylines();
          for (const p of polylines) {
            p.setOptions({ strokeColor: "#4285F4", strokeOpacity: 0.8, strokeWeight: 4 });
            p.setMap(map);
            polylinesRef.current.push(p);
          }

          // Extract distance and duration
          const route = computed[0];
          const distanceMeters = route.distanceMeters;
          const legs = route.legs ?? [];
          const totalDurationMillis = legs.reduce((sum, l) => sum + (l.durationMillis ?? 0), 0);
          const legDurationsMin = legs.map((l) => Math.round((l.durationMillis ?? 0) / 60000));
          if (distanceMeters != null && totalDurationMillis > 0) {
            setRouteInfo({
              distanceMiles: Math.round((distanceMeters / 1609.344) * 10) / 10,
              durationMin: Math.round(totalDurationMillis / 60000),
              legDurationsMin,
            });
          }
        }
      } catch (err) {
        console.error("[Routes API] computeRoutes failed:", err);
        // Fallback: straight lines
        if (!cancelled) {
          const path = [routeData.origin!, ...routeData.riderPositions, routeData.destination!];
          const p = new google.maps.Polyline({
            path,
            strokeColor: "#4285F4",
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map,
          });
          polylinesRef.current.push(p);
        }
      }
      if (!cancelled) setRouteLoading(false);
    }

    fetchRoute();

    return (): void => {
      cancelled = true;
      for (const p of polylinesRef.current) p.setMap(null);
      polylinesRef.current = [];
    };
  }, [mapInstance, mapsLoaded, routeData]);

  // Fit bounds on map load
  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      setMapInstance(map);

      const points: google.maps.LatLngLiteral[] = [];
      if (routeData.driverPos) points.push(routeData.driverPos);
      for (const r of routeData.riderPositions) points.push({ lat: r.lat, lng: r.lng });
      if (eventCoords) points.push(eventCoords);

      if (points.length === 0) {
        if (eventCoords) map.setCenter(eventCoords);
        return;
      }

      const bounds = new google.maps.LatLngBounds();
      for (const p of points) bounds.extend(p);
      if (!bounds.isEmpty()) map.fitBounds(bounds, 50);
    },
    [routeData, eventCoords],
  );

  // Reorder rider via drag-and-drop
  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = riders.findIndex((r) => r.id === active.id);
    const newIndex = riders.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setRiders(arrayMove(riders, oldIndex, newIndex));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  // Save pickup order
  const handleSend = async (): Promise<void> => {
    if (!carpoolId || !needsSend) return;
    setSaving(true);
    triggerFluidWave();
    try {
      const res = await fetch(`/api/events/carpool-order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carpoolId,
          riderOrder: riders.map((r) => r.id),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Failed to save pickup order:", res.status, data);
        return;
      }
      const result = await res.json() as { pickup_order_sent_at: string; pickup_order_sent_riders: string[] };
      setSavedOrder(riders.map((r) => r.id));
      setSentRiders(new Set(result.pickup_order_sent_riders));
      setLastSentAt(result.pickup_order_sent_at);
      onSent?.(result.pickup_order_sent_riders);
    } catch (err) {
      console.error("Failed to save pickup order:", err);
    } finally {
      setSaving(false);
      dismissFluidWave();
    }
  };

  const handleRevert = (): void => {
    const original = savedOrder;
    const reordered = original.map((id) => riders.find((r) => r.id === id)).filter((r): r is RiderData => !!r);
    setRiders(reordered);
  };

  const legLabel = leg === "before" ? `Before ${title}` : `After ${title}`;
  const center = eventCoords ?? { lat: 33.749, lng: -84.388 };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <button
          onClick={onBack}
          className="flex size-8 items-center justify-center rounded-full hover:bg-secondary active:bg-secondary/80 transition-colors"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
        </button>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {legLabel}
        </p>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary">
              <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" strokeWidth={1.5} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="min-w-0 w-auto">
              <DropdownMenuItem
                onClick={() => {
                  const waypoints = riders
                    .map((r) => leg === "before" ? r.pickup_address : r.return_address)
                    .filter((a): a is string => !!a);
                  const origin = leg === "before"
                    ? (driverPickupAddress ?? (driverPickupLat && driverPickupLng ? `${driverPickupLat},${driverPickupLng}` : null))
                    : location;
                  const dest = leg === "before"
                    ? location
                    : (returnAddress ?? driverPickupAddress ?? (driverPickupLat && driverPickupLng ? `${driverPickupLat},${driverPickupLng}` : null));
                  const params = new URLSearchParams({ api: "1" });
                  if (origin) params.set("origin", origin);
                  if (dest) params.set("destination", dest);
                  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
                  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
                }}
              >
                <HugeiconsIcon icon={MapsIcon} className="size-4" strokeWidth={1.5} />
                Open in Maps
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const phones = riders
                    .map((r) => r.phone_number)
                    .filter((p): p is string => !!p);
                  if (phones.length === 0) return;
                  window.open(`sms:${phones.join(",")}`, "_self");
                }}
                disabled={!riders.some((r) => r.phone_number)}
              >
                <HugeiconsIcon icon={MessageMultiple01Icon} className="size-4" strokeWidth={1.5} />
                Group Chat
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const waypoints = riders
                    .map((r) => leg === "before" ? r.pickup_address : r.return_address)
                    .filter((a): a is string => !!a);
                  const origin = leg === "before"
                    ? (driverPickupAddress ?? (driverPickupLat && driverPickupLng ? `${driverPickupLat},${driverPickupLng}` : null))
                    : location;
                  const dest = leg === "before"
                    ? location
                    : (returnAddress ?? driverPickupAddress ?? (driverPickupLat && driverPickupLng ? `${driverPickupLat},${driverPickupLng}` : null));
                  const params = new URLSearchParams({ api: "1", travelmode: "driving", dir_action: "navigate" });
                  if (origin) params.set("origin", origin);
                  if (dest) params.set("destination", dest);
                  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
                  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
                }}
              >
                <HugeiconsIcon icon={Navigation03Icon} className="size-4" strokeWidth={1.5} />
                Start Driving
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Map */}
      <div className="mx-5 overflow-hidden rounded-xl" style={{ height: 200 }}>
        {mapsLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={center}
            zoom={11}
            onLoad={onMapLoad}
            options={{
              disableDefaultUI: true,
              zoomControl: false,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              styles: MAP_STYLES,
              backgroundColor: "#f5f5f5",
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-secondary/50">
            <p className="text-xs text-muted-foreground">Loading map…</p>
          </div>
        )}
      </div>

      {/* Route info */}
      <div className="mx-5 mt-2.5 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Road01Icon} className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {routeLoading || !routeInfo ? "–" : routeInfo.distanceMiles}
            </span> mi
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Clock01Icon} className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {routeLoading || !routeInfo ? "–" : routeInfo.durationMin}
            </span> min
          </p>
        </div>
        {!routeLoading && routeInfo && (
          <div className="ml-auto text-[11px] text-muted-foreground">
            Arrive by{" "}
            <span className="font-medium text-foreground">
              {new Date(Date.now() + routeInfo.durationMin * 60000).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>

      {/* Rider list (driver view) */}
      {isDriver && riders.length > 0 && (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pickup Order
            </p>
            {orderChanged && (
              <button
                onClick={handleRevert}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <HugeiconsIcon icon={UndoIcon} className="size-3.5" strokeWidth={1.5} />
                Revert
              </button>
            )}
          </div>
          <DndContext id="carpool-rider-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={riders.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {riders.map((rider, i) => (
                  <SortableRiderItem
                    key={rider.id}
                    rider={rider}
                    index={i}
                    leg={leg}
                    isChanged={changedRiderIds.has(rider.id)}
                    legDurationMin={routeInfo?.legDurationsMin[i] ?? null}
                    cumulativeMin={
                      routeInfo?.legDurationsMin
                        ? routeInfo.legDurationsMin.slice(0, i + 1).reduce((a, b) => a + b, 0)
                        : null
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Driver info (rider view) */}
      {!isDriver && driver && (
        <div className="mt-4 flex-1 px-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Your Driver
          </p>
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar>
              {driver.avatar_url && <AvatarImage src={driver.avatar_url} />}
              <AvatarFallback>{getInitials(driver.full_name)}</AvatarFallback>
            </Avatar>
            <p className="text-sm font-medium">{driver.full_name}</p>
          </div>
        </div>
      )}

      {/* Send button (drivers only) */}
      {isDriver && riders.length > 0 && (
        <div className="mt-auto px-5 pb-5 pt-3">
          {lastSentAt && (
            <p className="mb-2 text-center text-[11px] text-muted-foreground">
              Last confirmed {new Date(lastSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
              at {new Date(lastSentAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
          <Button
            onClick={handleSend}
            disabled={!needsSend || saving}
            className="w-full rounded-xl"
          >
            <HugeiconsIcon
              icon={needsSend ? SentIcon : Tick02Icon}
              className="size-4 mr-1.5"
              strokeWidth={1.5}
            />
            {saving ? "Confirming…" : needsSend ? (sentRiders.size > 0 ? "Confirm Update" : "Confirm") : "Confirmed"}
          </Button>
        </div>
      )}
    </div>
  );
}
