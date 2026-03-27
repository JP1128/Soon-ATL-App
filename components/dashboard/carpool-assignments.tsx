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
import { ArrowDown01Icon, Car01Icon, SteeringIcon, UserGroupIcon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

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
  return phone;
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
}: CarpoolAssignmentsProps): React.ReactElement {
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [carpools, setCarpools] = useState<CarpoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [leg, setLeg] = useState<Leg>("before");
  const [listView, setListView] = useState<"drivers" | "riders">("drivers");
  const [search, setSearch] = useState("");
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [addRiderTarget, setAddRiderTarget] = useState<{ driverId: string; driverName: string } | null>(null);
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);

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
    }));
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
    const entries = legRiders.map((r) => ({
      userId: r.user_id,
      profile: r.profiles,
      assignedTo: riderDriverMap.get(r.user_id) ?? null,
    }));
    if (showOnlyUnassigned) {
      return entries.filter((r) => !r.assignedTo);
    }
    return entries;
  }, [responses, leg, riderDriverMap, showOnlyUnassigned]);

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

  async function handleAddRider(riderId: string): Promise<void> {
    if (!addRiderTarget) return;
    const { driverId } = addRiderTarget;

    // Optimistically update local state
    setCarpools((prev) => {
      // Remove rider from any existing carpool
      const updated = prev.map((c) => ({
        ...c,
        carpool_riders: c.carpool_riders.filter((cr) => cr.rider_id !== riderId),
      }));

      // Find or create carpool for the target driver
      const existing = updated.find((c) => c.driver_id === driverId);
      if (existing) {
        const nextOrder = existing.carpool_riders.length + 1;
        existing.carpool_riders = [
          ...existing.carpool_riders,
          { rider_id: riderId, pickup_order: nextOrder },
        ];
      } else {
        updated.push({
          id: crypto.randomUUID(),
          driver_id: driverId,
          carpool_riders: [{ rider_id: riderId, pickup_order: 1 }],
        });
      }

      return updated;
    });

    setAddRiderTarget(null);

    // Persist to server
    try {
      await fetch(`/api/events/${eventId}/carpools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, riderId }),
      });
    } catch {
      // Re-fetch on failure to restore correct state
      const res = await fetch(`/api/events/${eventId}/carpools`);
      if (res.ok) {
        const data = await res.json();
        setCarpools(data.carpools);
      }
    }
  }

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
        {/* Header + leg toggle */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Carpool Assignment</h1>
          <div className="flex rounded-lg bg-secondary/50 p-0.5">
            <button
              type="button"
              onClick={() => setLeg("before")}
              className={cn(
                "inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
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
                "inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                leg === "after"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="After event"
            >
              After
            </button>
          </div>
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
          </button>
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
                                  <div
                                    key={rider.userId}
                                    className="flex items-center gap-2.5 py-1.5"
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
                                  </div>
                                ))}
                              </div>
                            )}
                            {driver.availableSeats > 0 && driver.assignedRiders.length < driver.availableSeats && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddRiderTarget({ driverId: driver.userId, driverName: driver.profile.full_name });
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
              filteredRiders.map((rider) => (
                <ScrollReveal key={rider.userId} scrollRoot={scrollRef}>
                  <div
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2",
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
                    {!rider.assigned && (
                      <span className="shrink-0 text-[10px] font-medium text-destructive">
                        Unassigned
                      </span>
                    )}
                  </div>
                </ScrollReveal>
              ))
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
        onSelect={handleAddRider}
        riders={overlayRiders}
        showOnlyUnassigned={showOnlyUnassigned}
        onToggleFilter={setShowOnlyUnassigned}
        targetDriverName={addRiderTarget?.driverName ?? ""}
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
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (riderId: string) => void;
  riders: OverlayRider[];
  showOnlyUnassigned: boolean;
  onToggleFilter: (value: boolean) => void;
  targetDriverName: string;
}): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setSelectedRiderId(null);
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
                const isSelected = selectedRiderId === rider.userId;
                return (
                  <button
                    key={rider.userId}
                    type="button"
                    onClick={() => setSelectedRiderId(isSelected ? null : rider.userId)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 ring-1 ring-primary/30"
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
              disabled={!selectedRiderId}
              onClick={() => {
                if (selectedRiderId) onSelect(selectedRiderId);
              }}
              className={cn(
                "flex-1 rounded-4xl px-4 py-2.5 text-sm font-medium transition-colors",
                selectedRiderId
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-primary/40 text-primary-foreground/50 cursor-not-allowed"
              )}
            >
              {selectedRiderId && riders.find((r) => r.userId === selectedRiderId)?.assignedTo
                ? "Swap"
                : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
