import { createClient } from "@/lib/supabase/server";
import { DraftEventEditor } from "@/components/dashboard/draft-event-editor";
import { CreateEventFab } from "@/components/dashboard/create-event-fab";
import { EventCard } from "@/components/dashboard/event-card";
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

  // Get response count for the active event
  let responseCount = 0;
  if (activeEvent) {
    const { count } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("event_id", activeEvent.id);
    responseCount = count ?? 0;
  }

  return (
    <div className="relative min-h-full">

      {isDraft ? (
        <DraftEventEditor event={activeEvent} />
      ) : activeEvent ? (
        <EventCard
          event={activeEvent}
          responseCount={responseCount}
          isActive
        />
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
