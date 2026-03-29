import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Profile } from "@/types/database";

const IMPERSONATE_COOKIE = "impersonate_user_id";

/** POST — start impersonating a user (admin only) */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminProfile } = (await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Profile, "role"> | null };

  if (!adminProfile || adminProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { userId } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // Verify the target user exists
  const { data: targetProfile } = (await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single()) as { data: Pick<Profile, "id"> | null };

  if (!targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_COOKIE, userId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 4, // 4 hours
  });

  return NextResponse.json({ success: true });
}

/** DELETE — stop impersonating */
export async function DELETE(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATE_COOKIE);

  return NextResponse.json({ success: true });
}
