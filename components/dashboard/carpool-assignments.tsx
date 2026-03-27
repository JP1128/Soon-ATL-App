"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Car01Icon, SteeringIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
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
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el.removeEventListener("scroll", checkScroll);
  }, [checkScroll]);

  useEffect(() => {
    async function fetchData(): Promise<void> {
      const res = await fetch(`/api/events/${eventId}/carpools`);
      if (res.ok) {
        const data = await res.json();
        setResponses(data.responses);
        setCarpools(data.carpools);
      }
      setLoading(false);
      // Recheck scroll after data loads
      setTimeout(checkScroll, 100);
    }
    fetchData();
  }, [eventId, checkScroll]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
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

      {/* Scrollable list */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-5 pb-28"
        style={{
          maskImage: `linear-gradient(to bottom, ${canScrollUp ? "transparent, black 2rem" : "black 0%"}, black calc(100% - 8rem), transparent)`,
          WebkitMaskImage: `linear-gradient(to bottom, ${canScrollUp ? "transparent, black 2rem" : "black 0%"}, black calc(100% - 8rem), transparent)`,
        }}
      >
      {listView === "drivers" ? (
      /* Drivers list */
      <div className="space-y-1.5">
        {filteredDrivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No drivers found</p>
        ) : (
          filteredDrivers.map((driver) => {
              const isExpanded = expandedDriver === driver.userId;
            return (
              <ScrollReveal key={driver.userId} scrollRoot={scrollRef}>
              <div
                className="rounded-lg border overflow-hidden"
              >
                  {/* Driver header (collapsed view) */}
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

                  {/* Expanded rider list */}
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
                      </div>
                    </div>
                  </div>
                </div>
                </ScrollReveal>
              );
            })
          )}
        </div>
      ) : (
      /* Riders list */
      <div className="space-y-1.5">
        {filteredRiders.length === 0 ? (
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
        )}
      </div>
      )}
      </div>
    </div>
  );
}
