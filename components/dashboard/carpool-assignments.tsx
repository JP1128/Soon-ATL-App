"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Car01Icon, SteeringIcon, UserGroupIcon, UserAdd01Icon, UserRemove01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { cn, formatPhoneNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
  assignedRiders: RiderEntry[];
}

interface RiderEntry {
  userId: string;
  profile: ProfileData;
}

interface CarpoolAssignmentsProps {
  eventId: string;
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

export function CarpoolAssignments({
  eventId,
  carpoolsSentAt,
}: CarpoolAssignmentsProps): React.ReactElement {
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [carpools, setCarpools] = useState<CarpoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [leg, setLeg] = useState<Leg>("before");
  const [listView, setListView] = useState<"drivers" | "riders">("drivers");
  const [search, setSearch] = useState("");
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [addRiderTarget, setAddRiderTarget] = useState<{ driverId: string; driverName: string; availableSeats: number; currentRiderCount: number } | null>(null);
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(true);
  const [riderDetailTarget, setRiderDetailTarget] = useState<{
    rider: RiderEntry;
    currentDriver: { userId: string; name: string } | null;
  } | null>(null);
  const [rideHistory, setRideHistory] = useState<Map<string, number>>(new Map());
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

    // Build driver entries
    const driverEntries: DriverEntry[] = legDrivers.map((d) => {
      const assigned = assignmentMap.get(d.user_id) ?? [];
      const assignedRiders: RiderEntry[] = assigned
        .filter((riderId) => {
          // Only include riders who are actually riders in this leg
          return legRiders.some((r) => r.user_id === riderId);
        })
        .map((riderId) => ({
          userId: riderId,
          profile: profileMap.get(riderId) ?? {
            id: riderId,
            full_name: "Unknown",
            avatar_url: null,
            phone_number: null,
          },
        }));

      return {
        userId: d.user_id,
        profile: d.profiles,
        availableSeats: d.available_seats ?? 0,
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
      }));

    return {
      drivers: driverEntries,
      riders: legRiders,
      unassignedRiders: unassigned,
      assignedRiderIds,
    };
  }, [responses, carpools, leg]);

  // Build full rider list with assignment status
  const allRiderEntries = useMemo(() => {
    const roleField = leg === "before" ? "before_role" : "after_role";
    const legRiders = responses.filter((r) => r[roleField] === "rider");
    return legRiders.map((r) => ({
      userId: r.user_id,
      profile: r.profiles,
      assigned: assignedRiderIds.has(r.user_id),
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
    setExpandedDriver((prev) => (prev === userId ? null : userId));
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
            {sentAt ? "Send Update" : "Send"}
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
          className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-none"
          style={{
            maskImage: `linear-gradient(to bottom, ${canScrollUp ? "transparent, black 1.5rem" : "black 0%"}, black calc(100% - 7.5rem), transparent calc(100% - 6rem), transparent)`,
            WebkitMaskImage: `linear-gradient(to bottom, ${canScrollUp ? "transparent, black 1.5rem" : "black 0%"}, black calc(100% - 7.5rem), transparent calc(100% - 6rem), transparent)`,
          }}
        >
          <div className="space-y-1.5 pb-28">
          {listView === "drivers" ? (
            filteredDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drivers found</p>
            ) : (
              filteredDrivers.map((driver) => {
                const isExpanded = expandedDriver === driver.userId;
                const isFull = driver.availableSeats > 0 && driver.assignedRiders.length >= driver.availableSeats;
                return (
                  <ScrollReveal key={driver.userId} scrollRoot={scrollRef}>
                    <div className="rounded-lg border overflow-hidden">
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
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isFull && (
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                              Full
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
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
                          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="border-t bg-secondary/20 px-3 py-1.5">
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
                                      </p>
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
                                  setAddRiderTarget({ driverId: driver.userId, driverName: driver.profile.full_name, availableSeats: driver.availableSeats, currentRiderCount: driver.assignedRiders.length });
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
                          rider: { userId: rider.userId, profile: rider.profile },
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
      />

      {/* Send confirmation overlay */}
      <SendConfirmOverlay
        open={showSendConfirm}
        onClose={() => setShowSendConfirm(false)}
        onConfirm={handleSend}
        isUpdate={sentAt !== null}
        unassignedRiders={unassignedRiders}
        sending={sending}
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
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (riderIds: string[]) => void;
  riders: OverlayRider[];
  showOnlyUnassigned: boolean;
  onToggleFilter: (value: boolean) => void;
  targetDriverName: string;
  remainingSeats: number;
}): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(new Set());

  // Count how many selected riders are swaps (already assigned elsewhere)
  const swapCount = useMemo(() => {
    let count = 0;
    for (const id of selectedRiderIds) {
      const r = riders.find((r) => r.userId === id);
      if (r?.assignedTo) count++;
    }
    return count;
  }, [selectedRiderIds, riders]);

  // Net new seats needed = selected count minus swaps (swaps don't consume new seats)
  const newSeatsNeeded = selectedRiderIds.size - swapCount;
  const atCapacity = newSeatsNeeded >= remainingSeats;

  function toggleRider(riderId: string): void {
    setSelectedRiderIds((prev) => {
      const next = new Set(prev);
      if (next.has(riderId)) {
        next.delete(riderId);
      } else {
        // Check if adding this rider would exceed capacity
        const isSwap = riders.find((r) => r.userId === riderId)?.assignedTo !== null;
        const wouldNeed = newSeatsNeeded + (isSwap ? 0 : 1);
        if (wouldNeed <= remainingSeats) {
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
                const wouldExceed = !isSelected && atCapacity && !isSwap;
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
                      <p className="truncate text-[11px] text-muted-foreground">
                        {rider.assignedTo
                          ? rider.assignedTo.driverName
                          : "Unassigned"}
                      </p>
                    </div>
                    {!rider.assignedTo && (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                        Unassigned
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

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
}: {
  open: boolean;
  onClose: () => void;
  rider: RiderEntry | null;
  currentDriver: { userId: string; name: string } | null;
  drivers: DriverEntry[];
  rideHistory: Map<string, number>;
  onRemove: (riderId: string) => void;
  onReassign: (riderId: string, driverId: string) => void;
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

  if (!mounted || !rider) return null;

  // Exclude the current driver from the reassignment list (show all if unassigned)
  const availableDrivers = currentDriver
    ? drivers.filter((d) => d.userId !== currentDriver.userId)
    : drivers;

  const selectedDriver = selectedDriverId
    ? availableDrivers.find((d) => d.userId === selectedDriverId)
    : null;
  const isSelectedDriverFull = selectedDriver
    ? selectedDriver.assignedRiders.length >= selectedDriver.availableSeats && selectedDriver.availableSeats > 0
    : false;

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
                        <span className={cn(
                          "flex items-center gap-1 text-xs",
                          isFull ? "text-destructive" : "text-muted-foreground"
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
                                <p className="truncate text-xs">{r.profile.full_name}</p>
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

function SendConfirmOverlay({
  open,
  onClose,
  onConfirm,
  isUpdate,
  unassignedRiders,
  sending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isUpdate: boolean;
  unassignedRiders: RiderEntry[];
  sending: boolean;
}): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

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

  if (!mounted) return null;

  const hasUnassigned = unassignedRiders.length > 0;

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
          <p className="text-sm font-semibold mb-1">
            {isUpdate ? "Send Update?" : "Send Carpool Assignments?"}
          </p>

          {/* Unassigned riders warning */}
          {hasUnassigned && (
            <div className="mt-4 mb-2">
              {/* Stacked avatars */}
              <div className="flex items-center -space-x-2 mb-3">
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
                  ? "There is 1 unassigned rider. Are you sure you want to send?"
                  : `There are ${unassignedRiders.length} unassigned riders. Are you sure you want to send?`}
              </p>
            </div>
          )}

          {/* Update notice */}
          {isUpdate && (
            <p className="text-xs text-muted-foreground mt-3">
              Only the members affected by the changes will be notified of this update.
            </p>
          )}

          {/* No issues */}
          {!hasUnassigned && !isUpdate && (
            <p className="text-xs text-muted-foreground">
              This will send the carpool assignments to all members.
            </p>
          )}

          {/* Action buttons */}
          <div className="mt-5 flex gap-3">
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
              {sending ? "Sending…" : isUpdate ? "Send Update" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
