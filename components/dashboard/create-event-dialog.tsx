"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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

function getNextFriday(): Date {
  const d = new Date();
  const day = d.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d;
}

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEventDialog({ open, onOpenChange }: CreateEventDialogProps): React.ReactElement {
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Gethsemane");
  const [location, setLocation] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(getNextFriday());
  const [hour, setHour] = useState("7");
  const [minute, setMinute] = useState("00");
  const [period, setPeriod] = useState<"AM" | "PM">("PM");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const resetForm = useCallback((): void => {
    setStep(1);
    setTitle("Gethsemane");
    setLocation("");
    setSelectedDate(getNextFriday());
    setHour("7");
    setMinute("00");
    setPeriod("PM");
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (open && step === 1) {
      setTimeout(() => titleInputRef.current?.select(), 100);
    }
    if (open && step === 3) {
      setTimeout(() => locationInputRef.current?.focus(), 100);
    }
  }, [open, step]);

  function canAdvance(): boolean {
    if (step === 1) return title.trim() !== "";
    if (step === 2) return selectedDate !== undefined && hour !== "";
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

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        event_date: selectedDate ? formatDateValue(selectedDate) : undefined,
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

    setIsSubmitting(false);
    onOpenChange(false);
    router.refresh();
  }

  const dayLabel = selectedDate ? DAY_LABELS[selectedDate.getDay()] : null;

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
              className="text-base h-12"
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
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => setSelectedDate(date ?? undefined)}
                disabled={{ before: new Date() }}
                className="rounded-xl border mx-auto"
              />
              {selectedDate && (
                <p className="text-center text-sm text-muted-foreground">
                  {dayLabel}, {formatDateDisplay(selectedDate).split(", ").slice(0, -1).join(", ").split(" ").slice(1).join(" ")}
                </p>
              )}
              <div className="flex items-center justify-center gap-1.5">
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
                    "h-11 w-12 rounded-xl border border-input bg-input/30 text-center text-base outline-none transition-colors",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  )}
                />
                <span className="text-lg text-muted-foreground font-medium">:</span>
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
                    "h-11 w-12 rounded-xl border border-input bg-input/30 text-center text-base outline-none transition-colors",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setPeriod((p) => (p === "AM" ? "PM" : "AM"))}
                  className={cn(
                    "h-11 rounded-xl border border-input bg-input/30 px-3 text-sm font-medium transition-colors",
                    "hover:bg-input/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
                  )}
                >
                  {period}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Location */}
        {step === 3 && (
          <div onKeyDown={handleKeyDown}>
            <DialogHeader className="mb-6">
              <DialogTitle className="text-lg">Where is it?</DialogTitle>
            </DialogHeader>
            <Input
              ref={locationInputRef}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="123 Church St, Atlanta, GA"
              className="text-base h-12"
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
              {isSubmitting ? "Creating…" : "Create Event"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
