"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { triggerFluidWave } from "@/components/ui/fluid-wave-loader";

type UserEventStatus = "needs-response" | "submitted" | "ride-assigned";

interface ActiveEventCardProps {
  eventId: string;
  eventDate: string;
  title: string;
  subtitle: string;
  address: string;
  status: UserEventStatus;
  hasPhoneNumber: boolean;
}

const statusConfig: Record<
  UserEventStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  "needs-response": { label: "Response needed", variant: "secondary" },
  submitted: { label: "Response submitted", variant: "outline" },
  "ride-assigned": { label: "Ride assigned", variant: "default" },
};


function getDaysLeft(eventDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(eventDate + "T00:00:00");
  return Math.ceil((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function ActiveEventCard({
  eventId,
  eventDate,
  title,
  subtitle,
  address,
  status,
  hasPhoneNumber,
}: ActiveEventCardProps): React.ReactElement {
  const router = useRouter();
  const daysLeft = getDaysLeft(eventDate);
  const [isPressed, setIsPressed] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [rejectedPhase, setRejectedPhase] = useState<"idle" | "rise" | "fall">("idle");
  const needsResponse = status === "needs-response";

  // Two-phase rejected animation: rise to halfway, then fall back
  useEffect(() => {
    if (!isRejected) return;
    setRejectedPhase("rise");
    const riseTimer = setTimeout(() => setRejectedPhase("fall"), 350);
    const resetTimer = setTimeout(() => {
      setRejectedPhase("idle");
      setIsRejected(false);
    }, 900);
    return () => {
      clearTimeout(riseTimer);
      clearTimeout(resetTimer);
    };
  }, [isRejected]);

  function handleClick(): void {
    if (isPressed || isRejected) return;

    if (!hasPhoneNumber) {
      setIsRejected(true);
      // Trigger profile chip shake
      window.dispatchEvent(new CustomEvent("shake-profile-chip"));
      return;
    }

    setIsPressed(true);
    triggerFluidWave();
    setTimeout(() => {
      router.push(`/event/${eventId}`);
    }, 500);
  }

  return (
    <div className="relative w-full">
    <button
      type="button"
      onClick={handleClick}
      disabled={isPressed}
      className={`relative w-full overflow-hidden rounded-2xl border p-5 text-left transition-shadow ${
        isPressed ? "pointer-events-none" : "hover:bg-muted/50"
      } ${rejectedPhase !== "idle" ? "animate-[shake_0.6s_ease-in-out_0.3s]" : ""}`}
    >
      {/* Fluid fill rising from bottom with wavy top */}
      <div
        className={`absolute inset-x-0 bottom-0 ease-in-out ${
          isPressed
            ? "h-[120%] transition-all duration-700"
            : rejectedPhase === "rise"
              ? "h-[50%] transition-all duration-350"
              : rejectedPhase === "fall"
                ? "h-0 transition-all duration-500"
                : needsResponse
                  ? "h-[5%] transition-all duration-700"
                  : "h-0 transition-all duration-700"
        }`}
      >
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

      {/* Card content */}
      <div
        className={`relative flex items-start justify-between gap-3 transition-opacity duration-500 ${
          isPressed ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{address}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge variant={statusConfig[status].variant}>
            {statusConfig[status].label}
          </Badge>
          {daysLeft >= 0 && (
            <Badge variant="outline" className="text-xs">
              {daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft} days left`}
            </Badge>
          )}
        </div>
      </div>
    </button>
    </div>
  );
}
