"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
  return isIOS && isSafari;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone)
  );
}

export function PwaInstallBanner(): React.ReactElement | null {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show on iOS Safari when NOT already installed as PWA
    if (isIOSSafari() && !isStandalone()) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Add to Home Screen</p>
          <p className="text-xs text-muted-foreground">
            Install Soon ATL for the best experience and to enable push
            notifications.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShow(false)}>
          Dismiss
        </Button>
      </div>
      <div className="mt-3 space-y-1.5">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">1.</span> Tap the{" "}
          <span className="inline-flex translate-y-px">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-foreground"
            >
              <path d="M12 3v12M7 8l5-5 5 5" />
              <path d="M5 21h14a1 1 0 001-1v-6H4v6a1 1 0 001 1z" />
            </svg>
          </span>{" "}
          Share button in Safari
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">2.</span> Scroll down
          and tap{" "}
          <span className="font-medium text-foreground">
            Add to Home Screen
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">3.</span> Tap{" "}
          <span className="font-medium text-foreground">Add</span>
        </p>
      </div>
    </div>
  );
}
