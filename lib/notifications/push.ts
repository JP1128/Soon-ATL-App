import webpush from "web-push";

let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not set. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  }
  webpush.setVapidDetails("mailto:soonatl@example.com", publicKey, privateKey);
  vapidConfigured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
}

export async function sendPushNotification(
  subscription: PushSubscriptionRecord,
  payload: PushPayload
): Promise<{ success: boolean; expired?: boolean }> {
  try {
    ensureVapidConfigured();
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys_p256dh,
          auth: subscription.keys_auth,
        },
      },
      JSON.stringify(payload)
    );
    return { success: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    // 404 or 410 means the subscription is expired/invalid
    if (statusCode === 404 || statusCode === 410) {
      return { success: false, expired: true };
    }
    console.error("Push notification failed:", error);
    return { success: false };
  }
}

export async function sendPushToMany(
  subscriptions: PushSubscriptionRecord[],
  payload: PushPayload
): Promise<{ sent: number; expired: string[] }> {
  const expiredEndpoints: string[] = [];
  let sent = 0;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const result = await sendPushNotification(sub, payload);
      if (result.success) {
        sent++;
      } else if (result.expired) {
        expiredEndpoints.push(sub.endpoint);
      }
      return result;
    })
  );

  // Clean up — caller should delete expired endpoints
  void results; // settled results consumed via counters above

  return { sent, expired: expiredEndpoints };
}

/**
 * Send a push notification to specific users by ID.
 * Fetches their subscriptions, sends the notification, and cleans up expired ones.
 * Requires a Supabase client with permission to read push_subscriptions (organizer or service role).
 */
export async function notifyUsers(
  supabase: { from: (table: string) => unknown },
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  if (userIds.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: subscriptions } = await sb
    .from("push_subscriptions")
    .select("endpoint, keys_p256dh, keys_auth")
    .in("user_id", userIds) as {
    data: PushSubscriptionRecord[] | null;
  };

  if (!subscriptions || subscriptions.length === 0) return;

  const result = await sendPushToMany(subscriptions, payload);

  if (result.expired.length > 0) {
    await sb
      .from("push_subscriptions")
      .delete()
      .in("endpoint", result.expired);
  }
}

/**
 * Send different push notifications to different users.
 * Each entry maps a userId to a specific payload.
 */
export async function notifyUsersIndividually(
  supabase: { from: (table: string) => unknown },
  notifications: Array<{ userId: string; payload: PushPayload }>
): Promise<void> {
  if (notifications.length === 0) return;

  const allUserIds = notifications.map((n) => n.userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: subscriptions } = await sb
    .from("push_subscriptions")
    .select("user_id, endpoint, keys_p256dh, keys_auth")
    .in("user_id", allUserIds) as {
    data: Array<PushSubscriptionRecord & { user_id: string }> | null;
  };

  if (!subscriptions || subscriptions.length === 0) return;

  // Group subscriptions by user
  const subsByUser = new Map<string, Array<PushSubscriptionRecord & { user_id: string }>>();
  for (const sub of subscriptions) {
    const existing = subsByUser.get(sub.user_id) ?? [];
    existing.push(sub);
    subsByUser.set(sub.user_id, existing);
  }

  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    notifications.flatMap((n) => {
      const userSubs = subsByUser.get(n.userId) ?? [];
      return userSubs.map(async (sub) => {
        const result = await sendPushNotification(sub, n.payload);
        if (result.expired) {
          expiredEndpoints.push(sub.endpoint);
        }
      });
    })
  );

  if (expiredEndpoints.length > 0) {
    await sb
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints);
  }
}
