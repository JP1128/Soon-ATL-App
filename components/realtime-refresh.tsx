"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

interface RealtimeRefreshProps {
  eventId: string;
}

export function RealtimeRefresh({ eventId }: RealtimeRefreshProps): null {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshRef = useRef<number>(Date.now());

  const refresh = useCallback((): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastRefreshRef.current = Date.now();
      router.refresh();
    }, 500);
  }, [router]);

  // Supabase Realtime subscription for live foreground updates
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`home-realtime-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `id=eq.${eventId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "responses", filter: `event_id=eq.${eventId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "carpools", filter: `event_id=eq.${eventId}` },
        refresh,
      )
      .subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
        if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR) {
          // Retry subscription after a delay
          setTimeout(() => {
            supabase.removeChannel(channel);
          }, 5000);
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [eventId, refresh]);

  // Refresh when tab/app becomes visible to catch changes missed while backgrounded
  useEffect(() => {
    const STALE_THRESHOLD_MS = 10_000; // 10 seconds

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastRefreshRef.current;
        if (elapsed >= STALE_THRESHOLD_MS) {
          refresh();
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return null;
}
