import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { CarpoolAssistance } from "@/components/dashboard/carpool-assistance";
import type { Event } from "@/types/database";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CarpoolAssistancePage({
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
        <CarpoolAssistance eventId={event.id} initialResult={event.last_assistance} />
      </div>
    </div>
  );
}
