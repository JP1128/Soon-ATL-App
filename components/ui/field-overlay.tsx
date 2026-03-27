"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface FieldOverlayProps {
  open: boolean
  onClose: () => void
  onConfirm?: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

function FieldOverlay({ open, onClose, onConfirm, title, children, className }: FieldOverlayProps): React.ReactElement | null {
  const [mounted, setMounted] = React.useState(false)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [open])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-60" role="dialog" aria-modal="true">
      <div
        className={cn(
          "absolute inset-0 bg-black/80 transition-opacity duration-100 supports-backdrop-filter:backdrop-blur-xs",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-100",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95",
          className
        )}
      >
        <div className="pointer-events-auto w-full max-w-[calc(100%-2rem)] sm:max-w-sm rounded-4xl bg-popover p-6 ring-1 ring-foreground/5">
          {title && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">{title}</p>
          )}
          {children}
          {onConfirm && (
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-4xl border border-input bg-input/30 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-input/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 rounded-4xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export { FieldOverlay }
