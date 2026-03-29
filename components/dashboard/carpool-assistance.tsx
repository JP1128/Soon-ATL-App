"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon, ArrowDown01Icon, UserGroupIcon, Navigation03Icon } from "@hugeicons/core-free-icons";
import { triggerFluidWave, dismissFluidWave } from "@/components/ui/fluid-wave-loader";
import { cn } from "@/lib/utils";

/* ── ScrollReveal ──────────────────────────────────────────────── */

function ScrollReveal({ children, scrollRoot }: { children: React.ReactNode; scrollRoot: React.RefObject<HTMLDivElement | null> }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { root: scrollRoot.current, threshold: 0.1, rootMargin: "0px 0px -120px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot]);

  return (
    <div
      ref={ref}
      style={{
        transform: isVisible ? "translateX(0)" : "translateX(1.5rem)",
        opacity: isVisible ? 1 : 0,
        transition: isVisible
          ? "transform 300ms ease-out, opacity 300ms ease-out"
          : "transform 150ms ease-in, opacity 150ms ease-in",
      }}
    >
      {children}
    </div>
  );
}

interface ProfileInfo {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface Assignment {
  driverId: string;
  riderIds: string[];
}

interface LegMetrics {
  greedyDistanceM: number;
  optimizedDistanceM: number;
  assignedRiders: number;
  unassignedRiders: number;
  preferencesSatisfied: number;
  preferencesTotal: number;
  iterations: number;
  riderSpread: [number, number, number];
}

interface Snapshot {
  iteration: number;
  type: "greedy" | "move" | "swap";
  assignments: Assignment[];
  costM: number;
}

interface DriverRouteStats {
  distanceM: number;
  durationS: number;
}

interface AssistanceResult {
  assignments: {
    before: Assignment[];
    after: Assignment[];
  };
  metrics: {
    before: LegMetrics;
    after: LegMetrics;
  };
  history: {
    before: Snapshot[];
    after: Snapshot[];
  };
  profiles: Record<string, ProfileInfo>;
  driverStats: {
    before: Record<string, DriverRouteStats>;
    after: Record<string, DriverRouteStats>;
  };
}

type Leg = "before" | "after";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface CarpoolAssistanceProps {
  eventId: string;
  initialResult?: Record<string, unknown> | null;
}

export function CarpoolAssistance({ eventId, initialResult }: CarpoolAssistanceProps): React.ReactElement {
  const router = useRouter();
  const [result, setResult] = useState<AssistanceResult | null>(() => {
    if (!initialResult) return null;
    // Saved results don't include history — provide empty arrays
    const saved = initialResult as Omit<AssistanceResult, "history">;
    return {
      ...saved,
      history: { before: [], after: [] },
    } as AssistanceResult;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [leg, setLeg] = useState<Leg>("before");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback((): void => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 10);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, result, leg]);

  // Animation state
  const [animating, setAnimating] = useState(false);
  const [snapIdx, setSnapIdx] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAnimation = useCallback((data: AssistanceResult, activeLeg: Leg): void => {
    const ANIMATION_DURATION_MS = 5000;
    const MIN_INTERVAL_MS = 50;
    const snaps = data.history[activeLeg];
    if (!snaps || snaps.length <= 1) {
      setAnimating(false);
      setSnapIdx(-1);
      return;
    }
    // If too many snapshots to fit in 5s at 50ms each, sample evenly
    const maxFrames = Math.floor(ANIMATION_DURATION_MS / MIN_INTERVAL_MS);
    const frameIndices: number[] = [];
    if (snaps.length <= maxFrames) {
      for (let i = 0; i < snaps.length; i++) frameIndices.push(i);
    } else {
      for (let i = 0; i < maxFrames; i++) {
        frameIndices.push(Math.round((i / (maxFrames - 1)) * (snaps.length - 1)));
      }
    }
    const interval = Math.floor(ANIMATION_DURATION_MS / frameIndices.length);
    setAnimating(true);
    setSnapIdx(frameIndices[0]);

    let frame = 0;
    const step = (): void => {
      frame++;
      if (frame >= frameIndices.length) {
        setAnimating(false);
        setSnapIdx(-1);
        return;
      }
      setSnapIdx(frameIndices[frame]);
      timerRef.current = setTimeout(step, interval);
    };
    timerRef.current = setTimeout(step, interval);
  }, []);

  // Clean up timer
  useEffect(() => {
    return (): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function runOptimization(): Promise<void> {
    setLoading(true);
    setError(null);
    setAnimating(false);
    setSnapIdx(-1);
    if (timerRef.current) clearTimeout(timerRef.current);
    triggerFluidWave();
    try {
      const res = await fetch(`/api/events/${eventId}/assistance`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to generate suggestions");
        return;
      }
      const data = await res.json() as AssistanceResult;
      setResult(data);
      startAnimation(data, leg);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
      dismissFluidWave();
    }
  }

  function switchLeg(newLeg: Leg): void {
    if (newLeg === leg) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setAnimating(false);
    setSnapIdx(-1);
    setLeg(newLeg);
  }

  // Determine what to display: during animation show the current snapshot, otherwise show final
  const snaps = result?.history[leg] ?? [];
  const currentSnap = animating && snapIdx >= 0 && snapIdx < snaps.length ? snaps[snapIdx] : null;
  const displayAssignments = currentSnap?.assignments ?? result?.assignments[leg] ?? [];
  const profiles = result?.profiles ?? {};
  const legDriverStats = result?.driverStats?.[leg] ?? {};
  const legMetrics = result?.metrics[leg] ?? null;

  // Animating cost display
  const displayCostMi = currentSnap
    ? (currentSnap.costM / 1609.344).toFixed(1)
    : legMetrics
      ? (legMetrics.optimizedDistanceM / 1609.344).toFixed(1)
      : null;
  const displayLabel = currentSnap
    ? currentSnap.type === "greedy"
      ? "Initial"
      : currentSnap.type === "move"
        ? `Move #${currentSnap.iteration}`
        : `Swap #${currentSnap.iteration}`
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Fixed header */}
      <div className="flex-none space-y-5 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Carpool Assistance</h1>
          {result && (
            <Button size="sm" className="rounded-xl" onClick={runOptimization} disabled={loading}>
              <HugeiconsIcon icon={AiMagicIcon} className="size-4" strokeWidth={1.5} />
              {loading ? "Running…" : "Regenerate"}
            </Button>
          )}
        </div>

        {result && (
          <div className="space-y-2">
            {/* Before / After toggle */}
            <div className="flex rounded-lg bg-secondary/50 p-0.5">
              {(["before", "after"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => switchLeg(l)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    leg === l
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l === "before" ? "Before" : "After"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Metrics card */}
        {legMetrics && legMetrics.assignedRiders > 0 && (() => {
          const savedM = legMetrics.greedyDistanceM - legMetrics.optimizedDistanceM;
          const savedPct = legMetrics.greedyDistanceM > 0
            ? Math.round((savedM / legMetrics.greedyDistanceM) * 100)
            : 0;
          const greedyMi = (legMetrics.greedyDistanceM / 1609.344).toFixed(1);
          const optimizedMi = (legMetrics.optimizedDistanceM / 1609.344).toFixed(1);
          const progressPct = snaps.length > 1 ? Math.round(((snapIdx < 0 ? snaps.length - 1 : snapIdx) / (snaps.length - 1)) * 100) : 100;

          return (
            <div className="rounded-lg border bg-secondary/20 px-3 py-2.5 space-y-1.5">
              {/* Iteration progress */}
              {snaps.length > 1 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {animating ? displayLabel : "Optimized"}
                    </span>
                    <span className={cn("text-xs font-medium tabular-nums transition-colors", animating ? "text-foreground" : "text-green-600")}>
                      {displayCostMi} mi
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        animating ? "bg-foreground/40" : "bg-green-500",
                      )}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Distance improvement (shown when not animating) */}
              {!animating && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Route distance</span>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground line-through">{greedyMi} mi</span>
                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 text-green-600" />
                    <span className="font-medium">{optimizedMi} mi</span>
                    {savedPct > 0 && (
                      <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                        −{savedPct}%
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Riders */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Riders assigned</span>
                <span className="text-xs font-medium">
                  {legMetrics.assignedRiders}
                  {legMetrics.unassignedRiders > 0 && (
                    <span className="ml-1 text-destructive">
                      ({legMetrics.unassignedRiders} unassigned)
                    </span>
                  )}
                </span>
              </div>

              {/* Preferences */}
              {legMetrics.preferencesTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Preferences met</span>
                  <span className="text-xs font-medium">
                    {legMetrics.preferencesSatisfied}/{legMetrics.preferencesTotal}
                  </span>
                </div>
              )}

              {/* Load balance */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Riders per driver</span>
                <span className="text-xs font-medium">
                  {legMetrics.riderSpread[0] === legMetrics.riderSpread[1]
                    ? legMetrics.riderSpread[0]
                    : `${legMetrics.riderSpread[0]}–${legMetrics.riderSpread[1]}`}
                  <span className="ml-1 text-muted-foreground">(avg {legMetrics.riderSpread[2]})</span>
                </span>
              </div>

              {/* Apply to audit */}
              {!animating && (
                <Button
                  size="sm"
                  className="w-full mt-1 rounded-xl"
                  disabled={applying}
                  onClick={async () => {
                    if (!result) return;
                    setApplying(true);
                    triggerFluidWave();
                    try {
                      const res = await fetch(`/api/events/${eventId}/assistance/apply`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ assignments: result.assignments }),
                      });
                      if (!res.ok) {
                        const data = await res.json();
                        setError(data.error ?? "Failed to apply");
                        return;
                      }
                      router.push(`/dashboard/events/${eventId}/carpools`);
                    } catch {
                      setError("Something went wrong");
                    } finally {
                      setApplying(false);
                      dismissFluidWave();
                    }
                  }}
                >
                  {applying ? "Applying…" : "Apply to Carpool Audit"}
                </Button>
              )}
            </div>
          );
        })()}
      </div>

      {/* Empty state */}
      {!result && (
        <div className="py-10 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <HugeiconsIcon icon={AiMagicIcon} className="size-6" />
          </div>
          <p className="text-lg font-semibold tracking-tight">
            Optimized Matching
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Uses real driving distances and route optimization to minimize total carpool distance.
          </p>
          <Button onClick={runOptimization} disabled={loading} className="mt-6 rounded-xl">
            <HugeiconsIcon icon={AiMagicIcon} className="size-4" strokeWidth={1.5} />
            {loading ? "Generating…" : "Generate Suggestions"}
          </Button>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Scrollable results */}
      {result && (
        <>
        {/* Top scroll indicator */}
        <div
          className={cn(
            "flex-none flex justify-center h-5 items-center transition-opacity duration-200",
            canScrollUp ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="text-[10px] tracking-[0.25em] text-muted-foreground/50">•••</span>
        </div>

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
            {displayAssignments.map((assignment) => {
              const driverProfile = profiles[assignment.driverId];
              if (!driverProfile) return null;

              return (
                <ScrollReveal key={assignment.driverId} scrollRoot={scrollRef}>
                <div className="rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar size="sm">
                      {driverProfile.avatar_url && (
                        <AvatarImage src={driverProfile.avatar_url} alt={driverProfile.full_name} />
                      )}
                      <AvatarFallback>{getInitials(driverProfile.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 truncate text-xs font-medium">{driverProfile.full_name}</span>
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                      {!animating && (() => {
                        const stats = legDriverStats[assignment.driverId];
                        if (!stats || (stats.distanceM === 0 && stats.durationS === 0)) return null;
                        const mi = (stats.distanceM / 1609.344).toFixed(1);
                        const min = Math.round(stats.durationS / 60);
                        return (
                          <span className="flex items-center gap-1">
                            <HugeiconsIcon icon={Navigation03Icon} className="size-3 shrink-0" strokeWidth={1.5} />
                            <span className="text-[11px]">
                              {min > 0 ? `${min} min · ` : ""}{mi} mi
                            </span>
                          </span>
                        );
                      })()}
                      <span className="flex items-center gap-1">
                        <HugeiconsIcon icon={UserGroupIcon} className="size-3.5" strokeWidth={1.5} />
                        {assignment.riderIds.length}
                      </span>
                    </span>
                  </div>

                  {assignment.riderIds.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 border-t pt-1.5">
                      {assignment.riderIds.map((riderId) => {
                        const riderProfile = profiles[riderId];
                        if (!riderProfile) return null;
                        return (
                          <span key={riderId} className="rounded-full bg-secondary/60 px-2 py-0.5 text-[11px]">
                            {riderProfile.full_name.split(" ")[0]}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                </ScrollReveal>
              );
            })}
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
        </>
      )}
    </div>
  );
}
