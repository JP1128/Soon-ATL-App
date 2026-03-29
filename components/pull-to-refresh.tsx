"use client";

import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { triggerFluidWave, dismissFluidWave } from "@/components/ui/fluid-wave-loader";

interface PullToRefreshProps {
  children: ReactNode;
  className?: string;
}

const THRESHOLD = 60;
const MAX_PULL = 90;

export function PullToRefresh({ children, className }: PullToRefreshProps): React.ReactElement {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const scrollableRef = useRef<HTMLElement | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  const findScrollableParent = useCallback((target: EventTarget): HTMLElement | null => {
    let el = target as HTMLElement | null;
    const container = containerRef.current;
    while (el && el !== container) {
      if (el.scrollHeight > el.clientHeight) {
        const style = window.getComputedStyle(el);
        const overflow = style.overflowY;
        if (overflow === "auto" || overflow === "scroll") {
          return el;
        }
      }
      el = el.parentElement;
    }
    return null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshingRef.current) return;
      scrollableRef.current = findScrollableParent(e.target);
      startYRef.current = e.touches[0].clientY;
    },
    [findScrollableParent],
  );

  // Use native touchmove with { passive: false } so we can preventDefault
  // to stop scrollable children from bouncing when pull-to-refresh is active
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent): void => {
      if (startYRef.current === null || refreshingRef.current) return;

      const scrollable = scrollableRef.current;

      // If scrollable child has been scrolled down, cancel — let native scroll handle it
      if (scrollable && scrollable.scrollTop > 0) {
        startYRef.current = null;
        setPullDistance(0);
        return;
      }

      const delta = e.touches[0].clientY - startYRef.current;

      if (delta > 0) {
        // Pulling down — activate pull-to-refresh
        // preventDefault stops the scrollable child's overscroll bounce
        e.preventDefault();
        setPullDistance(Math.min(delta * 0.35, MAX_PULL));
      } else {
        // Swiping up — cancel pull-to-refresh, let native scroll handle it
        startYRef.current = null;
        setPullDistance(0);
      }
    };

    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => container.removeEventListener("touchmove", handleTouchMove);
  }, []);

  // Track pullDistance in a ref so onTouchEnd doesn't need it as a dependency
  const pullDistanceRef = useRef(0);
  useEffect(() => { pullDistanceRef.current = pullDistance; }, [pullDistance]);

  const onTouchEnd = useCallback(() => {
    if (startYRef.current === null) return;
    startYRef.current = null;

    if (pullDistanceRef.current >= THRESHOLD && !refreshingRef.current) {
      setRefreshing(true);
      setReleasing(true);
      setPullDistance(THRESHOLD * 0.6);
      triggerFluidWave();
      router.refresh();
      setTimeout(() => {
        setRefreshing(false);
        setReleasing(false);
        setPullDistance(0);
        dismissFluidWave();
      }, 1200);
    } else {
      setPullDistance(0);
    }
  }, [router]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const isActive = pullDistance > 0 || releasing;

  return (
    <div
      ref={containerRef}
      className={`relative ${className ?? ""}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Spinner in the revealed gap */}
      {isActive && (
        <div
          className="flex shrink-0 items-center justify-center"
          style={{
            height: pullDistance,
            transition: releasing || pullDistance === 0 ? "height 0.3s ease-out" : "none",
          }}
        >
          <div
            className="size-5 rounded-full border-2 border-muted-foreground/30 border-t-foreground"
            style={{
              opacity: progress,
              animation: refreshing ? "spin 0.6s linear infinite" : "none",
              transform: `rotate(${pullDistance * 3}deg)`,
            }}
          />
        </div>
      )}
      {/* Content — shrinks from the top, bottom stays fixed */}
      <div
        className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden"
      >
        {children}
      </div>
    </div>
  );
}
