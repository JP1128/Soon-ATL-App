import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { CarpoolAssignments } from "@/components/dashboard/carpool-assignments";
import type { Event } from "@/types/database";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CarpoolsPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: event } = (await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single()) as { data: Event | null };

  if (!event) {
    notFound();
  }

  return (
    <div className="fixed inset-0 z-10 bg-background px-5 pt-4">
      <div className="mx-auto h-full max-w-lg">
        <CarpoolAssignments eventId={event.id} carpoolsSentAt={event.carpools_sent_at} />
      </div>
    </div>
  );
}
