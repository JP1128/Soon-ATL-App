"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { cn, formatPhoneNumber } from "@/lib/utils";
import { triggerFluidWave } from "@/components/ui/fluid-wave-loader";
import type { Profile } from "@/types/database";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatPhone(phone: string | null): string {
  if (!phone) return "No phone";
  return formatPhoneNumber(phone);
}

function roleBadge(role: string): { label: string; className: string } {
  switch (role) {
    case "admin":
      return { label: "Admin", className: "bg-primary/10 text-primary" };
    case "organizer":
      return { label: "Organizer", className: "bg-blue-500/10 text-blue-600" };
    default:
      return { label: "Member", className: "bg-secondary text-muted-foreground" };
  }
}

export function MembersList(): React.ReactElement {
  const router = useRouter();
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [changingRole, setChangingRole] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);

  useEffect(() => {
    async function fetchMembers(): Promise<void> {
      try {
        const res = await fetch("/api/members");
        if (res.ok) {
          const data = await res.json();
          setMembers(data.members);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchMembers();
  }, []);

  const filteredMembers = useMemo(() => {
    if (!search) return members;
    const lower = search.toLowerCase();
    return members.filter(
      (m) =>
        m.full_name.toLowerCase().includes(lower) ||
        m.email.toLowerCase().includes(lower)
    );
  }, [members, search]);

  // Scroll indicators
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function checkScroll(): void {
      if (!el) return;
      setCanScrollUp(el.scrollTop > 10);
      setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 10);
    }

    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el.removeEventListener("scroll", checkScroll);
  }, [filteredMembers]);

  async function handleRoleChange(memberId: string, newRole: "organizer" | "member"): Promise<void> {
    setChangingRole(true);
    try {
      const res = await fetch(`/api/members/${memberId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, role: updated.role } : m))
        );
        setSelectedMember((prev) => (prev ? { ...prev, role: updated.role } : null));
      }
    } catch {
      // silently fail
    } finally {
      setChangingRole(false);
    }
  }

  async function handleViewAs(userId: string): Promise<void> {
    triggerFluidWave();
    try {
      const res = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      }
    } catch {
      // silently fail
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Fixed header */}
      <div className="flex-none space-y-5 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Members</h1>
          <span className="text-xs text-muted-foreground">{members.length} total</span>
        </div>

        <Input
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Top scroll indicator */}
      <div
        className={cn(
          "flex-none flex justify-center h-5 items-center transition-opacity duration-200",
          canScrollUp ? "opacity-100" : "opacity-0"
        )}
      >
        <span className="text-[10px] tracking-[0.25em] text-muted-foreground/50">•••</span>
      </div>

      {/* Scrollable list */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-none"
          style={{
            maskImage: `linear-gradient(to bottom, ${canScrollUp ? "transparent, black 1.5rem" : "black 0%"}, black calc(100% - 7.5rem), transparent calc(100% - 6rem), transparent)`,
            WebkitMaskImage: `linear-gradient(to bottom, ${canScrollUp ? "transparent, black 1.5rem" : "black 0%"}, black calc(100% - 7.5rem), transparent calc(100% - 6rem), transparent)`,
          }}
        >
          <div className="space-y-1.5 pb-28">
            {filteredMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members found</p>
            ) : (
              filteredMembers.map((member) => {
                const badge = roleBadge(member.role);
                return (
                  <button
                    type="button"
                    key={member.id}
                    onClick={() => setSelectedMember(member)}
                    className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-secondary/30"
                  >
                    <Avatar size="sm">
                      {member.avatar_url && (
                        <AvatarImage
                          src={member.avatar_url}
                          alt={member.full_name}
                        />
                      )}
                      <AvatarFallback>
                        {getInitials(member.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {member.full_name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {formatPhone(member.phone_number)}
                        <span className="mx-1">·</span>
                        {member.email}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", badge.className)}>
                      {badge.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Bottom scroll indicator */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-24 z-10 flex justify-center pointer-events-none transition-opacity duration-200",
            canScrollDown ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="text-[10px] tracking-[0.25em] text-muted-foreground/50">•••</span>
        </div>
      </div>

      {/* Member detail overlay */}
      <MemberDetailOverlay
        open={selectedMember !== null}
        member={selectedMember}
        changingRole={changingRole}
        onClose={() => setSelectedMember(null)}
        onRoleChange={handleRoleChange}
        onViewAs={handleViewAs}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Member detail overlay                                              */
/* ------------------------------------------------------------------ */

function MemberDetailOverlay({
  open,
  member,
  changingRole,
  onClose,
  onRoleChange,
  onViewAs,
}: {
  open: boolean;
  member: Profile | null;
  changingRole: boolean;
  onClose: () => void;
  onRoleChange: (memberId: string, newRole: "organizer" | "member") => void;
  onViewAs: (userId: string) => void;
}): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  if (!mounted || !member) return null;

  const badge = roleBadge(member.role);

  return createPortal(
    <div className="fixed inset-0 z-60" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/80 transition-opacity duration-100 supports-backdrop-filter:backdrop-blur-xs",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-100",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <div className="pointer-events-auto relative w-full max-w-[calc(100%-2rem)] sm:max-w-sm rounded-4xl bg-popover p-6 ring-1 ring-foreground/5">
          {/* Member profile header */}
          <div className="flex items-center gap-3 mb-1">
            <Avatar>
              {member.avatar_url && (
                <AvatarImage src={member.avatar_url} alt={member.full_name} />
              )}
              <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{member.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatPhone(member.phone_number)}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mb-5">
            {member.email}
          </p>

          {/* Actions */}
          <div>
            {/* Role action — top-right pill, only for non-admin members */}
            {member.role !== "admin" && (
              <button
                type="button"
                disabled={changingRole}
                onClick={() =>
                  onRoleChange(
                    member.id,
                    member.role === "member" ? "organizer" : "member"
                  )
                }
                className={cn(
                  "absolute top-5 right-5 rounded-4xl border px-3 py-1.5 text-[11px] font-medium transition-colors",
                  member.role === "member"
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
                    : "border-input bg-input/30 text-muted-foreground hover:bg-input/50"
                )}
              >
                {member.role === "member" ? "Promote" : "Demote"}
              </button>
            )}

            {/* Admin badge — top right, non-interactive */}
            {member.role === "admin" && (
              <span className={cn("absolute top-5 right-5 rounded-full px-2.5 py-1 text-[11px] font-medium", badge.className)}>
                {badge.label}
              </span>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-4xl border border-input bg-input/30 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-input/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onViewAs(member.id)}
                className="flex-1 rounded-4xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                View as {member.full_name.split(" ")[0]}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
