"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
  const [calendarOpen, setCalendarOpen] = useState(false);
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
      setError("Title and location are required to activate.");
      return;
    }

    setIsActivating(true);
    setError(null);

    // Save first, then activate
    const saveRes = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...getUpdates(), status: "open" }),
    });

    if (!saveRes.ok) {
      const data = await saveRes.json();
      setError(data.error || "Failed to activate");
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
    <div className="space-y-6">
      {lastSaved && (
        <p className="text-xs text-muted-foreground">Last saved {lastSaved}</p>
      )}

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
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 justify-start font-normal"
                  />
                }
              >
                {formatDateDisplay(selectedDate)}
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0"
                align="start"
                side="bottom"
                sideOffset={4}
                positionMethod="fixed"
                collisionPadding={0}
                collisionAvoidance={{ side: "none", align: "none" }}
              >
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) setSelectedDate(date);
                    setCalendarOpen(false);
                  }}
                  disabled={{ before: new Date() }}
                />
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                placeholder="7"
                value={hour}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  const n = parseInt(v, 10);
                  if (v === "" || (n >= 1 && n <= 12)) setHour(v);
                }}
                className={cn(
                  "h-9 w-10 rounded-lg border border-input bg-input/30 text-center text-sm outline-none transition-colors",
                  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                )}
              />
              <span className="text-sm text-muted-foreground">:</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                placeholder="00"
                value={minute}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  const n = parseInt(v, 10);
                  if (v === "" || (n >= 0 && n <= 59)) setMinute(v);
                }}
                className={cn(
                  "h-9 w-10 rounded-lg border border-input bg-input/30 text-center text-sm outline-none transition-colors",
                  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                )}
              />
              <button
                type="button"
                onClick={() => setPeriod((p) => (p === "AM" ? "PM" : "AM"))}
                className={cn(
                  "h-9 rounded-lg border border-input bg-input/30 px-2.5 text-xs font-medium transition-colors",
                  "hover:bg-input/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
                )}
              >
                {period}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="draft-location" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Location</Label>
          <Input
            id="draft-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="123 Church St, Atlanta, GA"
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
        <Button onClick={handleActivate} disabled={!canActivate || isActivating} className="flex-1 rounded-xl">
          {isActivating ? "Activating…" : "Activate"}
        </Button>
      </div>

      <button
        onClick={handleDelete}
        className="block w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
      >
        Delete draft
      </button>
    </div>
  );
}
