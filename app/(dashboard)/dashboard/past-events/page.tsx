import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/dashboard/event-card";
import type { Event } from "@/types/database";

export default async function PastEventsPage(): Promise<React.ReactElement> {
  const supabase = await createClient();

  // Auth & role checks handled by layout

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .in("status", ["closed", "published"])
    .order("event_date", { ascending: false }) as {
    data: Event[] | null;
  };

  const pastEvents = events ?? [];

  // Get response counts per event
  const eventIds = pastEvents.map((e) => e.id);
  let responseCounts: Record<string, number> = {};
  if (eventIds.length > 0) {
    const { data: responses } = await supabase
      .from("responses")
      .select("event_id")
      .in("event_id", eventIds) as {
      data: Array<{ event_id: string }> | null;
    };

    for (const r of responses ?? []) {
      responseCounts[r.event_id] = (responseCounts[r.event_id] ?? 0) + 1;
    }
  }

  return (
    <div>

      {pastEvents.length > 0 ? (
        <div className="space-y-3">
          {pastEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              responseCount={responseCounts[event.id] ?? 0}
            />
          ))}
        </div>
      ) : (
        <div className="mt-20 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-muted-foreground">No past events yet.</p>
        </div>
      )}
    </div>
  );
}
