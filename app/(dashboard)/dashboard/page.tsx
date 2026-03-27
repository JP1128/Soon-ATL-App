import { createClient } from "@/lib/supabase/server";
import { DraftEventEditor } from "@/components/dashboard/draft-event-editor";
import { CreateEventFab } from "@/components/dashboard/create-event-fab";
import { EventCard } from "@/components/dashboard/event-card";
import { Badge } from "@/components/ui/badge";
import { formatDisplayAddress } from "@/lib/utils";
import type { Event } from "@/types/database";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth & role checks handled by layout

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .in("status", ["draft", "open"])
    .order("event_date", { ascending: false })
    .limit(1) as {
    data: Event[] | null;
  };

  const activeEvent = events?.[0] ?? null;
  const isDraft = activeEvent?.status === "draft";
  const hasActiveEvent = activeEvent !== null;

  // Get response stats for the active event
  let stats: {
    total: number;
    drivers: number;
    riders: number;
    attending: number;
    beforeDrivers: number;
    beforeRiders: number;
    afterDrivers: number;
    afterRiders: number;
  } | undefined;

  if (activeEvent && activeEvent.status === "open") {
    const { data: responses } = await supabase
      .from("responses")
      .select("role, before_role, after_role")
      .eq("event_id", activeEvent.id);

    const rows = responses ?? [];
    stats = {
      total: rows.length,
      drivers: rows.filter((r) => r.role === "driver").length,
      riders: rows.filter((r) => r.role === "rider").length,
      attending: rows.filter((r) => r.role === "attending").length,
      beforeDrivers: rows.filter((r) => r.before_role === "driver").length,
      beforeRiders: rows.filter((r) => r.before_role === "rider").length,
      afterDrivers: rows.filter((r) => r.after_role === "driver").length,
      afterRiders: rows.filter((r) => r.after_role === "rider").length,
    };
  }

  // Format event details for header
  const formattedDate = activeEvent
    ? new Date(activeEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;
  const formattedTime =
    activeEvent?.event_time
      ? new Date(`1970-01-01T${activeEvent.event_time}`).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

  return (
    <div className="relative min-h-full">

      {activeEvent ? (
        <div className="w-full max-w-lg mx-auto px-4 py-4">
          <div className="mb-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current Event</p>
            <div className="mt-1 flex items-center justify-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{activeEvent.title}</h1>
              {activeEvent.status === "draft" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Draft</Badge>
              )}
              {activeEvent.status === "open" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Sent</Badge>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">
              {formattedDate}{formattedTime ? ` at ${formattedTime}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDisplayAddress(activeEvent.location)}
            </p>
          </div>
          <DraftEventEditor event={activeEvent} stats={stats} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 text-center" style={{ minHeight: "calc(100vh - 12rem)" }}>
          <p className="text-sm text-muted-foreground">
            No active event right now.
          </p>
          <CreateEventFab />
        </div>
      )}
    </div>
  );
}
