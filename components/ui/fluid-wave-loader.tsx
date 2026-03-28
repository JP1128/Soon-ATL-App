"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

const EVENT_NAME = "fluid-wave-loading";
const DISMISS_EVENT = "fluid-wave-dismiss";

export function triggerFluidWave(): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function dismissFluidWave(): void {
  window.dispatchEvent(new CustomEvent(DISMISS_EVENT));
}

export function FluidWaveLoader(): React.ReactElement | null {
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleTrigger(): void {
      setActive(true);
    }
    function handleDismiss(): void {
      setActive(false);
    }
    window.addEventListener(EVENT_NAME, handleTrigger);
    window.addEventListener(DISMISS_EVENT, handleDismiss);
    return () => {
      window.removeEventListener(EVENT_NAME, handleTrigger);
      window.removeEventListener(DISMISS_EVENT, handleDismiss);
    };
  }, []);

  // Dismiss the wave when navigation completes (pathname changes)
  useEffect(() => {
    if (active) setActive(false);
  }, [pathname]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {active && (
        <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
          <motion.div
            initial={{ height: 0 }}
            animate={{
              height: 44,
              y: 0,
              transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
            }}
            exit={{
              y: 80,
              opacity: 0,
              transition: { duration: 1.0, ease: [0.22, 1, 0.36, 1] },
            }}
            className="absolute inset-x-0 bottom-0"
          >
            <svg
              className="animate-fluid-wave absolute -top-4 left-0 w-[200%]"
              viewBox="0 0 800 40"
              preserveAspectRatio="none"
              style={{ height: 20 }}
            >
              <path
                d="M0,20 Q50,10 100,20 Q150,30 200,20 Q250,10 300,20 Q350,30 400,20 Q450,10 500,20 Q550,30 600,20 Q650,10 700,20 Q750,30 800,20 L800,40 L0,40 Z"
                className="fill-foreground"
              />
            </svg>
            <div className="absolute inset-x-0 top-0 bottom-0 bg-foreground" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
