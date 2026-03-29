"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { AnimatedIconBlock } from "@/components/ui/animated-icon-block";
import { ResponseOptionsMenu } from "@/components/response-options-menu";
import { CarpoolDetailView } from "@/components/carpool-detail-view";
import { RoleEditOverlay } from "@/components/role-edit-overlay";
import { HugeiconsIcon } from "@hugeicons/react";
import { Car01Icon, LocationUser01Icon, Coffee01Icon, Edit02Icon, MapsSearchIcon, Clock01Icon, SeatSelectorIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { formatDisplayAddress } from "@/lib/utils";
import type { LegRole } from "@/types/database";

interface AssignedRider {
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

interface AssignedDriver {
  full_name: string;
  avatar_url: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
}

interface SubmittedEventCardProps {
  responseId: string;
  eventId: string;
  eventDate: string;
  eventTime: string | null;
  title: string;
  location: string;
  status: "submitted" | "ride-assigned";
  beforeRole: LegRole | null;
  afterRole: LegRole | null;
  pickupAddress: string | null;
  returnAddress: string | null;
  availableSeats: number | null;
  departureTime: string | null;
  beforeAssignedRiders: AssignedRider[];
  afterAssignedRiders: AssignedRider[];
  beforeAssignedDriver: AssignedDriver | null;
  afterAssignedDriver: AssignedDriver | null;
  beforeCarpoolId: string | null;
  afterCarpoolId: string | null;
  beforePickupOrderSentAt: string | null;
  afterPickupOrderSentAt: string | null;
  beforePickupOrderSentRiders: string[];
  afterPickupOrderSentRiders: string[];
  carpoolsSentAt: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  returnLat: number | null;
  returnLng: number | null;
}

function getDaysLeft(eventDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(eventDate + "T00:00:00");
  return Math.ceil((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour24 = parseInt(h, 10);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  return `${hour12}:${m} ${period}`;
}

export function SubmittedEventCard({
  responseId,
  eventId,
  eventDate,
  eventTime,
  title,
  location,
  status,
  beforeRole,
  afterRole,
  pickupAddress,
  returnAddress,
  availableSeats,
  departureTime,
  beforeAssignedRiders,
  afterAssignedRiders,
  beforeAssignedDriver,
  afterAssignedDriver,
  beforeCarpoolId,
  afterCarpoolId,
  beforePickupOrderSentAt,
  afterPickupOrderSentAt,
  beforePickupOrderSentRiders,
  afterPickupOrderSentRiders,
  carpoolsSentAt,
  pickupLat,
  pickupLng,
  returnLat,
  returnLng,
}: SubmittedEventCardProps): React.ReactElement {
  const [view, setView] = useState<"main" | "detail">("main");
  const [activeLeg, setActiveLeg] = useState<"before" | "after">("before");
  const [editLeg, setEditLeg] = useState<"before" | "after" | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // Local state for sent riders and current rider order (updated when driver sends from detail view)
  const [beforeSentRecently, setBeforeSentRecently] = useState(false);
  const [afterSentRecently, setAfterSentRecently] = useState(false);

  const handleSent = useCallback((leg: "before" | "after"): void => {
    if (leg === "before") setBeforeSentRecently(true);
    else setAfterSentRecently(true);
  }, []);

  // Reset sentRecently flags when server data actually changes (e.g. organizer modifies assignments)
  const beforeRiderIds = beforeAssignedRiders.map((r) => r.id).join(",");
  const beforeSentRiderIds = beforePickupOrderSentRiders.join(",");
  useEffect(() => {
    setBeforeSentRecently(false);
  }, [beforeRiderIds, beforeSentRiderIds]);

  const afterRiderIds = afterAssignedRiders.map((r) => r.id).join(",");
  const afterSentRiderIds = afterPickupOrderSentRiders.join(",");
  useEffect(() => {
    setAfterSentRecently(false);
  }, [afterRiderIds, afterSentRiderIds]);

  // Driver indicator: show dot when riders haven't been sent pickup order or order has changed
  const hasUnsentBeforeRiders = !beforeSentRecently && (() => {
    if (beforeAssignedRiders.length === 0) return false;
    if (beforePickupOrderSentRiders.length === 0) return true;
    const currentIds = beforeAssignedRiders.map((r) => r.id);
    if (currentIds.length !== beforePickupOrderSentRiders.length) return true;
    return currentIds.some((id, i) => id !== beforePickupOrderSentRiders[i]);
  })();
  const hasUnsentAfterRiders = !afterSentRecently && (() => {
    if (afterAssignedRiders.length === 0) return false;
    if (afterPickupOrderSentRiders.length === 0) return true;
    const currentIds = afterAssignedRiders.map((r) => r.id);
    if (currentIds.length !== afterPickupOrderSentRiders.length) return true;
    return currentIds.some((id, i) => id !== afterPickupOrderSentRiders[i]);
  })();

  // Rider indicator: show dot when assigned a driver the rider hasn't seen yet (per-leg)
  const beforeRiderSeenKey = `rider-driver-seen-before-${responseId}`;
  const afterRiderSeenKey = `rider-driver-seen-after-${responseId}`;
  const [hasUnseenBeforeDriver, setHasUnseenBeforeDriver] = useState(() => {
    if (!beforeAssignedDriver) return false;
    const seen = localStorage.getItem(beforeRiderSeenKey);
    return seen !== beforeAssignedDriver.full_name;
  });
  const [hasUnseenAfterDriver, setHasUnseenAfterDriver] = useState(() => {
    if (!afterAssignedDriver) return false;
    const seen = localStorage.getItem(afterRiderSeenKey);
    return seen !== afterAssignedDriver.full_name;
  });

  const markDriverSeen = useCallback((leg: "before" | "after"): void => {
    if (leg === "before" && beforeAssignedDriver) {
      localStorage.setItem(beforeRiderSeenKey, beforeAssignedDriver.full_name);
      setHasUnseenBeforeDriver(false);
    } else if (leg === "after" && afterAssignedDriver) {
      localStorage.setItem(afterRiderSeenKey, afterAssignedDriver.full_name);
      setHasUnseenAfterDriver(false);
    }
  }, [beforeRiderSeenKey, afterRiderSeenKey, beforeAssignedDriver, afterAssignedDriver]);

  useEffect(() => {
    if (!beforeAssignedDriver) {
      setHasUnseenBeforeDriver(false);
    } else {
      const seen = localStorage.getItem(beforeRiderSeenKey);
      if (seen !== beforeAssignedDriver.full_name) setHasUnseenBeforeDriver(true);
    }
  }, [beforeAssignedDriver, beforeRiderSeenKey]);

  useEffect(() => {
    if (!afterAssignedDriver) {
      setHasUnseenAfterDriver(false);
    } else {
      const seen = localStorage.getItem(afterRiderSeenKey);
      if (seen !== afterAssignedDriver.full_name) setHasUnseenAfterDriver(true);
    }
  }, [afterAssignedDriver, afterRiderSeenKey]);

  const showDetail = (leg: "before" | "after"): void => {
    setActiveLeg(leg);
    setView("detail");
    // If rider is viewing their driver assignment, mark as seen
    const role = leg === "before" ? beforeRole : afterRole;
    const driver = leg === "before" ? beforeAssignedDriver : afterAssignedDriver;
    if (role === "rider" && driver) {
      markDriverSeen(leg);
    }
  };

  const showMain = (): void => {
    setView("main");
  };

  const daysLeft = getDaysLeft(eventDate);

  const formattedDate = new Date(eventDate + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric" }
  );
  const formattedEventTime = eventTime
    ? new Date(`1970-01-01T${eventTime}`).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const hasBeforeAssignment =
    (beforeRole === "driver" && beforeAssignedRiders.length > 0) ||
    (beforeRole === "rider" && !!beforeAssignedDriver);

  const hasAfterAssignment =
    (afterRole === "driver" && afterAssignedRiders.length > 0) ||
    (afterRole === "rider" && !!afterAssignedDriver);

  return (
    <div
      className="relative flex w-full flex-1 flex-col overflow-hidden rounded-2xl border text-left"
    >
      <motion.div
        className="relative flex min-h-0 flex-1 overflow-hidden"
        style={{ width: "200%" }}
        animate={{ x: view === "main" ? "0%" : "-50%" }}
        transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
      >
        {/* Main view */}
        <div ref={mainRef} className="w-1/2">
        {/* Section 1: Event info */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
            <p className="text-lg font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formattedDate}
              {formattedEventTime ? ` · ${formattedEventTime}` : ""}
              {daysLeft >= 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-foreground">
                    {daysLeft === 0
                      ? "Today"
                      : daysLeft === 1
                        ? "Tomorrow"
                        : `${daysLeft} days left`}
                  </span>
                </>
              )}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDisplayAddress(location)}
            </p>
            </div>
            <ResponseOptionsMenu responseId={responseId} eventId={eventId} />
          </div>
        </div>

        {/* Section 2: Before the event */}
        <div className="border-t border-border/40 px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Before {title}
            </p>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => setEditLeg("before")}>
              <HugeiconsIcon icon={Edit02Icon} className="size-3.5" strokeWidth={1.5} />
              Edit
            </Button>
          </div>
          <div className="mt-3 flex gap-3">
            <AnimatedIconBlock>
              <HugeiconsIcon
                icon={beforeRole === "driver" ? Car01Icon : beforeRole === "rider" ? LocationUser01Icon : Coffee01Icon}
                className="size-5"
                strokeWidth={1.5}
              />
            </AnimatedIconBlock>
            <div className="min-w-0 flex-1 space-y-1">
              {beforeRole === "driver" ? (
                <>
                  {pickupAddress && (
                    <div className="flex items-start gap-1.5">
                      <HugeiconsIcon icon={MapsSearchIcon} className="size-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                      <p className="min-w-0 text-[11px] text-muted-foreground leading-tight">{formatDisplayAddress(pickupAddress)}</p>
                    </div>
                  )}
                  {departureTime && (
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Clock01Icon} className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                      <p className="text-[11px] text-muted-foreground">Latest departure <span className="font-medium text-foreground">{formatTime(departureTime)}</span></p>
                    </div>
                  )}
                  {availableSeats && (
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={SeatSelectorIcon} className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                      <p className="text-[11px] text-muted-foreground">{availableSeats} {availableSeats === 1 ? "seat" : "seats"} available</p>
                    </div>
                  )}
                </>
              ) : beforeRole === "rider" ? (
                <>
                  {pickupAddress && (
                    <div className="flex items-start gap-1.5">
                      <HugeiconsIcon icon={MapsSearchIcon} className="size-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                      <p className="min-w-0 text-[11px] text-muted-foreground leading-tight">{formatDisplayAddress(pickupAddress)}</p>
                    </div>
                  )}
                  {departureTime && (
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={Clock01Icon} className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                      <p className="text-[11px] text-muted-foreground">Earliest pickup <span className="font-medium text-foreground">{formatTime(departureTime)}</span></p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground">Thanks for attending!</p>
                  <p className="text-[11px] text-muted-foreground">If you would like to serve as a driver, then press the Edit button!</p>
                </>
              )}
            </div>
          </div>
          {(beforeRole === "driver" || beforeRole === "rider") && (
            <div
              className={`mt-3 rounded-lg px-3 py-2.5 ${
                (beforeRole === "driver" && beforeAssignedRiders.length > 0) || (beforeRole === "rider" && beforeAssignedDriver)
                  ? "border border-border/60 active:bg-secondary/80 transition-colors cursor-pointer"
                  : ""
              }`}
              onClick={hasBeforeAssignment ? () => showDetail("before") : undefined}
              role={hasBeforeAssignment ? "button" : undefined}
              tabIndex={hasBeforeAssignment ? 0 : undefined}
            >
              {beforeRole === "driver" && beforeAssignedRiders.length > 0 ? (
                <div className="flex items-center gap-2.5">
                  <AvatarGroup>
                    {beforeAssignedRiders.map((rider, i) => (
                      <Avatar key={i} size="sm">
                        {rider.avatar_url && <AvatarImage src={rider.avatar_url} />}
                        <AvatarFallback>{getInitials(rider.full_name)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </AvatarGroup>
                  <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                    {beforeAssignedRiders.length} {beforeAssignedRiders.length === 1 ? "rider" : "riders"} assigned
                  </p>
                  {hasUnsentBeforeRiders && (
                    <span className="size-2 rounded-full bg-foreground shrink-0" />
                  )}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                </div>
              ) : beforeRole === "rider" && beforeAssignedDriver ? (
                <div className="flex items-center gap-2.5">
                  <Avatar size="sm">
                    {beforeAssignedDriver.avatar_url && <AvatarImage src={beforeAssignedDriver.avatar_url} />}
                    <AvatarFallback>{getInitials(beforeAssignedDriver.full_name)}</AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                    {beforeAssignedDriver.full_name} is your driver
                  </p>
                  {hasUnseenBeforeDriver && (
                    <span className="size-2 rounded-full bg-foreground shrink-0" />
                  )}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {beforeRole === "driver"
                    ? "No rider has been assigned. We will notify you when a rider is assigned to you."
                    : "No driver has been assigned. We will notify you when a driver is assigned for you."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Section 3: After the event */}
        <div className="border-t border-border/40 px-5 pt-4 pb-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              After {title}
            </p>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => setEditLeg("after")}>
              <HugeiconsIcon icon={Edit02Icon} className="size-3.5" strokeWidth={1.5} />
              Edit
            </Button>
          </div>
          <div className="mt-3 flex gap-3">
            <AnimatedIconBlock>
              <HugeiconsIcon
                icon={afterRole === "driver" ? Car01Icon : afterRole === "rider" ? LocationUser01Icon : Coffee01Icon}
                className="size-5"
                strokeWidth={1.5}
              />
            </AnimatedIconBlock>
            <div className="min-w-0 flex-1 space-y-1">
              {afterRole === "driver" ? (
                <>
                  {returnAddress && (
                    <div className="flex items-start gap-1.5">
                      <HugeiconsIcon icon={MapsSearchIcon} className="size-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                      <p className="min-w-0 text-[11px] text-muted-foreground leading-tight">{formatDisplayAddress(returnAddress)}</p>
                    </div>
                  )}
                  {availableSeats && (
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon icon={SeatSelectorIcon} className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                      <p className="text-[11px] text-muted-foreground">{availableSeats} {availableSeats === 1 ? "seat" : "seats"} available</p>
                    </div>
                  )}
                </>
              ) : afterRole === "rider" ? (
                <>
                  {returnAddress && (
                    <div className="flex items-start gap-1.5">
                      <HugeiconsIcon icon={MapsSearchIcon} className="size-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                      <p className="min-w-0 text-[11px] text-muted-foreground leading-tight">{formatDisplayAddress(returnAddress)}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground">Thanks for attending!</p>
                  <p className="text-[11px] text-muted-foreground">If you would like to serve as a driver, then press the Edit button!</p>
                </>
              )}
            </div>
          </div>
          {(afterRole === "driver" || afterRole === "rider") && (
            <div
              className={`mt-3 rounded-lg px-3 py-2.5 ${
                (afterRole === "driver" && afterAssignedRiders.length > 0) || (afterRole === "rider" && afterAssignedDriver)
                  ? "border border-border/60 active:bg-secondary/80 transition-colors cursor-pointer"
                  : ""
              }`}
              onClick={hasAfterAssignment ? () => showDetail("after") : undefined}
              role={hasAfterAssignment ? "button" : undefined}
              tabIndex={hasAfterAssignment ? 0 : undefined}
            >
              {afterRole === "driver" && afterAssignedRiders.length > 0 ? (
                <div className="flex items-center gap-2.5">
                  <AvatarGroup>
                    {afterAssignedRiders.map((rider, i) => (
                      <Avatar key={i} size="sm">
                        {rider.avatar_url && <AvatarImage src={rider.avatar_url} />}
                        <AvatarFallback>{getInitials(rider.full_name)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </AvatarGroup>
                  <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                    {afterAssignedRiders.length} {afterAssignedRiders.length === 1 ? "rider" : "riders"} assigned
                  </p>
                  {hasUnsentAfterRiders && (
                    <span className="size-2 rounded-full bg-foreground shrink-0" />
                  )}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                </div>
              ) : afterRole === "rider" && afterAssignedDriver ? (
                <div className="flex items-center gap-2.5">
                  <Avatar size="sm">
                    {afterAssignedDriver.avatar_url && <AvatarImage src={afterAssignedDriver.avatar_url} />}
                    <AvatarFallback>{getInitials(afterAssignedDriver.full_name)}</AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                    {afterAssignedDriver.full_name} is your driver
                  </p>
                  {hasUnseenAfterDriver && (
                    <span className="size-2 rounded-full bg-foreground shrink-0" />
                  )}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {afterRole === "driver"
                    ? "No rider has been assigned. We will notify you when a rider is assigned to you."
                    : "No driver has been assigned. We will notify you when a driver is assigned for you."}
                </p>
              )}
            </div>
          )}
        </div>
        </div>

        {/* Detail view */}
        <div className="flex w-1/2 min-h-0 flex-col overflow-hidden">
            <CarpoolDetailView
              title={title}
              location={location}
              leg={activeLeg}
              riders={activeLeg === "before" ? beforeAssignedRiders : afterAssignedRiders}
              driver={activeLeg === "before" ? beforeAssignedDriver : afterAssignedDriver}
              isDriver={
                (activeLeg === "before" && beforeRole === "driver") ||
                (activeLeg === "after" && afterRole === "driver")
              }
              driverPickupLat={
                (activeLeg === "before" && beforeRole === "driver") || (activeLeg === "after" && afterRole === "driver")
                  ? pickupLat
                  : (activeLeg === "before" ? beforeAssignedDriver : afterAssignedDriver)?.pickup_lat ?? null
              }
              driverPickupLng={
                (activeLeg === "before" && beforeRole === "driver") || (activeLeg === "after" && afterRole === "driver")
                  ? pickupLng
                  : (activeLeg === "before" ? beforeAssignedDriver : afterAssignedDriver)?.pickup_lng ?? null
              }
              driverPickupAddress={
                (activeLeg === "before" && beforeRole === "driver") || (activeLeg === "after" && afterRole === "driver")
                  ? pickupAddress
                  : null
              }
              returnLat={returnLat}
              returnLng={returnLng}
              returnAddress={returnAddress}
              carpoolId={activeLeg === "before" ? beforeCarpoolId : afterCarpoolId}
              carpoolsSentAt={carpoolsSentAt}
              pickupOrderSentAt={activeLeg === "before" ? beforePickupOrderSentAt : afterPickupOrderSentAt}
              pickupOrderSentRiders={activeLeg === "before" ? beforePickupOrderSentRiders : afterPickupOrderSentRiders}
              onBack={showMain}
              onSent={() => handleSent(activeLeg)}
            />
        </div>
      </motion.div>

      {/* Fluid wave at bottom */}
      <div
        className={`pointer-events-none absolute bottom-0 left-0 z-10 w-full transition-opacity duration-300 ${view === "detail" ? "opacity-0" : "opacity-100"}`}
      >
        <svg
          className="animate-fluid-wave block w-[200%]"
          viewBox="0 0 800 40"
          preserveAspectRatio="none"
          style={{ height: 20 }}
        >
          <path
            d="M0,20 Q50,10 100,20 Q150,30 200,20 Q250,10 300,20 Q350,30 400,20 Q450,10 500,20 Q550,30 600,20 Q650,10 700,20 Q750,30 800,20 L800,40 L0,40 Z"
            className="fill-foreground"
          />
        </svg>
        <div className="h-1 bg-foreground" />
      </div>

      <RoleEditOverlay
        open={editLeg !== null}
        onClose={() => setEditLeg(null)}
        leg={editLeg ?? "before"}
        eventId={eventId}
        eventTitle={title}
        currentRole={editLeg === "before" ? beforeRole : afterRole}
        currentAddress={editLeg === "before" ? pickupAddress : returnAddress}
        currentLat={editLeg === "before" ? pickupLat : returnLat}
        currentLng={editLeg === "before" ? pickupLng : returnLng}
        currentDepartureTime={departureTime}
        currentAvailableSeats={availableSeats}
        currentNote={null}
      />
    </div>
  );
}
