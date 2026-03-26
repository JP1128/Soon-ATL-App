"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ManualAddressOverlayProps {
  open: boolean
  onClose: () => void
  onConfirm: (address: string) => void
  initialAddress?: string
  title?: string
}

function ManualAddressOverlay({
  open,
  onClose,
  onConfirm,
  initialAddress = "",
  title = "Enter address",
}: ManualAddressOverlayProps): React.ReactElement | null {
  const [mounted, setMounted] = React.useState(false)
  const [visible, setVisible] = React.useState(false)
  const [draft, setDraft] = React.useState(initialAddress)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) {
      setMounted(true)
      setDraft(initialAddress)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), 200)
      return () => clearTimeout(timer)
    }
  }, [open, initialAddress])

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [open])

  // Auto-focus input after animation
  React.useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [visible])

  function handleConfirm(): void {
    if (draft.trim()) {
      onConfirm(draft.trim())
      onClose()
    }
  }

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className={cn(
          "absolute inset-0 bg-black/80 transition-opacity duration-100 supports-backdrop-filter:backdrop-blur-xs",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute inset-x-0 top-[20%] flex justify-center pointer-events-none transition-all duration-100",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <div className="pointer-events-auto w-full max-w-[calc(100%-2rem)] sm:max-w-sm rounded-4xl bg-popover p-6 ring-1 ring-foreground/5">
          {title && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">{title}</p>
          )}
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm()
            }}
            placeholder="e.g. 123 Main St, Atlanta, GA"
            className="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/50"
          />
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
              onClick={handleConfirm}
              disabled={!draft.trim()}
              className="flex-1 rounded-4xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { ManualAddressOverlay }
