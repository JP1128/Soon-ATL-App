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
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const allowedFields = ["full_name", "default_role", "university"];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Validate default_role
  if (updates.default_role !== undefined && updates.default_role !== null) {
    const validRoles = ["driver", "rider", "attending"];
    if (!validRoles.includes(updates.default_role as string)) {
      return NextResponse.json({ error: "Invalid default role" }, { status: 400 });
    }
  }

  // Validate university
  if (updates.university !== undefined && updates.university !== null) {
    const validUniversities = [
      "University of Georgia",
      "Georgia Institute of Technology",
      "Georgia State University",
      "Emory University",
      "Kennesaw State University",
      "Other",
    ];
    if (!validUniversities.includes(updates.university as string)) {
      return NextResponse.json({ error: "Invalid university" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json(data);
}
