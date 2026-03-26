"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { DatePickerOverlay } from "@/components/ui/date-picker-overlay";
import { AddressPickerOverlay } from "@/components/ui/address-picker-overlay";
import type { AddressResult } from "@/components/ui/address-picker-overlay";
import { ManualAddressOverlay } from "@/components/ui/manual-address-overlay";
import { HugeiconsIcon } from "@hugeicons/react";
import { MapsSearchIcon, TextIcon } from "@hugeicons/core-free-icons";
import type { Event } from "@/types/database";

interface DraftEventEditorProps {
  event: Event;
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

export function DraftEventEditor({ event }: DraftEventEditorProps): React.ReactElement {
  const router = useRouter();
  const parsedTime = parseEventTime(event.event_time);

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || "");
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
      description,
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

    setIsActivating(false);
    router.refresh();
  }

  async function handleDelete(): Promise<void> {
    if (!confirm("Delete this draft? This cannot be undone.")) return;

    await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    router.refresh();
  }

  const canActivate = title.trim() !== "" && location.trim() !== "";

  return (
    <div className="flex flex-col items-center">
      {lastSaved && (
        <p className="w-full max-w-md text-xs text-muted-foreground text-right mb-2 px-1">Last saved {lastSaved}</p>
      )}
      <div className="w-full max-w-md rounded-2xl border p-5 space-y-6">

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
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</Label>
                <span className="text-xs text-muted-foreground">{dayLabel}</span>
              </div>
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Time</Label>
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
                className="flex h-9 items-center gap-1 rounded-4xl border border-input bg-input/30 px-3 text-sm tabular-nums transition-colors hover:bg-input/50"
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
                className="flex h-9 flex-1 items-center rounded-4xl border border-input bg-input/30 px-3 text-sm text-left transition-colors hover:bg-input/50"
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

          <div className="space-y-1.5">
            <Label htmlFor="draft-description" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</Label>
            <Textarea
              id="draft-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes about the event…"
              rows={3}
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button onClick={handleSave} variant="outline" disabled={isSaving} className="flex-1 rounded-xl">
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button onClick={handleActivate} disabled={!canActivate || isActivating || event.status === "open"} className="flex-1 rounded-xl">
            {isActivating ? "Sending…" : event.status === "open" ? "Sent" : "Send out"}
          </Button>
        </div>

        <button
          onClick={handleDelete}
          className="block w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        >
          Delete draft
        </button>
      </div>
    </div>
  );
}
