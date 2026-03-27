"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { DatePickerOverlay } from "@/components/ui/date-picker-overlay";
import { AddressPickerOverlay } from "@/components/ui/address-picker-overlay";
import type { AddressResult } from "@/components/ui/address-picker-overlay";
import { ManualAddressOverlay } from "@/components/ui/manual-address-overlay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { MapsSearchIcon, TextIcon } from "@hugeicons/core-free-icons";
import type { Event } from "@/types/database";

type Step = 1 | 2 | 3;

const TOTAL_STEPS = 3;

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
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

interface EditEventDialogProps {
  event: Event;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEventDialog({ event, open, onOpenChange }: EditEventDialogProps): React.ReactElement {
  const parsedTime = parseEventTime(event.event_time);

  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(event.title);
  const [location, setLocation] = useState(event.location);
  const [selectedDate, setSelectedDate] = useState<Date>(parseEventDate(event.event_date));
  const [hour, setHour] = useState(parsedTime.hour);
  const [minute, setMinute] = useState(parsedTime.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(parsedTime.period);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [locationType, setLocationType] = useState<"search" | "manual">("search");
  const [locationMode, setLocationMode] = useState<"search" | "manual" | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const resetForm = useCallback((): void => {
    const parsed = parseEventTime(event.event_time);
    setStep(1);
    setTitle(event.title);
    setLocation(event.location);
    setSelectedDate(parseEventDate(event.event_date));
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setPeriod(parsed.period);
    setError(null);
  }, [event]);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (open && step === 1) {
      setTimeout(() => titleInputRef.current?.select(), 100);
    }
  }, [open, step]);

  function canAdvance(): boolean {
    if (step === 1) return title.trim() !== "";
    if (step === 2) return hour !== "";
    if (step === 3) return location.trim() !== "";
    return false;
  }

  function getTimeValue(): string | null {
    if (!hour) return null;
    let h = parseInt(hour, 10);
    const m = parseInt(minute || "0", 10);
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function handleNext(): void {
    if (!canAdvance()) return;
    if (step < TOTAL_STEPS) {
      setStep((s) => (s + 1) as Step);
    }
  }

  function handleBack(): void {
    if (step > 1) {
      setStep((s) => (s - 1) as Step);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" && canAdvance()) {
      e.preventDefault();
      if (step < TOTAL_STEPS) {
        handleNext();
      } else {
        void handleSubmit();
      }
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!canAdvance()) return;
    setIsSubmitting(true);
    setError(null);

    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
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
      setError(data.error || "Failed to update event");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onOpenChange(false);
    router.refresh();
  }

  const dayLabel = DAY_LABELS[selectedDate.getDay()];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                s === step ? "w-6 bg-primary" : s < step ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted-foreground/20"
              )}
            />
          ))}
        </div>

        {/* Step 1: Title */}
        {step === 1 && (
          <div onKeyDown={handleKeyDown}>
            <DialogHeader className="mb-6">
              <DialogTitle className="text-lg">What&apos;s the event called?</DialogTitle>
            </DialogHeader>
            <Input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event name"
              autoFocus
            />
          </div>
        )}

        {/* Step 2: Date & Time */}
        {step === 2 && (
          <div onKeyDown={handleKeyDown}>
            <DialogHeader className="mb-6">
              <DialogTitle className="text-lg">When is it?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-1.5">
                  <p className="flex-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</p>
                  <p className="min-w-28 text-xs font-medium uppercase tracking-wider text-muted-foreground">Time</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(true)}
                    className="flex h-9 flex-1 items-center rounded-4xl border border-input bg-input/30 px-3 text-sm transition-colors hover:bg-input/50"
                  >
                    <span>{dayLabel}, {formatDateDisplay(selectedDate).split(", ").slice(0, -1).join(", ").split(" ").slice(1).join(" ")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeOpen(true)}
                    className="flex h-9 min-w-28 items-center justify-center gap-1 rounded-4xl border border-input bg-input/30 px-3 text-sm tabular-nums transition-colors hover:bg-input/50"
                  >
                    {hour || "–"}<span className="text-muted-foreground">:</span>{minute || "00"} {period}
                  </button>
                </div>
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
          </div>
        )}

        {/* Step 3: Location */}
        {step === 3 && (
          <div onKeyDown={handleKeyDown} className="min-w-0">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-lg">Where is it?</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2 min-w-0">
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
        )}

        {/* Error */}
        {error && <p className="text-sm text-destructive mt-4">{error}</p>}

        {/* Navigation buttons */}
        <div className="flex items-center gap-3 mt-6">
          {step > 1 && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              className="px-4"
            >
              Back
            </Button>
          )}
          <div className="flex-1" />
          {step < TOTAL_STEPS ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance()}
              className="px-6"
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canAdvance() || isSubmitting}
              className="px-6"
            >
              {isSubmitting ? "Saving…" : "Save Changes"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
