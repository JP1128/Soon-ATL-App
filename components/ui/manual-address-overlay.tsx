"use client"

import * as React from "react"
import { createPortal } from "react-dom"
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
  const [keyboardOpen, setKeyboardOpen] = React.useState(false)
  const [viewportTop, setViewportTop] = React.useState(0)
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
      setKeyboardOpen(false)
      setViewportTop(0)
      const timer = setTimeout(() => setMounted(false), 200)
      return () => clearTimeout(timer)
    }
  }, [open, initialAddress])

  // Detect keyboard open/close via visualViewport and track offset
  React.useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return

    const threshold = window.innerHeight * 0.25
    function onViewportChange(): void {
      const heightDiff = window.innerHeight - (vv?.height ?? window.innerHeight)
      const isOpen = heightDiff > threshold
      setKeyboardOpen(isOpen)
      setViewportTop(isOpen ? (vv?.offsetTop ?? 0) : 0)
    }

    vv.addEventListener("resize", onViewportChange)
    vv.addEventListener("scroll", onViewportChange)
    return () => {
      vv.removeEventListener("resize", onViewportChange)
      vv.removeEventListener("scroll", onViewportChange)
    }
  }, [open])

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

  return createPortal(
    <div className="fixed inset-0 z-60" role="dialog" aria-modal="true">
      <div
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-100 supports-backdrop-filter:backdrop-blur-xs",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute inset-x-0 flex justify-center pointer-events-none transition-all duration-200",
          keyboardOpen ? "" : "top-1/2 -translate-y-1/2",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
        style={keyboardOpen ? { top: `calc(${viewportTop}px + 5%)` } : undefined}
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
            className="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/50 md:text-sm"
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
    </div>,
    document.body
  )
}

export { ManualAddressOverlay }
