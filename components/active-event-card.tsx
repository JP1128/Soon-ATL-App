"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

type UserEventStatus = "needs-response" | "submitted" | "ride-assigned";

interface ActiveEventCardProps {
  eventId: string;
  title: string;
  subtitle: string;
  status: UserEventStatus;
}

const statusConfig: Record<
  UserEventStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  "needs-response": { label: "Response needed", variant: "secondary" },
  submitted: { label: "Response submitted", variant: "outline" },
  "ride-assigned": { label: "Ride assigned", variant: "default" },
};


export function ActiveEventCard({
  eventId,
  title,
  subtitle,
  status,
}: ActiveEventCardProps): React.ReactElement {
  const router = useRouter();
  const [isPressed, setIsPressed] = useState(false);
  const needsResponse = status === "needs-response";

  function handleClick(): void {
    if (isPressed) return;
    setIsPressed(true);
    setTimeout(() => {
      router.push(`/event/${eventId}`);
    }, 500);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPressed}
      className={`relative w-full overflow-hidden rounded-2xl border p-5 text-left transition-shadow ${
        isPressed ? "pointer-events-none" : "hover:bg-muted/50"
      }`}
    >
      {/* Fluid fill rising from bottom with wavy top */}
      <div
        className={`absolute inset-x-0 bottom-0 transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isPressed ? "h-[120%]" : needsResponse ? "h-[5%]" : "h-0"
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
        </div>
        <Badge variant={statusConfig[status].variant} className="shrink-0">
          {statusConfig[status].label}
        </Badge>
      </div>
    </button>
  );
}
