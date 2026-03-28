"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Car01Icon,
  LocationUser01Icon,
  Coffee01Icon,
  MapsSearchIcon,
  TextIcon,
} from "@hugeicons/core-free-icons";
import { FieldOverlay } from "@/components/ui/field-overlay";
import { AddressPickerOverlay } from "@/components/ui/address-picker-overlay";
import type { AddressResult } from "@/components/ui/address-picker-overlay";
import { ManualAddressOverlay } from "@/components/ui/manual-address-overlay";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { LegRole } from "@/types/database";

type EditRole = LegRole | "attending";

interface RoleEditOverlayProps {
  open: boolean;
  onClose: () => void;
  leg: "before" | "after";
  eventId: string;
  eventTitle: string;
  currentRole: LegRole | null;
  currentAddress: string | null;
  currentLat: number | null;
  currentLng: number | null;
  currentDepartureTime: string | null;
  currentAvailableSeats: number | null;
  currentNote: string | null;
}

function toEditRole(role: LegRole | null): EditRole {
  return role ?? "attending";
}

function fromEditRole(role: EditRole): LegRole | null {
  return role === "attending" ? null : role;
}

function parseTime(time: string | null): { hour: string; minute: string; period: string } {
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

export function RoleEditOverlay({
  open,
  onClose,
  leg,
  eventId,
  eventTitle,
  currentRole,
  currentAddress,
  currentLat,
  currentLng,
  currentDepartureTime,
  currentAvailableSeats,
  currentNote,
}: RoleEditOverlayProps): React.ReactElement | null {
  const router = useRouter();

  // Step: 0 = role, 1 = location/time, 2 = note
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<EditRole>(toEditRole(currentRole));
  const [iconKeys, setIconKeys] = useState<Record<string, number>>({});

  // Location/time state
  const [address, setAddress] = useState(currentAddress ?? "");
  const [addressLat, setAddressLat] = useState(currentLat ?? 0);
  const [addressLng, setAddressLng] = useState(currentLng ?? 0);
  const [addressType, setAddressType] = useState<"search" | "manual">("search");
  const [addressMode, setAddressMode] = useState<"search" | "manual" | null>(null);

  const initialTime = parseTime(currentDepartureTime);
  const [timeHour, setTimeHour] = useState(initialTime.hour);
  const [timeMinute, setTimeMinute] = useState(initialTime.minute);
  const [timePeriod, setTimePeriod] = useState(initialTime.period);
  const [timeOpen, setTimeOpen] = useState(false);

  const [seats, setSeats] = useState(currentAvailableSeats?.toString() ?? "3");

  // Note state
  const [note, setNote] = useState(currentNote ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when overlay opens
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setStep(0);
    setSelected(toEditRole(currentRole));
    setIconKeys({});
    setAddress(currentAddress ?? "");
    setAddressLat(currentLat ?? 0);
    setAddressLng(currentLng ?? 0);
    setAddressMode(null);
    const t = parseTime(currentDepartureTime);
    setTimeHour(t.hour);
    setTimeMinute(t.minute);
    setTimePeriod(t.period);
    setSeats(currentAvailableSeats?.toString() ?? "3");
    setNote(currentNote ?? "");
    setIsSubmitting(false);
  }
  if (open !== prevOpen) setPrevOpen(open);

  function triggerAnim(key: string): void {
    setIconKeys((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  }

  function handleSelect(role: EditRole): void {
    if (role === selected) return;
    setSelected(role);
    triggerAnim(role);
  }

  function handleContinueFromRole(): void {
    const role = fromEditRole(selected);
    if (role === "rider" || role === "driver") {
      setStep(1);
    } else {
      // "attending" — skip to note
      setStep(2);
    }
  }

  function handleContinueFromDetails(): void {
    setStep(2);
  }

  const departureTime = useMemo(
    () => toTime24(timeHour, timeMinute, timePeriod),
    [timeHour, timeMinute, timePeriod]
  );

  async function handleSubmit(): Promise<void> {
    setIsSubmitting(true);
    const role = fromEditRole(selected);

    // Build a partial payload that updates only this leg's fields
    // We need to fetch the current full response first to preserve the other leg
    try {
      const getRes = await fetch(`/api/responses/${eventId}`);
      if (!getRes.ok) {
        setIsSubmitting(false);
        return;
      }
      const existing = await getRes.json();

      const isBefore = leg === "before";
      const payload = {
        role: role ?? (isBefore ? (existing.after_role ?? "attending") : (existing.before_role ?? "attending")),
        before_role: isBefore ? role : existing.before_role,
        after_role: isBefore ? existing.after_role : role,
        pickup_address: isBefore ? (address || null) : existing.pickup_address,
        pickup_lat: isBefore ? (addressLat || null) : existing.pickup_lat,
        pickup_lng: isBefore ? (addressLng || null) : existing.pickup_lng,
        return_address: isBefore ? existing.return_address : (address || null),
        return_lat: isBefore ? existing.return_lat : (addressLat || null),
        return_lng: isBefore ? existing.return_lng : (addressLng || null),
        departure_time: departureTime || existing.departure_time || null,
        available_seats:
          role === "driver" || existing.before_role === "driver" || existing.after_role === "driver"
            ? parseInt(seats, 10)
            : existing.available_seats,
        needs_return_ride: isBefore ? (existing.after_role !== null) : (role !== null),
        note: note || null,
      };

      const res = await fetch(`/api/responses/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onClose();
        router.refresh();
      }
    } catch {
      // silently fail
    } finally {
      setIsSubmitting(false);
    }
  }

  const overlayTitle = step === 0
    ? `${leg === "before" ? "Before" : "After"} ${eventTitle}`
    : step === 1
      ? selected === "driver" ? "Driving details" : "Pickup details"
      : "Add a note";

  return (
    <>
    <FieldOverlay
      open={open}
      onClose={onClose}
      title={overlayTitle}
    >
      {/* Step 0: Role selection */}
      {step === 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {/* Rider */}
            <button
              type="button"
              onClick={() => handleSelect("rider")}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition-all ${
                selected === "rider"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:border-foreground/20 hover:bg-muted/50"
              }`}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={iconKeys["rider"] ?? 0}
                  initial={iconKeys["rider"] ? { y: -20, opacity: 0 } : false}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="inline-flex"
                >
                  <HugeiconsIcon icon={LocationUser01Icon} className="size-5" strokeWidth={1.5} />
                </motion.span>
              </AnimatePresence>
              <span className="text-xs font-medium">Need a ride</span>
            </button>

            {/* Driver */}
            <button
              type="button"
              onClick={() => handleSelect("driver")}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition-all overflow-hidden ${
                selected === "driver"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:border-foreground/20 hover:bg-muted/50"
              }`}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={iconKeys["driver"] ?? 0}
                  initial={iconKeys["driver"] ? { x: -50, opacity: 0 } : false}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className="inline-flex"
                >
                  <HugeiconsIcon icon={Car01Icon} className="size-5" strokeWidth={1.5} />
                </motion.span>
              </AnimatePresence>
              <span className="text-xs font-medium">Can drive</span>
            </button>

            {/* Neither */}
            <button
              type="button"
              onClick={() => handleSelect("attending")}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition-all ${
                selected === "attending"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:border-foreground/20 hover:bg-muted/50"
              }`}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={iconKeys["attending"] ?? 0}
                  initial={iconKeys["attending"] ? { rotate: -15, scale: 0.8 } : false}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 12 }}
                  className="inline-flex"
                >
                  <HugeiconsIcon icon={Coffee01Icon} className="size-5" strokeWidth={1.5} />
                </motion.span>
              </AnimatePresence>
              <span className="text-xs font-medium">Neither</span>
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={handleContinueFromRole} className="w-full" size="lg">
              Continue
            </Button>
            <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground" size="lg">
              Cancel
            </Button>
          </div>
        </>
      )}

      {/* Step 1: Location & time */}
      {step === 1 && (
        <>
          <div className="space-y-5">
            <div className="space-y-2.5">
              <Label>
                {selected === "driver"
                  ? leg === "before" ? "Departing from" : "Heading to"
                  : leg === "before" ? "Pickup location" : "Drop-off destination"}
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddressType((t) => (t === "search" ? "manual" : "search"))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border transition-all hover:bg-muted/50"
                >
                  <HugeiconsIcon
                    icon={addressType === "search" ? MapsSearchIcon : TextIcon}
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setAddressMode(addressType)}
                  className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-4xl border border-input bg-input/30 px-3 text-sm transition-colors hover:bg-input/50"
                >
                  {address ? (
                    <span className="truncate">{address}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {addressType === "search" ? "Search address..." : "Enter address..."}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {leg === "before" && (
              <div className="space-y-2.5">
                <Label>
                  {selected === "driver" ? "Latest departure time" : "Earliest pickup time"}
                </Label>
                <button
                  type="button"
                  onClick={() => setTimeOpen(true)}
                  className="flex h-9 w-full items-center rounded-4xl border border-input bg-input/30 px-3 text-sm tabular-nums transition-colors hover:bg-input/50"
                >
                  {timeHour || "––"}<span className="text-muted-foreground mx-0.5">:</span>{timeMinute || "––"} {timePeriod || "PM"}
                </button>
              </div>
            )}

            {selected === "driver" && (
              <div className="space-y-2.5">
                <Label>Available seats</Label>
                <p className="-mt-1 text-xs text-muted-foreground">Not counting yourself</p>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSeats((prev) => Math.max(1, parseInt(prev, 10) - 1).toString())}
                    disabled={parseInt(seats, 10) <= 1}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center text-lg font-semibold tabular-nums">{seats}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSeats((prev) => Math.min(15, parseInt(prev, 10) + 1).toString())}
                    disabled={parseInt(seats, 10) >= 15}
                  >
                    +
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={handleContinueFromDetails} className="w-full" size="lg">
              Continue
            </Button>
            <Button variant="ghost" onClick={() => setStep(0)} className="w-full text-muted-foreground" size="lg">
              Back
            </Button>
          </div>
        </>
      )}

      {/* Step 2: Note */}
      {step === 2 && (
        <>
          <div className="space-y-2.5">
            <Label>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the organizer should know..."
              maxLength={500}
              rows={3}
              className="w-full rounded-2xl border border-input bg-input/30 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/50 resize-none"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full" size="lg">
              {isSubmitting ? "Submitting..." : "Submit Change"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const role = fromEditRole(selected);
                setStep(role === "rider" || role === "driver" ? 1 : 0);
              }}
              className="w-full text-muted-foreground"
              size="lg"
            >
              Back
            </Button>
          </div>
        </>
      )}
    </FieldOverlay>

    {/* Sub-overlays for address and time — rendered outside FieldOverlay */}
    <AddressPickerOverlay
      open={addressMode === "search"}
      onClose={() => setAddressMode(null)}
      mode="search"
      onConfirm={(result: AddressResult) => {
        setAddress(result.address);
        setAddressLat(result.lat);
        setAddressLng(result.lng);
      }}
      initialAddress={address}
      initialLat={addressLat || undefined}
      initialLng={addressLng || undefined}
      title={selected === "driver"
        ? (leg === "before" ? "Departing from" : "Heading to")
        : (leg === "before" ? "Pickup location" : "Drop-off destination")}
    />
    <ManualAddressOverlay
      open={addressMode === "manual"}
      onClose={() => setAddressMode(null)}
      onConfirm={(addr: string) => {
        setAddress(addr);
        setAddressLat(0);
        setAddressLng(0);
      }}
      initialAddress={address}
      title={selected === "driver"
        ? (leg === "before" ? "Departing from" : "Heading to")
        : (leg === "before" ? "Pickup location" : "Drop-off destination")}
    />
    <TimeWheelPicker
      open={timeOpen}
      onClose={() => setTimeOpen(false)}
      hour={timeHour || "7"}
      minute={timeMinute || "00"}
      period={timePeriod || "PM"}
      onChangeHour={(h) => setTimeHour(h)}
      onChangeMinute={(m) => setTimeMinute(m)}
      onChangePeriod={(p) => setTimePeriod(p)}
      title={selected === "driver" ? "Latest departure time" : "Earliest pickup time"}
    />
    </>
  );
}
