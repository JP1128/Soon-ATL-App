"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { AddressPickerOverlay } from "@/components/ui/address-picker-overlay";
import type { AddressResult } from "@/components/ui/address-picker-overlay";
import { ManualAddressOverlay } from "@/components/ui/manual-address-overlay";
import { TextInputOverlay } from "@/components/ui/text-input-overlay";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import {
  Car01Icon,
  LocationUser01Icon,
  Coffee01Icon,
  CheckmarkCircle02Icon,
  MapsSearchIcon,
  TextIcon,
} from "@hugeicons/core-free-icons";
import type { LegRole } from "@/types/database";

interface ExistingResponse {
  id: string;
  role: string;
  before_role: LegRole | null;
  after_role: LegRole | null;
  pickup_address: string | null;
  return_address: string | null;
  departure_time: string | null;
  available_seats: number | null;
  needs_return_ride: boolean;
  note: string | null;
}

interface EventFormProps {
  eventId: string;
  eventTitle: string;
  existingResponse: ExistingResponse | null;
}

function parseTime(time: string): { hour: string; minute: string; period: string } {
  if (!time) return { hour: "", minute: "", period: "PM" };
  const [h, m] = time.split(":");
  const hour24 = parseInt(h, 10);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  return { hour: hour12.toString(), minute: m, period };
}

function toTime24(hour: string, minute: string, period: string): string {
  if (!hour || !minute) return "";
  let h = parseInt(hour, 10);
  if (period === "AM" && h === 12) h = 0;
  else if (period === "PM" && h !== 12) h += 12;
  return `${h.toString().padStart(2, "0")}:${minute}`;
}

export function EventForm({
  eventId,
  eventTitle,
  existingResponse,
}: EventFormProps): React.ReactElement {
  const initialBeforeRole: LegRole | null =
    existingResponse?.before_role ??
    (existingResponse?.role === "driver" || existingResponse?.role === "rider"
      ? (existingResponse.role as LegRole)
      : null);
  const initialAfterRole: LegRole | null =
    existingResponse?.after_role ??
    (existingResponse?.needs_return_ride && existingResponse?.role === "driver"
      ? "driver"
      : existingResponse?.needs_return_ride && existingResponse?.role === "rider"
        ? "rider"
        : null);

  const initialTime = parseTime(existingResponse?.departure_time ?? "");

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [stepKey, setStepKey] = useState(0);
  const [beforeRole, setBeforeRole] = useState<LegRole | null>(initialBeforeRole);
  const [afterRole, setAfterRole] = useState<LegRole | null>(initialAfterRole);

  const [beforeAddress, setBeforeAddress] = useState(
    existingResponse?.pickup_address ?? ""
  );
  const [beforeLat, setBeforeLat] = useState<number>(0);
  const [beforeLng, setBeforeLng] = useState<number>(0);
  const [beforeAddressType, setBeforeAddressType] = useState<"search" | "manual">("search");
  const [beforeAddressMode, setBeforeAddressMode] = useState<"search" | "manual" | null>(null);
  const [timeHour, setTimeHour] = useState(initialTime.hour);
  const [timeMinute, setTimeMinute] = useState(initialTime.minute);
  const [timePeriod, setTimePeriod] = useState(initialTime.period);
  const [availableSeats, setAvailableSeats] = useState(
    existingResponse?.available_seats?.toString() ?? "3"
  );

  const [afterAddress, setAfterAddress] = useState(
    existingResponse?.return_address ?? ""
  );
  const [afterLat, setAfterLat] = useState<number>(0);
  const [afterLng, setAfterLng] = useState<number>(0);
  const [afterAddressType, setAfterAddressType] = useState<"search" | "manual">("search");
  const [afterAddressMode, setAfterAddressMode] = useState<"search" | "manual" | null>(null);

  const [note, setNote] = useState(existingResponse?.note ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  // Increment keys to re-trigger mount animations on icon swap
  const [iconKeys, setIconKeys] = useState<Record<string, number>>({});
  function triggerAnim(key: string): void {
    setIconKeys((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  }

  const isAttendingOnly = !beforeRole && !afterRole;

  const departureTime = useMemo(
    () => toTime24(timeHour, timeMinute, timePeriod),
    [timeHour, timeMinute, timePeriod]
  );

  function getNextStep(current: number): number {
    if (current === 0) {
      if (beforeRole) return 1;
      if (afterRole) return 2;
      return 3;
    }
    if (current === 1) return afterRole ? 2 : 3;
    if (current === 2) return 3;
    return current;
  }

  function getPrevStep(current: number): number {
    if (current === 3) {
      if (afterRole) return 2;
      if (beforeRole) return 1;
      return 0;
    }
    if (current === 2) return beforeRole ? 1 : 0;
    if (current === 1) return 0;
    return 0;
  }

  function canProceed(): boolean {
    if (step === 0) return true;
    if (step === 1) {
      if (!beforeAddress.trim()) return false;
      if (!timeHour || !timeMinute) return false;
      if (
        beforeRole === "driver" &&
        (!availableSeats || parseInt(availableSeats, 10) < 1)
      )
        return false;
      return true;
    }
    if (step === 2) {
      if (!afterAddress.trim()) return false;
      if (
        afterRole === "driver" &&
        beforeRole !== "driver" &&
        (!availableSeats || parseInt(availableSeats, 10) < 1)
      )
        return false;
      return true;
    }
    return true;
  }

  const visibleStepIds = [
    0,
    ...(beforeRole ? [1] : []),
    ...(afterRole ? [2] : []),
    3,
  ];
  const currentStepIndex = visibleStepIds.indexOf(step);

  const prevVisibleRef = useRef<number[]>(visibleStepIds);
  const [newDots, setNewDots] = useState<Set<number>>(new Set());

  useEffect(() => {
    const prev = prevVisibleRef.current;
    const added = new Set<number>();
    visibleStepIds.forEach((id) => {
      if (!prev.includes(id)) added.add(id);
    });
    if (added.size > 0) {
      setNewDots(added);
      const timer = setTimeout(() => setNewDots(new Set()), 400);
      prevVisibleRef.current = visibleStepIds;
      return () => clearTimeout(timer);
    }
    prevVisibleRef.current = visibleStepIds;
  }, [beforeRole, afterRole]);

  function handleNext(): void {
    if (!canProceed()) return;
    setDirection("forward");
    setStepKey((k) => k + 1);
    setStep(getNextStep(step));
  }

  function handleBack(): void {
    setDirection("backward");
    setStepKey((k) => k + 1);
    setStep(getPrevStep(step));
  }

  async function handleSubmit(): Promise<void> {
    setIsSubmitting(true);
    setError(null);

    let role = "attending";
    if (beforeRole) role = beforeRole;
    else if (afterRole) role = afterRole;

    const payload = {
      role,
      before_role: beforeRole,
      after_role: afterRole,
      pickup_address: beforeAddress || null,
      pickup_lat: beforeLat || null,
      pickup_lng: beforeLng || null,
      return_address: afterAddress || null,
      return_lat: afterLat || null,
      return_lng: afterLng || null,
      departure_time: departureTime || null,
      available_seats:
        beforeRole === "driver" || afterRole === "driver"
          ? parseInt(availableSeats, 10)
          : null,
      needs_return_ride: afterRole !== null,
      note: note || null,
    };

    try {
      const res = await fetch(`/api/responses/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit response");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-foreground/5">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-6" />
        </div>
        <p className="text-lg font-semibold tracking-tight">
          You&apos;re all set!
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We&apos;ll notify you when carpool assignments are ready.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            setSubmitted(false);
            setStep(0);
          }}
        >
          Edit response
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 tall:space-y-5 xtall:space-y-8">
      {/* Progress bar */}
      <div className="flex items-center justify-center gap-1.5">
        {visibleStepIds.map((stepId, i) => (
          <div
            key={stepId}
            className={`h-1 rounded-full transition-all duration-300 ${
              i <= currentStepIndex
                ? "w-10 bg-foreground"
                : "w-6 bg-foreground/10"
            }`}
            style={
              newDots.has(stepId)
                ? { animation: "stepper-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }
                : undefined
            }
          />
        ))}
      </div>

      <div className="relative overflow-hidden">
        <div
          key={stepKey}
          style={{
            animation: `${direction === "forward" ? "slide-in-right" : "slide-in-left"} 0.35s cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
        >

      {/* Step 0: Selection */}
      {step === 0 && (
        <div className="space-y-4 tall:space-y-5 xtall:space-y-8">
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight tall:text-xl">
              How would you like to participate?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select all that apply
            </p>
          </div>

          {/* Before the event */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              Before {eventTitle}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  const next = beforeRole === "rider" ? null : "rider";
                  setBeforeRole(next);
                  if (next) triggerAnim("before-rider");
                }}
                className={`flex flex-col items-center gap-1.5 xtall:gap-2 rounded-2xl border px-4 py-3 tall:py-3.5 xtall:py-5 text-center transition-all ${
                  beforeRole === "rider"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/20 hover:bg-muted/50"
                }`}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={iconKeys["before-rider"] ?? 0}
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    className="inline-flex"
                  >
                    <HugeiconsIcon icon={LocationUser01Icon} className="size-5 xtall:size-6" strokeWidth={1.5} />
                  </motion.span>
                </AnimatePresence>
                <span className="text-sm font-medium">Need a ride</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = beforeRole === "driver" ? null : "driver";
                  setBeforeRole(next);
                  if (next) triggerAnim("before-driver");
                }}
                className={`flex flex-col items-center gap-1.5 xtall:gap-2 rounded-2xl border px-4 py-3 tall:py-3.5 xtall:py-5 text-center transition-all overflow-hidden ${
                  beforeRole === "driver"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/20 hover:bg-muted/50"
                }`}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={iconKeys["before-driver"] ?? 0}
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="inline-flex"
                  >
                    <HugeiconsIcon icon={Car01Icon} className="size-5 xtall:size-6" strokeWidth={1.5} />
                  </motion.span>
                </AnimatePresence>
                <span className="text-sm font-medium">Can drive</span>
              </button>
            </div>
          </div>

          {/* After the event */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              After {eventTitle}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  const next = afterRole === "rider" ? null : "rider";
                  setAfterRole(next);
                  if (next) triggerAnim("after-rider");
                }}
                className={`flex flex-col items-center gap-1.5 xtall:gap-2 rounded-2xl border px-4 py-3 tall:py-3.5 xtall:py-5 text-center transition-all ${
                  afterRole === "rider"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/20 hover:bg-muted/50"
                }`}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={iconKeys["after-rider"] ?? 0}
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    className="inline-flex"
                  >
                    <HugeiconsIcon icon={LocationUser01Icon} className="size-5 xtall:size-6" strokeWidth={1.5} />
                  </motion.span>
                </AnimatePresence>
                <span className="text-sm font-medium">Need a ride</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = afterRole === "driver" ? null : "driver";
                  setAfterRole(next);
                  if (next) triggerAnim("after-driver");
                }}
                className={`flex flex-col items-center gap-1.5 xtall:gap-2 rounded-2xl border px-4 py-3 tall:py-3.5 xtall:py-5 text-center transition-all overflow-hidden ${
                  afterRole === "driver"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/20 hover:bg-muted/50"
                }`}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={iconKeys["after-driver"] ?? 0}
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="inline-flex"
                  >
                    <HugeiconsIcon icon={Car01Icon} className="size-5 xtall:size-6" strokeWidth={1.5} />
                  </motion.span>
                </AnimatePresence>
                <span className="text-sm font-medium">Can drive</span>
              </button>
            </div>
          </div>

          {/* Neither */}
          <button
            type="button"
            onClick={() => {
              setBeforeRole(null);
              setAfterRole(null);
              triggerAnim("neither");
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 tall:py-3 xtall:py-4 text-center transition-all ${
              isAttendingOnly
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:border-foreground/20 hover:bg-muted/50"
            }`}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={iconKeys["neither"] ?? 0}
                initial={{ rotate: -15, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 12 }}
                className="inline-flex"
              >
                <HugeiconsIcon icon={Coffee01Icon} className="size-5" strokeWidth={1.5} />
              </motion.span>
            </AnimatePresence>
            <span className="text-sm font-medium">
              Neither — just attending
            </span>
          </button>

          <Button onClick={handleNext} className="w-full" size="lg">
            Continue
          </Button>
        </div>
      )}

      {/* Step 1: Before the event details */}
      {step === 1 && (
        <div className="space-y-4 tall:space-y-5 xtall:space-y-8">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back
            </button>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">
              {beforeRole === "driver" ? "Driving details" : "Pickup details"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Before {eventTitle}
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2.5">
              <Label>
                {beforeRole === "driver"
                  ? "Latest departure time"
                  : "Earliest pickup time"}
              </Label>
              <button
                type="button"
                onClick={() => setTimeOpen(true)}
                className="flex h-9 w-full items-center rounded-4xl border border-input bg-input/30 px-3 text-base tabular-nums transition-colors hover:bg-input/50"
              >
                {timeHour || "––"}<span className="text-muted-foreground mx-0.5">:</span>{timeMinute || "––"} {timePeriod || "PM"}
              </button>
              <TimeWheelPicker
                open={timeOpen}
                onClose={() => setTimeOpen(false)}
                hour={timeHour || "7"}
                minute={timeMinute || "00"}
                period={timePeriod || "PM"}
                onChangeHour={(h) => setTimeHour(h)}
                onChangeMinute={(m) => setTimeMinute(m)}
                onChangePeriod={(p) => setTimePeriod(p)}
                title={beforeRole === "driver" ? "Latest departure time" : "Earliest pickup time"}
              />
            </div>

            <div className="space-y-2.5">
              <Label>
                {beforeRole === "driver"
                  ? "Departing from"
                  : "Pickup location"}
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBeforeAddressType((t) => (t === "search" ? "manual" : "search"))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border transition-all hover:bg-muted/50"
                  aria-label={beforeAddressType === "search" ? "Switch to manual entry" : "Switch to address search"}
                >
                  <HugeiconsIcon
                    icon={beforeAddressType === "search" ? MapsSearchIcon : TextIcon}
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setBeforeAddressMode(beforeAddressType)}
                  className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-4xl border border-input bg-input/30 px-3 text-sm transition-colors hover:bg-input/50"
                >
                  {beforeAddress ? (
                    <span className="truncate">{beforeAddress}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {beforeAddressType === "search" ? "Search address..." : "Enter address..."}
                    </span>
                  )}
                </button>
              </div>
              <AddressPickerOverlay
                open={beforeAddressMode === "search"}
                onClose={() => setBeforeAddressMode(null)}
                mode="search"
                onConfirm={(result: AddressResult) => {
                  setBeforeAddress(result.address);
                  setBeforeLat(result.lat);
                  setBeforeLng(result.lng);
                }}
                initialAddress={beforeAddress}
                initialLat={beforeLat}
                initialLng={beforeLng}
                title={beforeRole === "driver" ? "Departing from" : "Pickup location"}
              />
              <ManualAddressOverlay
                open={beforeAddressMode === "manual"}
                onClose={() => setBeforeAddressMode(null)}
                onConfirm={(address: string) => {
                  setBeforeAddress(address);
                  setBeforeLat(0);
                  setBeforeLng(0);
                }}
                initialAddress={beforeAddress}
                title={beforeRole === "driver" ? "Departing from" : "Pickup location"}
              />
            </div>

            {beforeRole === "driver" && (
              <div className="space-y-2.5">
                <Label>Available seats</Label>
                <p className="-mt-1 text-xs text-muted-foreground">
                  Not counting yourself
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setAvailableSeats((prev) =>
                        Math.max(1, parseInt(prev, 10) - 1).toString()
                      )
                    }
                    disabled={parseInt(availableSeats, 10) <= 1}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center text-lg font-semibold tabular-nums">
                    {availableSeats}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setAvailableSeats((prev) =>
                        Math.min(15, parseInt(prev, 10) + 1).toString()
                      )
                    }
                    disabled={parseInt(availableSeats, 10) >= 15}
                  >
                    +
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="w-full"
            size="lg"
          >
            Continue
          </Button>
        </div>
      )}

      {/* Step 2: After the event details */}
      {step === 2 && (
        <div className="space-y-4 tall:space-y-5 xtall:space-y-8">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back
            </button>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">
              {afterRole === "driver" ? "Driving details" : "Drop-off details"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              After {eventTitle}
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2.5">
              <Label>
                {afterRole === "driver"
                  ? "Heading to"
                  : "Drop-off destination"}
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAfterAddressType((t) => (t === "search" ? "manual" : "search"))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border transition-all hover:bg-muted/50"
                  aria-label={afterAddressType === "search" ? "Switch to manual entry" : "Switch to address search"}
                >
                  <HugeiconsIcon
                    icon={afterAddressType === "search" ? MapsSearchIcon : TextIcon}
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setAfterAddressMode(afterAddressType)}
                  className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-4xl border border-input bg-input/30 px-3 text-sm transition-colors hover:bg-input/50"
                >
                  {afterAddress ? (
                    <span className="truncate">{afterAddress}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {afterAddressType === "search" ? "Search address..." : "Enter address..."}
                    </span>
                  )}
                </button>
              </div>
              <AddressPickerOverlay
                open={afterAddressMode === "search"}
                onClose={() => setAfterAddressMode(null)}
                mode="search"
                onConfirm={(result: AddressResult) => {
                  setAfterAddress(result.address);
                  setAfterLat(result.lat);
                  setAfterLng(result.lng);
                }}
                initialAddress={afterAddress}
                initialLat={afterLat}
                initialLng={afterLng}
                title={afterRole === "driver" ? "Heading to" : "Drop-off destination"}
              />
              <ManualAddressOverlay
                open={afterAddressMode === "manual"}
                onClose={() => setAfterAddressMode(null)}
                onConfirm={(address: string) => {
                  setAfterAddress(address);
                  setAfterLat(0);
                  setAfterLng(0);
                }}
                initialAddress={afterAddress}
                title={afterRole === "driver" ? "Heading to" : "Drop-off destination"}
              />
            </div>

            {afterRole === "driver" && beforeRole !== "driver" && (
              <div className="space-y-2.5">
                <Label>Available seats</Label>
                <p className="-mt-1 text-xs text-muted-foreground">
                  Not counting yourself
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setAvailableSeats((prev) =>
                        Math.max(1, parseInt(prev, 10) - 1).toString()
                      )
                    }
                    disabled={parseInt(availableSeats, 10) <= 1}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center text-lg font-semibold tabular-nums">
                    {availableSeats}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setAvailableSeats((prev) =>
                        Math.min(15, parseInt(prev, 10) + 1).toString()
                      )
                    }
                    disabled={parseInt(availableSeats, 10) >= 15}
                  >
                    +
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="w-full"
            size="lg"
          >
            Continue
          </Button>
        </div>
      )}

      {/* Step 3: Additional note & submit */}
      {step === 3 && (
        <div className="space-y-4 tall:space-y-5 xtall:space-y-8">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back
            </button>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">
              Anything else?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional — add a note for your driver or riders
            </p>
          </div>

          <div className="space-y-2.5">
            <Label>Note</Label>
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="flex min-h-9 w-full items-start rounded-4xl border border-input bg-input/30 px-3 py-2 text-sm text-left transition-colors hover:bg-input/50"
            >
              {note ? (
                <span className="line-clamp-2">{note}</span>
              ) : (
                <span className="text-muted-foreground">
                  e.g. I&apos;ll be at the main entrance, bringing a large bag, etc.
                </span>
              )}
            </button>
            <TextInputOverlay
              open={noteOpen}
              onClose={() => setNoteOpen(false)}
              onConfirm={(value) => setNote(value)}
              initialValue={note}
              title="Note"
              placeholder="e.g. I'll be at the main entrance, bringing a large bag, etc."
              multiline
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full"
            size="lg"
          >
            {isSubmitting
              ? "Submitting…"
              : existingResponse
                ? "Update Response"
                : "Submit Response"}
          </Button>
        </div>
      )}

        </div>
      </div>
    </div>
  );
}
