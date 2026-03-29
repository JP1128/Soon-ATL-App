"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftIcon, Menu01Icon, Home01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { triggerFluidWave } from "@/components/ui/fluid-wave-loader";

interface BottomNavProps {
  fullName: string;
  avatarUrl: string | null;
  isOrganizer: boolean;
  isAdmin: boolean;
  hasPhoneNumber: boolean;
  isImpersonating: boolean;
}

export function BottomNav({
  fullName,
  avatarUrl,
  isOrganizer,
  isAdmin,
  hasPhoneNumber,
  isImpersonating,
}: BottomNavProps): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const prevPathRef = useRef(pathname);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const chipRef = useRef<HTMLAnchorElement>(null);

  const mainPages = ["/", "/dashboard", "/dashboard/past-events", "/dashboard/members"];
  const isMainPage = mainPages.includes(pathname);
  const showMenu = (isMainPage && (isOrganizer || isAdmin)) || isImpersonating;
  const isEventPage = pathname.startsWith("/event/");
  const isProfilePage = pathname === "/profile";
  const showHomeIcon = isEventPage || isProfilePage;

  // Trigger a brief navigation animation when the pathname changes
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      setIsNavigating(true);
      prevPathRef.current = pathname;
      const timer = setTimeout(() => setIsNavigating(false), 200);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  // Listen for shake-profile-chip custom event
  useEffect(() => {
    function handleShake(): void {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
    }
    window.addEventListener("shake-profile-chip", handleShake);
    return () => window.removeEventListener("shake-profile-chip", handleShake);
  }, []);

  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const pageNames: Record<string, string> = {
    "/": "",
    "/profile": "Profile",
    "/dashboard": "Manage Event",
    "/dashboard/past-events": "Past Events",
    "/dashboard/members": "Members",
  };

  function getPageName(): string {
    // Exact match first
    if (pageNames[pathname] !== undefined) return pageNames[pathname];
    // Dynamic routes
    if (pathname.includes("/carpools")) return "Carpool Audit";
    if (pathname.includes("/assistance")) return "Carpool Assistance";
    if (pathname.startsWith("/dashboard/events/")) return "Event Details";
    if (pathname.startsWith("/dashboard/profile")) return "Profile";
    if (pathname.startsWith("/event/")) return "";
    return "";
  }

  const pageName = getPageName();

  async function exitImpersonation(): Promise<void> {
    triggerFluidWave();
    try {
      await fetch("/api/impersonate", { method: "DELETE" });
      window.location.href = "/dashboard/members";
    } catch {
      // silently fail
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-1">
      {pageName && (
        <span className="text-xs text-muted-foreground">{pageName}</span>
      )}
      <div className="flex items-center gap-2">
      {showMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="size-10 rounded-full bg-background shadow-lg"
              />
            }
          >
            <motion.span
              whileTap={{ rotate: 90 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
              className="inline-flex"
            >
              <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-4" />
            </motion.span>
            <span className="sr-only">Open menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={8}>
            <DropdownMenuItem render={<Link href="/" />} onClick={pathname !== "/" ? triggerFluidWave : undefined}>
              {pathname === "/" && <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />}
              Home
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard" />} onClick={pathname !== "/dashboard" ? triggerFluidWave : undefined}>
              {pathname === "/dashboard" && <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />}
              Manage Event
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard/past-events" />} onClick={pathname !== "/dashboard/past-events" ? triggerFluidWave : undefined}>
              {pathname === "/dashboard/past-events" && <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />}
              Past Events
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/dashboard/members" />} onClick={pathname !== "/dashboard/members" ? triggerFluidWave : undefined}>
                  {pathname === "/dashboard/members" && <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />}
                  Members
                </DropdownMenuItem>
              </>
            )}
            {isImpersonating && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exitImpersonation} className="text-destructive">
                  Exit View
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : !isMainPage ? (
        <Button
          variant="outline"
          size="icon"
          className="size-10 rounded-full bg-background shadow-lg"
          onClick={() => { triggerFluidWave(); showHomeIcon ? router.push("/") : router.back(); }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={showHomeIcon ? "home" : "back"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              whileTap={{ scale: 0.8 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="inline-flex"
            >
              <HugeiconsIcon icon={showHomeIcon ? Home01Icon : ArrowLeftIcon} strokeWidth={2} className="size-4" />
            </motion.span>
          </AnimatePresence>
          <span className="sr-only">{showHomeIcon ? "Go home" : "Go back"}</span>
        </Button>
      ) : null}

      {pathname !== "/profile" && (
        <Link
          ref={chipRef}
          href="/profile"
          onClick={triggerFluidWave}
          className={`relative inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-border/50 bg-background px-4 py-2 text-sm shadow-lg transition-all duration-200 hover:bg-muted active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isNavigating ? "scale-95" : "scale-100"} ${isShaking ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
        >
          {!hasPhoneNumber && (
            <span className="absolute -top-1 -right-1 flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/75" />
              <span className="relative inline-flex size-3 rounded-full bg-destructive" />
            </span>
          )}
          <Avatar size="sm">
            <AvatarImage src={avatarUrl ?? undefined} alt={fullName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{fullName.split(" ")[0]}</span>
        </Link>
      )}
      </div>
    </div>
  );
}
