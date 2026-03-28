"use client";

import { useRouter } from "next/navigation";
import { formatDisplayAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Event, EventStatus } from "@/types/database";
import { triggerFluidWave } from "@/components/ui/fluid-wave-loader";

interface EventCardProps {
  event: Event;
  responseCount: number;
  isActive?: boolean;
}

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  open: "Active",
  closed: "Closed",
  published: "Published",
};

const STATUS_VARIANTS: Record<EventStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  open: "default",
  closed: "outline",
  published: "default",
};

export function EventCard({ event, responseCount, isActive }: EventCardProps): React.ReactElement {
  const router = useRouter();
  const status = event.status as EventStatus;

  async function updateStatus(newStatus: EventStatus): Promise<void> {
    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to update status");
      return;
    }
    router.refresh();
  }

  async function deleteEvent(): Promise<void> {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    router.refresh();
  }

  function copyFormLink(): void {
    const url = `${window.location.origin}/event/${event.id}`;
    navigator.clipboard.writeText(url);
  }

  const formattedDate = new Date(event.event_date + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric" }
  );

  const formattedTime = event.event_time
    ? new Date(`1970-01-01T${event.event_time}`).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-base font-semibold">{event.title}</p>
          <p className="text-sm text-muted-foreground">
            {formattedDate}{formattedTime ? ` · ${formattedTime}` : ""}
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[status]} className="shrink-0">
          {STATUS_LABELS[status]}
        </Badge>
      </div>

      {event.location && (
        <p className="mt-2 text-sm text-muted-foreground">{formatDisplayAddress(event.location)}</p>
      )}
      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {responseCount} response{responseCount !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1.5">
          {status === "draft" && (
            <Button size="sm" className="h-8 rounded-lg text-xs" onClick={() => updateStatus("open")}>
              Activate
            </Button>
          )}
          {status === "open" && (
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={copyFormLink}>
              Copy Link
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="size-8" />}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {status === "open" && (
                <DropdownMenuItem onClick={() => updateStatus("closed")}>
                  Close responses
                </DropdownMenuItem>
              )}
              {status === "closed" && (
                <>
                  <DropdownMenuItem onClick={() => updateStatus("published")}>
                    Publish assignments
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateStatus("open")}>
                    Reopen responses
                  </DropdownMenuItem>
                </>
              )}
              {status === "published" && (
                <DropdownMenuItem onClick={() => updateStatus("open")}>
                  Reopen responses
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => { triggerFluidWave(); router.push(`/dashboard/events/${event.id}`); }}
              >
                View details
              </DropdownMenuItem>
              {status === "draft" && (
                <DropdownMenuItem
                  onClick={deleteEvent}
                  className="text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
