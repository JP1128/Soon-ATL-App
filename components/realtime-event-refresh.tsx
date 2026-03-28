"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface RealtimeEventRefreshProps {
  eventId: string;
  carpoolsSentAt: string | null;
}

export function RealtimeEventRefresh({
  eventId,
  carpoolsSentAt,
}: RealtimeEventRefreshProps): null {
  const router = useRouter();
  const lastSentAt = useRef(carpoolsSentAt);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`event-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `id=eq.${eventId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const newSentAt = (payload.new as { carpools_sent_at: string | null }).carpools_sent_at;
          const newPublished = (payload.new as { published_carpools: unknown }).published_carpools;
          const statusChanged = (payload.new as { status: string }).status !== (payload.old as { status: string }).status;

          // Refresh when carpools are published/updated, published_carpools changes, or status changes
          if (newSentAt !== lastSentAt.current || newPublished !== undefined || statusChanged) {
            lastSentAt.current = newSentAt;
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  return null;
}
