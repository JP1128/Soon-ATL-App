import { createClient } from "@/lib/supabase/server";
import { getEffectiveUser } from "@/lib/impersonate";
import { notFound } from "next/navigation";
import { formatDisplayAddress } from "@/lib/utils";
import { EventForm } from "@/components/forms/event-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (!event) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveUser = await getEffectiveUser();
  const effectiveUserId = effectiveUser?.effectiveUserId ?? user?.id;

  // Get user's existing response for this event
  let existingResponse = null;
  if (user && effectiveUserId) {
    const { data: response } = await
      supabase
        .from("responses")
        .select("*")
        .eq("event_id", id)
        .eq("user_id", effectiveUserId)
        .maybeSingle();
    existingResponse = response;

    // If no response for this event, pre-fill from the user's most recent response
    if (!existingResponse) {
      const { data: previousResponse } = await supabase
        .from("responses")
        .select("*")
        .eq("user_id", effectiveUserId)
        .neq("event_id", id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingResponse = previousResponse;
    }
  }

  const isOpen = event.status === "open";
  const formattedDate = new Date(event.event_date + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric" }
  );
  const formattedTime = event.event_time
    ? new Date(`1970-01-01T${event.event_time}`).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="w-full max-w-lg px-4 py-4 tall:py-5 xtall:py-8">
      <div className="mb-3 tall:mb-4 xtall:mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight tall:text-2xl">{event.title}</h1>
        <p className="mt-1 text-muted-foreground">
          {formattedDate}{formattedTime ? ` at ${formattedTime}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatDisplayAddress(event.location)}
        </p>
      </div>

      {!user ? (
        <div className="rounded-2xl border p-6 text-center">
          <p className="mb-4 text-muted-foreground">
            Sign in with Google to submit your carpool preferences.
          </p>
          <a
            href="/api/auth/google"
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
          >
            Sign in
          </a>
        </div>
      ) : !isOpen ? (
        <div className="rounded-2xl border p-6 text-center">
          <p className="text-muted-foreground">
            {event.status === "draft"
              ? "This event is not open for responses yet."
              : "Responses for this event are closed."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border p-3.5 tall:p-4 xtall:p-5">
          <EventForm
            eventId={id}
            eventTitle={event.title}
            existingResponse={existingResponse}
          />
        </div>
      )}
    </div>
  );
}
