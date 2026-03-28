"use client";

import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";

export function NotificationPrompt(): React.ReactElement | null {
  const { permission, isSubscribed, isSupported, isLoading, subscribe, unsubscribe } =
    useNotifications();

  // Browser doesn't support push notifications
  if (!isSupported) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Notifications not supported</p>
        <p className="text-xs text-muted-foreground">
          Your browser doesn&apos;t support push notifications. On iOS, add this
          app to your Home Screen to enable them.
        </p>
      </div>
    );
  }

  // Already subscribed — show option to turn off
  if (isSubscribed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Notifications enabled</p>
          <p className="text-xs text-muted-foreground">
            You&apos;ll be notified about carpool assignments and event updates.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={unsubscribe} disabled={isLoading}>
          Turn off
        </Button>
      </div>
    );
  }

  // Permission denied — explain how to re-enable
  if (permission === "denied") {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Notifications blocked</p>
        <p className="text-xs text-muted-foreground">
          You&apos;ve blocked notifications. To re-enable, update your browser
          notification settings for this site.
        </p>
      </div>
    );
  }

  // Not yet subscribed — prompt to enable
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">Enable notifications</p>
        <p className="text-xs text-muted-foreground">
          Get notified when carpool assignments are published or events are updated.
        </p>
      </div>
      <Button size="sm" onClick={subscribe} disabled={isLoading}>
        Enable
      </Button>
    </div>
  );
}
