import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { formatDisplayAddress } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { EventStatus } from "@/types/database";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  published: "Published",
};

export default async function EventDetailPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (!event) {
    notFound();
  }

  // Get responses with user profiles
  const { data: responses } = await supabase
    .from("responses")
    .select("*, profiles:user_id(full_name, email, avatar_url)")
    .eq("event_id", id)
    .order("submitted_at", { ascending: true }) as {
    data: Array<{
      id: string;
      role: string;
      pickup_address: string | null;
      available_seats: number | null;
      profiles: { full_name: string; email: string; avatar_url: string | null };
    }> | null;
  };

  const drivers = (responses ?? []).filter((r) => r.role === "driver");
  const riders = (responses ?? []).filter((r) => r.role === "rider");
  const attending = (responses ?? []).filter((r) => r.role === "attending");

  // Get existing carpools
  const { data: carpools } = await supabase
    .from("carpools")
    .select(
      "*, profiles:driver_id(full_name, email), carpool_riders(*, profiles:rider_id(full_name, email))"
    )
    .eq("event_id", id)
    .order("created_at", { ascending: true }) as {
    data: Array<{
      id: string;
      profiles: { full_name: string; email: string };
      carpool_riders: Array<{
        id: string;
        pickup_order: number;
        profiles: { full_name: string };
      }>;
    }> | null;
  };

  const formattedDate = new Date(event.event_date + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" }
  );

  const formattedTime = event.event_time
    ? new Date(`1970-01-01T${event.event_time}`).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const status = event.status as EventStatus;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="flex-1 text-lg font-semibold">{event.title}</h1>
        <Badge>{STATUS_LABELS[status]}</Badge>
      </div>

      <div className="mb-8 space-y-1">
        <p className="text-sm text-muted-foreground">
          {formattedDate}{formattedTime ? ` · ${formattedTime}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">{formatDisplayAddress(event.location)}</p>
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Drivers ({drivers.length})
          </h2>
          {drivers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drivers yet</p>
          ) : (
            <div className="space-y-2">
              {drivers.map((r) => (
                <div key={r.id} className="rounded-xl bg-secondary/50 px-4 py-3">
                  <p className="text-sm font-medium">{r.profiles?.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.available_seats} seat{r.available_seats !== 1 ? "s" : ""} · {r.pickup_address}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Riders ({riders.length})
          </h2>
          {riders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No riders yet</p>
          ) : (
            <div className="space-y-2">
              {riders.map((r) => (
                <div key={r.id} className="rounded-xl bg-secondary/50 px-4 py-3">
                  <p className="text-sm font-medium">{r.profiles?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{r.pickup_address}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Attending Only ({attending.length})
          </h2>
          {attending.length === 0 ? (
            <p className="text-sm text-muted-foreground">None</p>
          ) : (
            <div className="space-y-2">
              {attending.map((r) => (
                <div key={r.id} className="rounded-xl bg-secondary/50 px-4 py-3">
                  <p className="text-sm font-medium">{r.profiles?.full_name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="my-8 h-px bg-border" />

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Carpool Assignments
        </h2>
        {(carpools ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {status === "closed"
              ? "No carpools generated yet. Run the matching algorithm to create assignments."
              : "Close responses first to generate carpool assignments."}
          </p>
        ) : (
          <div className="space-y-3">
            {(carpools ?? []).map((carpool) => (
              <div key={carpool.id} className="rounded-xl border p-4">
                <p className="mb-2 text-sm font-semibold">
                  🚗 {carpool.profiles?.full_name}
                </p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  {(carpool.carpool_riders ?? [])
                    .sort((a, b) => a.pickup_order - b.pickup_order)
                    .map((cr) => (
                      <li key={cr.id}>{cr.profiles?.full_name}</li>
                    ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
