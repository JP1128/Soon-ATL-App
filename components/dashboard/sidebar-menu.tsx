"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sheet, SheetTrigger, SheetClose, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface SidebarMenuProps {
  fullName: string;
  avatarUrl: string | null;
}

interface NavItem {
  label: string;
  href: string;
  matchExact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", matchExact: true },
  { label: "Past Events", href: "/dashboard/past-events" },
  { label: "Profile & Settings", href: "/dashboard/profile" },
];

export function SidebarMenu({ fullName, avatarUrl }: SidebarMenuProps): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();

  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  function isActive(item: NavItem): boolean {
    if (item.matchExact) {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  }

  async function handleSignOut(): Promise<void> {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="-ml-2 size-9" />}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
        <span className="sr-only">Menu</span>
      </SheetTrigger>
      <SheetContent side="left">
        {/* Profile header */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <Avatar>
            <AvatarImage src={avatarUrl ?? undefined} alt={fullName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{fullName}</p>
            <p className="text-xs text-muted-foreground">Organizer</p>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5 px-3 py-3">
          {NAV_ITEMS.map((item) => (
            <SheetClose key={item.href} render={<Link href={item.href} />}>
              <span
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(item)
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                {item.label}
              </span>
            </SheetClose>
          ))}
        </nav>

        <div className="h-px bg-border" />

        {/* Footer actions */}
        <div className="flex flex-col gap-0.5 px-3 py-3">
          <SheetClose render={<Link href="/" />}>
            <span className="flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground">
              Switch to Member View
            </span>
          </SheetClose>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            Sign Out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
