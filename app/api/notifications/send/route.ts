import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendPushToMany,
  type PushPayload,
  type PushSubscriptionRecord,
} from "@/lib/notifications/push";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only organizers can send notifications
    const { data: profile } = (await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()) as { data: { role: string } | null };

    if (profile?.role !== "organizer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, body: messageBody, url, tag, userIds } = body as {
      title?: string;
      body?: string;
      url?: string;
      tag?: string;
      userIds?: string[]; // optional: send to specific users only
    };

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: "title and body are required" },
        { status: 400 }
      );
    }

    // Fetch subscriptions
    let query = supabase.from("push_subscriptions").select("endpoint, keys_p256dh, keys_auth");

    if (userIds && userIds.length > 0) {
      query = query.in("user_id", userIds);
    }

    const { data: subscriptions, error: fetchError } = (await query) as {
      data: PushSubscriptionRecord[] | null;
      error: { message: string } | null;
    };

    if (fetchError) {
      console.error("Failed to fetch subscriptions:", fetchError);
      return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, message: "No subscribers found" });
    }

    const payload: PushPayload = { title, body: messageBody, url, tag };
    const result = await sendPushToMany(subscriptions, payload);

    // Clean up expired subscriptions
    if (result.expired.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", result.expired);
    }

    return NextResponse.json({
      sent: result.sent,
      expired: result.expired.length,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
