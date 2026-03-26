"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CreateEventDialogProps {
  hasActiveEvent: boolean;
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

export function CreateEventDialog({ hasActiveEvent }: CreateEventDialogProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Gethsemane");
  const [location, setLocation] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [period, setPeriod] = useState<"AM" | "PM">("PM");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const router = useRouter();

  const isFormComplete = title.trim() !== "" && selectedDate !== undefined && hour !== "" && location.trim() !== "";

  const dayLabel = selectedDate ? DAY_LABELS[selectedDate.getDay()] : null;

  function getTimeValue(): string | null {
    if (!hour) return null;
    let h = parseInt(hour, 10);
    const m = parseInt(minute || "0", 10);
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!selectedDate) {
      setError("Please select a date");
      setIsSubmitting(false);
      return;
    }

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        event_date: formatDateValue(selectedDate),
        event_time: getTimeValue(),
        location,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create event");
      setIsSubmitting(false);
      return;
    }

    setOpen(false);
    setIsSubmitting(false);
    setTitle("Gethsemane");
    setLocation("");
    setSelectedDate(undefined);
    setHour("");
    setMinute("");
    setPeriod("PM");
    setCalendarOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button disabled={hasActiveEvent} />}
      >
        New Event
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Gethsemane"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-1.5">
                <Label>Date</Label>
                {dayLabel && (
                  <span className="text-xs text-muted-foreground">{dayLabel}</span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <Label>Time</Label>
              </div>
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
                  {selectedDate ? formatDateDisplay(selectedDate) : (
                    <span className="text-muted-foreground">Pick a date</span>
                  )}
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
                      setSelectedDate(date ?? undefined);
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
                    "h-9 w-10 rounded-xl border border-input bg-input/30 text-center text-sm outline-none transition-colors",
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
                    "h-9 w-10 rounded-xl border border-input bg-input/30 text-center text-sm outline-none transition-colors",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setPeriod((p) => (p === "AM" ? "PM" : "AM"))}
                  className={cn(
                    "h-9 rounded-xl border border-input bg-input/30 px-2.5 text-xs font-medium transition-colors",
                    "hover:bg-input/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
                  )}
                >
                  {period}
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="123 Church St, Atlanta, GA"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!isFormComplete || isSubmitting} className="w-full">
            {isSubmitting ? "Creating…" : "Create Event"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
