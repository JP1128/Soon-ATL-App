import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:soonatl@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

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
