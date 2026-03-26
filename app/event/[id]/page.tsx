import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
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

  // Get user's default_role from profile
  let defaultRole: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_role")
      .eq("id", user.id)
      .single();
    defaultRole = profile?.default_role ?? null;
  }

  // Get list of members for preferences picker
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .neq("id", user?.id ?? "");

  // Get user's existing response if any
  let existingResponse = null;
  if (user) {
    const { data } = await supabase
      .from("responses")
      .select("*, preferences(*)")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    existingResponse = data;
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
    <div className="w-full max-w-lg px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
        <p className="mt-1 text-muted-foreground">
          {formattedDate}{formattedTime ? ` at ${formattedTime}` : ""} · {event.location}
        </p>
        {event.description && (
          <p className="mt-2 text-sm text-muted-foreground">{event.description}</p>
        )}
      </div>

      {!user ? (
        <div className="rounded-lg border p-6 text-center">
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
        <div className="rounded-lg border p-6 text-center">
          <p className="text-muted-foreground">
            {event.status === "draft"
              ? "This event is not open for responses yet."
              : "Responses for this event are closed."}
          </p>
        </div>
      ) : (
        <EventForm
          eventId={id}
          members={members ?? []}
          existingResponse={existingResponse}
          defaultRole={defaultRole}
        />
      )}
    </div>
  );
}
