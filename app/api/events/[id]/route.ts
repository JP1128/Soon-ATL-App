import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/notifications/push";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const allowedFields = ["title", "event_date", "event_time", "location", "status"];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // When activating an event (setting to "open"), ensure no other event is already open
  if (updates.status === "open") {
    updates.sent_at = new Date().toISOString();
    const { data: openEvents } = await supabase
      .from("events")
      .select("id")
      .eq("status", "open")
      .neq("id", id);

    if (openEvents && openEvents.length > 0) {
      return NextResponse.json(
        { error: "Another event is already active. Close it first." },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabase
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }

  // Notify all members when event form is opened
  if (updates.status === "open") {
    const eventTitle = (data as { title: string }).title;
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id") as { data: Array<{ id: string }> | null };

    if (allProfiles && allProfiles.length > 0) {
      const allUserIds = allProfiles.map((p) => p.id);
      notifyUsers(supabase, allUserIds, {
        title: "Soon ATL",
        body: `Form for ${eventTitle} is open! Check the home page for the form!`,
        url: "/",
        tag: `event-open-${id}`,
      }).catch((err) => console.error("Failed to send event open notifications:", err));
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("events").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
