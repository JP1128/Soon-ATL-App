import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id: targetUserId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can change roles
  const { data: adminProfile } = (await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Profile, "role"> | null };

  if (!adminProfile || adminProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { role } = body;

  if (!role || !["organizer", "member"].includes(role)) {
    return NextResponse.json({ error: "Invalid role. Must be 'organizer' or 'member'" }, { status: 400 });
  }

  // Prevent changing own role
  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", targetUserId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }

  return NextResponse.json(data);
}
