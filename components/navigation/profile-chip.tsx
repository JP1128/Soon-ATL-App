"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProfileChipProps {
  fullName: string;
  avatarUrl: string | null;
  isOrganizer: boolean;
}

export function ProfileChip({ fullName, avatarUrl, isOrganizer }: ProfileChipProps): React.ReactElement {
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const chipClass = "inline-flex items-center gap-2.5 rounded-full border border-border/50 bg-muted/30 px-4 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const chipContent = (
    <>
      <Avatar size="sm">
        <AvatarImage src={avatarUrl ?? undefined} alt={fullName} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <span className="font-medium">{fullName}</span>
    </>
  );

  if (!isOrganizer) {
    return (
      <Link href="/profile" className={chipClass}>
        {chipContent}
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button className={chipClass} />}
      >
        {chipContent}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuItem render={<Link href="/profile" />}>
          Profile & Settings
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/dashboard" />}>
          Organizer Dashboard
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
