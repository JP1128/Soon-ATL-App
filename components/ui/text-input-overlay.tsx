"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface TextInputOverlayProps {
  open: boolean
  onClose: () => void
  onConfirm: (value: string) => void
  initialValue?: string
  title?: string
  placeholder?: string
  type?: "text" | "tel"
  inputMode?: "text" | "tel" | "numeric"
  multiline?: boolean
  formatValue?: (value: string) => string
  maxLength?: number
}

function TextInputOverlay({
  open,
  onClose,
  onConfirm,
  initialValue = "",
  title,
  placeholder,
  type = "text",
  inputMode = "text",
  multiline = false,
  formatValue,
  maxLength,
}: TextInputOverlayProps): React.ReactElement | null {
  const [mounted, setMounted] = React.useState(false)
  const [visible, setVisible] = React.useState(false)
  const [draft, setDraft] = React.useState(initialValue)
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const rafRef = React.useRef<number>(0)

  React.useEffect(() => {
    if (open) {
      setMounted(true)
      setDraft(initialValue)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      if (containerRef.current) {
        containerRef.current.style.transform = ""
        containerRef.current.style.top = ""
      }
      const timer = setTimeout(() => setMounted(false), 200)
      return () => clearTimeout(timer)
    }
  }, [open, initialValue])

  // Position overlay relative to visual viewport using direct DOM manipulation
  React.useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return

    const threshold = window.innerHeight * 0.25
    function onViewportChange(): void {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const el = containerRef.current
        if (!el) return
        const heightDiff = window.innerHeight - (vv?.height ?? window.innerHeight)
        if (heightDiff > threshold) {
          const offset = vv?.offsetTop ?? 0
          el.style.top = "5%"
          el.style.transform = `translateY(${offset}px)`
        } else {
          el.style.top = "50%"
          el.style.transform = "translateY(-50%)"
        }
      })
    }

    vv.addEventListener("resize", onViewportChange)
    vv.addEventListener("scroll", onViewportChange)
    return () => {
      vv.removeEventListener("resize", onViewportChange)
      vv.removeEventListener("scroll", onViewportChange)
      cancelAnimationFrame(rafRef.current)
    }
  }, [open])

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [open])

  React.useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [visible])

  function handleChange(value: string): void {
    setDraft(formatValue ? formatValue(value) : value)
  }

  function handleConfirm(): void {
    onConfirm(draft.trim())
    onClose()
  }

  if (!mounted) return null

  const inputClasses = "h-9 w-full rounded-4xl border border-input bg-input/30 px-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/50 md:text-sm"

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
        ref={containerRef}
        className={cn(
          "absolute inset-x-0 top-1/2 flex justify-center pointer-events-none will-change-transform",
          "transition-[opacity,scale] duration-200",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
        style={{ transform: "translateY(-50%)" }}
      >
        <div className="pointer-events-auto w-full max-w-[calc(100%-2rem)] sm:max-w-sm rounded-4xl bg-popover p-6 ring-1 ring-foreground/5">
          {title && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">{title}</p>
          )}
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              rows={3}
              maxLength={maxLength}
              className="w-full rounded-2xl border border-input bg-input/30 px-3 py-2.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/50 md:text-sm resize-none"
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type}
              inputMode={inputMode}
              value={draft}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm()
              }}
              placeholder={placeholder}
              maxLength={maxLength}
              className={inputClasses}
            />
          )}
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
              className="flex-1 rounded-4xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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

export { TextInputOverlay }
