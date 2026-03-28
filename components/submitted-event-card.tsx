import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { AnimatedIconBlock } from "@/components/ui/animated-icon-block";
import { ResponseOptionsMenu } from "@/components/response-options-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { Car01Icon, LocationUser01Icon, Coffee01Icon, Edit02Icon, MapsSearchIcon, Clock01Icon, SeatSelectorIcon } from "@hugeicons/core-free-icons";
import { formatDisplayAddress } from "@/lib/utils";
import type { LegRole } from "@/types/database";

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
  assignedRiders: { full_name: string; avatar_url: string | null }[];
  assignedDriver: { full_name: string; avatar_url: string | null } | null;
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
  assignedRiders,
  assignedDriver,
}: SubmittedEventCardProps): React.ReactElement {
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

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border text-left">
      {/* Fluid wave at rest */}
      <div className="absolute inset-x-0 bottom-0 h-[2%]">
        <svg
          className="animate-fluid-wave absolute -top-4 left-0 w-[200%]"
          viewBox="0 0 800 40"
          preserveAspectRatio="none"
          style={{ height: 20 }}
        >
          <path
            d="M0,20 Q50,10 100,20 Q150,30 200,20 Q250,10 300,20 Q350,30 400,20 Q450,10 500,20 Q550,30 600,20 Q650,10 700,20 Q750,30 800,20 L800,40 L0,40 Z"
            className="fill-foreground"
          />
        </svg>
        <div className="absolute inset-x-0 top-0 bottom-0 bg-foreground" />
      </div>

      {/* Content */}
      <div className="relative">
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
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
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
            <div className="mt-3 rounded-lg border border-dashed border-border/60 px-3 py-2.5">
              {beforeRole === "driver" && assignedRiders.length > 0 ? (
                <div className="flex items-center gap-2.5">
                  <AvatarGroup>
                    {assignedRiders.map((rider, i) => (
                      <Avatar key={i} size="sm">
                        {rider.avatar_url && <AvatarImage src={rider.avatar_url} />}
                        <AvatarFallback>{getInitials(rider.full_name)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </AvatarGroup>
                  <p className="text-[11px] text-muted-foreground">
                    {assignedRiders.length} {assignedRiders.length === 1 ? "rider" : "riders"} assigned
                  </p>
                </div>
              ) : beforeRole === "rider" && assignedDriver ? (
                <div className="flex items-center gap-2.5">
                  <Avatar size="sm">
                    {assignedDriver.avatar_url && <AvatarImage src={assignedDriver.avatar_url} />}
                    <AvatarFallback>{getInitials(assignedDriver.full_name)}</AvatarFallback>
                  </Avatar>
                  <p className="text-[11px] text-muted-foreground">
                    {assignedDriver.full_name} is your driver
                  </p>
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
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
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
            <div className="mt-3 rounded-lg border border-dashed border-border/60 px-3 py-2.5">
              {afterRole === "driver" && assignedRiders.length > 0 ? (
                <div className="flex items-center gap-2.5">
                  <AvatarGroup>
                    {assignedRiders.map((rider, i) => (
                      <Avatar key={i} size="sm">
                        {rider.avatar_url && <AvatarImage src={rider.avatar_url} />}
                        <AvatarFallback>{getInitials(rider.full_name)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </AvatarGroup>
                  <p className="text-[11px] text-muted-foreground">
                    {assignedRiders.length} {assignedRiders.length === 1 ? "rider" : "riders"} assigned
                  </p>
                </div>
              ) : afterRole === "rider" && assignedDriver ? (
                <div className="flex items-center gap-2.5">
                  <Avatar size="sm">
                    {assignedDriver.avatar_url && <AvatarImage src={assignedDriver.avatar_url} />}
                    <AvatarFallback>{getInitials(assignedDriver.full_name)}</AvatarFallback>
                  </Avatar>
                  <p className="text-[11px] text-muted-foreground">
                    {assignedDriver.full_name} is your driver
                  </p>
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
    </div>
  );
}
