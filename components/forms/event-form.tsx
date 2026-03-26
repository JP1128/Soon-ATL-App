"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { ResponseRole, PreferenceType } from "@/types/database";

interface Member {
  id: string;
  full_name: string;
  email: string;
}

interface ExistingPreference {
  id: string;
  target_user_id: string;
  type: PreferenceType;
}

interface ExistingResponse {
  id: string;
  role: ResponseRole;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  needs_return_ride: boolean;
  return_address: string | null;
  return_lat: number | null;
  return_lng: number | null;
  available_seats: number | null;
  preferences: ExistingPreference[];
}

interface EventFormProps {
  eventId: string;
  members: Member[];
  existingResponse: ExistingResponse | null;
  defaultRole?: string | null;
}

interface PreferenceEntry {
  target_user_id: string;
  type: PreferenceType;
}

const ROLE_OPTIONS: { value: ResponseRole; label: string; description: string }[] = [
  { value: "driver", label: "Driver", description: "I can drive and give rides" },
  { value: "rider", label: "Rider", description: "I need a ride" },
  { value: "attending", label: "Attending Only", description: "I'll get there on my own" },
];

export function EventForm({
  eventId,
  members,
  existingResponse,
  defaultRole,
}: EventFormProps): React.ReactElement {
  const router = useRouter();
  const [role, setRole] = useState<ResponseRole | null>(
    existingResponse?.role ?? (defaultRole as ResponseRole | null) ?? null
  );
  const [pickupAddress, setPickupAddress] = useState(
    existingResponse?.pickup_address ?? ""
  );
  const [availableSeats, setAvailableSeats] = useState(
    existingResponse?.available_seats?.toString() ?? "3"
  );
  const [needsReturnRide, setNeedsReturnRide] = useState(
    existingResponse?.needs_return_ride ?? false
  );
  const [returnAddress, setReturnAddress] = useState(
    existingResponse?.return_address ?? ""
  );
  const [preferences, setPreferences] = useState<PreferenceEntry[]>(
    existingResponse?.preferences?.map((p) => ({
      target_user_id: p.target_user_id,
      type: p.type,
    })) ?? []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addPreference(targetUserId: string, type: PreferenceType): void {
    // Don't add duplicate
    if (preferences.some((p) => p.target_user_id === targetUserId)) return;
    setPreferences([...preferences, { target_user_id: targetUserId, type }]);
  }

  function removePreference(targetUserId: string): void {
    setPreferences(preferences.filter((p) => p.target_user_id !== targetUserId));
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!role) return;

    setIsSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      role,
      preferences,
    };

    if (role === "driver" || role === "rider") {
      payload.pickup_address = pickupAddress;
      // Coordinates will be geocoded later via Google Maps integration
      payload.pickup_lat = null;
      payload.pickup_lng = null;
    }

    if (role === "driver") {
      payload.available_seats = parseInt(availableSeats, 10);
      payload.needs_return_ride = needsReturnRide;
      if (needsReturnRide) {
        payload.return_address = returnAddress || pickupAddress;
      }
    }

    if (role === "rider") {
      payload.needs_return_ride = needsReturnRide;
      if (needsReturnRide) {
        payload.return_address = returnAddress || pickupAddress;
      }
    }

    const res = await fetch(`/api/responses/${eventId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to submit response");
      setIsSubmitting(false);
      return;
    }

    setSubmitted(true);
    setIsSubmitting(false);
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-lg font-medium">Response submitted!</p>
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;ll be notified when carpool assignments are ready.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setSubmitted(false)}
          >
            Edit response
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Role Selection */}
      <div className="space-y-3">
        <Label className="text-base">How are you getting there?</Label>
        <div className="grid gap-2">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRole(option.value)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                role === option.value
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
            >
              <p className="font-medium">{option.label}</p>
              <p className="text-sm text-muted-foreground">
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Driver / Rider fields */}
      {(role === "driver" || role === "rider") && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pickup_address">
              {role === "driver" ? "Where are you leaving from?" : "Pickup address"}
            </Label>
            <Input
              id="pickup_address"
              placeholder="Enter your address"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Google Maps autocomplete will be added here
            </p>
          </div>

          {role === "driver" && (
            <div className="space-y-2">
              <Label htmlFor="available_seats">Available seats (excluding you)</Label>
              <Input
                id="available_seats"
                type="number"
                min="1"
                max="10"
                value={availableSeats}
                onChange={(e) => setAvailableSeats(e.target.value)}
                required
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              id="needs_return_ride"
              type="checkbox"
              checked={needsReturnRide}
              onChange={(e) => setNeedsReturnRide(e.target.checked)}
              className="size-4 rounded border-input"
            />
            <Label htmlFor="needs_return_ride" className="text-sm font-normal">
              {role === "driver"
                ? "I'll give rides after the event too"
                : "I also need a ride home after the event"}
            </Label>
          </div>

          {needsReturnRide && (
            <div className="space-y-2">
              <Label htmlFor="return_address">
                Return address (leave blank if same as pickup)
              </Label>
              <Input
                id="return_address"
                placeholder="Same as pickup address"
                value={returnAddress}
                onChange={(e) => setReturnAddress(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* Preferences */}
      {role && role !== "attending" && members.length > 0 && (
        <div className="space-y-3">
          <Label className="text-base">Ride preferences (optional)</Label>
          <p className="text-sm text-muted-foreground">
            Select people you&apos;d prefer to ride with or want to avoid.
          </p>

          {/* Current preferences */}
          {preferences.length > 0 && (
            <div className="space-y-2">
              {preferences.map((pref) => {
                const member = members.find((m) => m.id === pref.target_user_id);
                return (
                  <div
                    key={pref.target_user_id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span className="text-sm">
                      {member?.full_name || member?.email}{" "}
                      <span
                        className={
                          pref.type === "prefer"
                            ? "text-green-600"
                            : "text-red-500"
                        }
                      >
                        ({pref.type})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removePreference(pref.target_user_id)}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add preference */}
          <div className="space-y-2">
            {members
              .filter(
                (m) =>
                  !preferences.some((p) => p.target_user_id === m.id)
              )
              .map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm">
                    {member.full_name || member.email}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => addPreference(member.id, "prefer")}
                    >
                      Prefer
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => addPreference(member.id, "avoid")}
                      className="text-destructive"
                    >
                      Avoid
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={!role || isSubmitting}
        className="w-full"
        size="lg"
      >
        {isSubmitting
          ? "Submitting…"
          : existingResponse
            ? "Update Response"
            : "Submit Response"}
      </Button>
    </form>
  );
}
