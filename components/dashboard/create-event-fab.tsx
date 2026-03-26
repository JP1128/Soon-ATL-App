"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateEventFab({ disabled }: { disabled?: boolean }): React.ReactElement {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  async function handleCreate(): Promise<void> {
    setIsCreating(true);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Gethsemane" }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to create event");
      setIsCreating(false);
      return;
    }

    setIsCreating(false);
    router.refresh();
  }

  if (disabled) return <></>;

  return (
    <button
      onClick={handleCreate}
      disabled={isCreating}
      className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 disabled:opacity-50"
      aria-label="New Event"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}
