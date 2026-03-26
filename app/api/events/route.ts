import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
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
    .order("event_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request): Promise<NextResponse> {
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

  // Check for any non-closed event (draft or open)
  const { data: activeEvents } = await supabase
    .from("events")
    .select("id")
    .in("status", ["draft", "open"]);

  if (activeEvents && activeEvents.length > 0) {
    return NextResponse.json(
      { error: "There is already an active event. Close it before creating a new one." },
      { status: 409 }
    );
  }

  const body = await request.json();
  const { title, description, event_date, event_time, location } = body;

  if (!title) {
    return NextResponse.json(
      { error: "Title is required" },
      { status: 400 }
    );
  }

  // Default event_date to next Friday if not provided
  function getNextFriday(): string {
    const d = new Date();
    const day = d.getDay();
    const daysUntilFriday = (5 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFriday);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const { data, error } = await supabase
    .from("events")
    .insert({
      title,
      description: description ?? "",
      event_date: event_date || getNextFriday(),
      event_time: event_time || null,
      location: location || "",
      created_by: user.id,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
