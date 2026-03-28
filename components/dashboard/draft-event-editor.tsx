"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { DatePickerOverlay } from "@/components/ui/date-picker-overlay";
import { AddressPickerOverlay } from "@/components/ui/address-picker-overlay";
import type { AddressResult } from "@/components/ui/address-picker-overlay";
import { ManualAddressOverlay } from "@/components/ui/manual-address-overlay";
import { HugeiconsIcon } from "@hugeicons/react";
import { MapsSearchIcon, TextIcon, FloppyDiskIcon, Delete02Icon, SentIcon, Edit02Icon, Car01Icon } from "@hugeicons/core-free-icons";
import type { Event } from "@/types/database";
import { EditEventDialog } from "@/components/dashboard/edit-event-dialog";

interface EventStats {
  total: number;
  drivers: number;
  riders: number;
  attending: number;
  beforeDrivers: number;
  beforeRiders: number;
  afterDrivers: number;
  afterRiders: number;
  hasUnassignedRiders: boolean;
  unassignedRiderCount: number;
}

interface DraftEventEditorProps {
  event: Event;
  stats?: EventStats;
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseEventDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseEventTime(timeStr: string | null): { hour: string; minute: string; period: "AM" | "PM" } {
  if (!timeStr) return { hour: "", minute: "", period: "PM" };
  const [h, m] = timeStr.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return {
    hour: String(displayHour),
    minute: String(m).padStart(2, "0"),
    period,
  };
}

export function DraftEventEditor({ event, stats }: DraftEventEditorProps): React.ReactElement {
  const router = useRouter();
  const parsedTime = parseEventTime(event.event_time);

  const [title, setTitle] = useState(event.title);
  const [selectedDate, setSelectedDate] = useState<Date>(parseEventDate(event.event_date));
  const [hour, setHour] = useState(parsedTime.hour);
  const [minute, setMinute] = useState(parsedTime.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(parsedTime.period);
  const [location, setLocation] = useState(event.location);
  const [locationType, setLocationType] = useState<"search" | "manual">("search");
  const [locationMode, setLocationMode] = useState<"search" | "manual" | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const dayLabel = DAY_LABELS[selectedDate.getDay()];

  function getTimeValue(): string | null {
    if (!hour) return null;
    let h = parseInt(hour, 10);
    const m = parseInt(minute || "0", 10);
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function getUpdates(): Record<string, unknown> {
    return {
      title,
      event_date: formatDateValue(selectedDate),
      event_time: getTimeValue(),
      location,
    };
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    setError(null);

    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getUpdates()),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to save");
      setIsSaving(false);
      return;
    }

    setLastSaved(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    setIsSaving(false);
    router.refresh();
  }

  async function handleActivate(): Promise<void> {
    if (!title.trim() || !location.trim()) {
      setError("Title and location are required to send out.");
      return;
    }

    setIsActivating(true);
    setError(null);

    // Save and send out
    const saveRes = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...getUpdates(), status: "open" }),
    });

    if (!saveRes.ok) {
      const data = await saveRes.json();
      setError(data.error || "Failed to send out");
      setIsActivating(false);
      return;
    }

    router.refresh();
  }

  async function handleDelete(): Promise<void> {
    if (!confirm("Delete this event? This cannot be undone.")) return;

    await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    router.refresh();
  }

  const isOpen = event.status === "open";
  const canActivate = title.trim() !== "" && location.trim() !== "";

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-md rounded-2xl border p-5 space-y-6">

        {isOpen ? (
          <>
            {stats && (
              <div className="space-y-2 text-center text-sm">
                <p className="text-2xl font-bold">{stats.total} <span className="text-sm font-normal text-muted-foreground">{stats.total === 1 ? "response" : "responses"}</span></p>
                <p className="text-muted-foreground">
                  {stats.drivers} driving · {stats.riders} riding · {stats.attending} neither
                </p>
                <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                  <span>Before: {stats.beforeDrivers}D / {stats.beforeRiders}R</span>
                  <span>After: {stats.afterDrivers}D / {stats.afterRiders}R</span>
                </div>
                {event.sent_at && (
                  <p className="text-[11px] text-muted-foreground/60">
                    Sent {new Date(event.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} at{" "}
                    {new Date(event.sent_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Button variant="outline" onClick={() => setEditOpen(true)} className="w-full rounded-xl">
                <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                Edit Event
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl"
                disabled={!stats || stats.total === 0}
                onClick={() => router.push(`/dashboard/events/${event.id}/carpools`)}
              >
                <HugeiconsIcon icon={Car01Icon} className="size-4" />
                Carpool Assignment
                {stats && stats.unassignedRiderCount > 0 && (
                  <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                    {stats.unassignedRiderCount}
                  </span>
                )}
              </Button>
              <Button onClick={handleDelete} variant="outline" className="w-full rounded-xl text-destructive hover:text-destructive">
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                Delete Event
              </Button>
            </div>
            <EditEventDialog event={event} open={editOpen} onOpenChange={setEditOpen} />
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="draft-title" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Title</Label>
                <Input
                  id="draft-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Gethsemane"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline gap-1.5">
                  <div className="flex flex-1 items-baseline gap-1.5">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</Label>
                    <span className="text-xs text-muted-foreground">{dayLabel}</span>
                  </div>
                  <Label className="min-w-28 text-xs font-medium uppercase tracking-wider text-muted-foreground">Time</Label>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(true)}
                    className="flex h-9 flex-1 items-center rounded-4xl border border-input bg-input/30 px-3 text-sm transition-colors hover:bg-input/50"
                  >
                    {formatDateDisplay(selectedDate)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeOpen(true)}
                    className="flex h-9 min-w-28 items-center justify-center gap-1 rounded-4xl border border-input bg-input/30 px-3 text-sm tabular-nums transition-colors hover:bg-input/50"
                  >
                    {hour || "–"}<span className="text-muted-foreground">:</span>{minute || "00"} {period}
                  </button>
                </div>
                <DatePickerOverlay
                  open={calendarOpen}
                  onClose={() => setCalendarOpen(false)}
                  selected={selectedDate}
                  onSelect={(date) => setSelectedDate(date)}
                  disabled={{ before: new Date() }}
                  title="Event date"
                />
                <TimeWheelPicker
                  open={timeOpen}
                  onClose={() => setTimeOpen(false)}
                  hour={hour || "7"}
                  minute={minute || "00"}
                  period={period}
                  onChangeHour={(h) => setHour(h)}
                  onChangeMinute={(m) => setMinute(m)}
                  onChangePeriod={(p) => setPeriod(p as "AM" | "PM")}
                  title="Event time"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Location</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLocationType((t) => (t === "search" ? "manual" : "search"))}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border transition-all hover:bg-muted/50"
                    aria-label={locationType === "search" ? "Switch to manual entry" : "Switch to address search"}
                  >
                    <HugeiconsIcon
                      icon={locationType === "search" ? MapsSearchIcon : TextIcon}
                      className="size-4 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationMode(locationType)}
                    className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-4xl border border-input bg-input/30 px-3 text-sm text-left transition-colors hover:bg-input/50"
                  >
                    {location ? (
                      <span className="truncate">{location}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {locationType === "search" ? "Search address..." : "Enter address..."}
                      </span>
                    )}
                  </button>
                </div>
                <AddressPickerOverlay
                  open={locationMode === "search"}
                  onClose={() => setLocationMode(null)}
                  mode="search"
                  onConfirm={(result: AddressResult) => setLocation(result.address)}
                  initialAddress={location}
                  title="Event location"
                />
                <ManualAddressOverlay
                  open={locationMode === "manual"}
                  onClose={() => setLocationMode(null)}
                  onConfirm={(address: string) => setLocation(address)}
                  initialAddress={location}
                  title="Event location"
                />
              </div>

            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <Button onClick={handleDelete} variant="outline" className="flex-1 rounded-xl text-destructive hover:text-destructive">
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                Delete
              </Button>
              <Button onClick={handleSave} variant="outline" disabled={isSaving} className="flex-1 rounded-xl">
                <HugeiconsIcon icon={FloppyDiskIcon} className="size-4" />
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>

            <Button onClick={handleActivate} disabled={!canActivate || isActivating} className="w-full rounded-xl">
              <HugeiconsIcon icon={SentIcon} className="size-4" />
              {isActivating ? "Sending…" : "Send out"}
            </Button>
          </>
        )}
      </div>
      {lastSaved && !isOpen && (
        <p className="w-full max-w-md text-xs text-muted-foreground text-right mt-2 px-1">Last saved {lastSaved}</p>
      )}
    </div>
  );
}
