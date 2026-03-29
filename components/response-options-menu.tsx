"use client";

import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreVerticalIcon, Delete02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { triggerFluidWave } from "@/components/ui/fluid-wave-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ResponseOptionsMenuProps {
  responseId: string;
  eventId: string;
}

export function ResponseOptionsMenu({ responseId, eventId }: ResponseOptionsMenuProps): React.ReactElement {
  const router = useRouter();

  async function handleRemove(): Promise<void> {
    const res = await fetch(`/api/responses/${eventId}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary">
        <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="min-w-0 w-auto">
        <DropdownMenuItem
          onClick={() => {
            triggerFluidWave();
            router.refresh();
          }}
        >
          <HugeiconsIcon icon={RefreshIcon} className="size-4" strokeWidth={1.5} />
          Refresh
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={handleRemove}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={1.5} />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
