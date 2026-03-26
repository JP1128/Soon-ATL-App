"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { FieldOverlay } from "@/components/ui/field-overlay"

const ITEM_HEIGHT = 44
const VISIBLE_ITEMS = 5
const CENTER_INDEX = Math.floor(VISIBLE_ITEMS / 2)

interface WheelColumnProps {
  items: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  className?: string
}

function WheelColumn({ items, selectedIndex, onSelect, className }: WheelColumnProps): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const offsetY = React.useRef(-selectedIndex * ITEM_HEIGHT)
  const startY = React.useRef(0)
  const startOffset = React.useRef(0)
  const lastY = React.useRef(0)
  const lastTime = React.useRef(0)
  const velocity = React.useRef(0)
  const animFrame = React.useRef<number>(0)
  const isDragging = React.useRef(false)
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect

  const maxOffset = 0
  const minOffset = -(items.length - 1) * ITEM_HEIGHT

  function clamp(val: number): number {
    return Math.max(minOffset, Math.min(maxOffset, val))
  }

  function snapToNearest(animate = true): void {
    const target = Math.round(offsetY.current / ITEM_HEIGHT) * ITEM_HEIGHT
    const clamped = clamp(target)

    if (animate) {
      animateTo(clamped)
    } else {
      offsetY.current = clamped
      applyTransform()
      emitIndex()
    }
  }

  function animateTo(target: number): void {
    cancelAnimationFrame(animFrame.current)
    const start = offsetY.current
    const dist = target - start
    const duration = Math.min(300, Math.abs(dist) * 2 + 100)
    const t0 = performance.now()

    function step(now: number): void {
      const elapsed = now - t0
      const progress = Math.min(1, elapsed / duration)
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3)
      offsetY.current = start + dist * ease
      applyTransform()

      if (progress < 1) {
        animFrame.current = requestAnimationFrame(step)
      } else {
        offsetY.current = target
        applyTransform()
        emitIndex()
      }
    }

    animFrame.current = requestAnimationFrame(step)
  }

  function applyTransform(): void {
    const el = containerRef.current
    if (!el) return
    el.style.transform = `translateY(${offsetY.current + CENTER_INDEX * ITEM_HEIGHT}px)`
  }

  function emitIndex(): void {
    const index = Math.round(-offsetY.current / ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(items.length - 1, index))
    onSelectRef.current(clamped)
  }

  function handlePointerDown(e: React.PointerEvent): void {
    cancelAnimationFrame(animFrame.current)
    isDragging.current = true
    startY.current = e.clientY
    startOffset.current = offsetY.current
    lastY.current = e.clientY
    lastTime.current = performance.now()
    velocity.current = 0
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent): void {
    if (!isDragging.current) return
    const dy = e.clientY - startY.current
    const now = performance.now()
    const dt = now - lastTime.current

    if (dt > 0) {
      velocity.current = (e.clientY - lastY.current) / dt
    }
    lastY.current = e.clientY
    lastTime.current = now

    // Allow slight overscroll with resistance
    let newOffset = startOffset.current + dy
    if (newOffset > maxOffset) {
      newOffset = maxOffset + (newOffset - maxOffset) * 0.3
    } else if (newOffset < minOffset) {
      newOffset = minOffset + (newOffset - minOffset) * 0.3
    }
    offsetY.current = newOffset
    applyTransform()
  }

  function handlePointerUp(): void {
    if (!isDragging.current) return
    isDragging.current = false

    // Apply momentum
    const v = velocity.current
    const momentum = v * 150 // pixels of momentum
    const projected = clamp(offsetY.current + momentum)
    const target = Math.round(projected / ITEM_HEIGHT) * ITEM_HEIGHT
    const clamped = clamp(target)

    animateTo(clamped)
  }

  // Set initial position
  React.useEffect(() => {
    offsetY.current = -selectedIndex * ITEM_HEIGHT
    applyTransform()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={cn("relative overflow-hidden touch-none", className)}
      style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="pointer-events-none absolute inset-x-0 z-10 rounded-2xl bg-muted"
        style={{ top: CENTER_INDEX * ITEM_HEIGHT, height: ITEM_HEIGHT }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-linear-to-b from-popover to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 bg-linear-to-t from-popover to-transparent" />

      <div ref={containerRef} className="relative z-10 will-change-transform">
        {items.map((item, i) => (
          <div
            key={`${item}-${i}`}
            className={cn(
              "flex h-11 items-center justify-center text-lg font-medium select-none cursor-pointer",
              i === selectedIndex
                ? "text-foreground"
                : "text-muted-foreground/40"
            )}
            onClick={() => {
              const target = -i * ITEM_HEIGHT
              animateTo(clamp(target))
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]
const PERIODS = ["AM", "PM"]

interface TimeWheelPickerProps {
  open: boolean
  onClose: () => void
  hour: string
  minute: string
  period: string
  onChangeHour: (h: string) => void
  onChangeMinute: (m: string) => void
  onChangePeriod: (p: string) => void
  title?: string
}

function TimeWheelPicker({
  open,
  onClose,
  hour,
  minute,
  period,
  onChangeHour,
  onChangeMinute,
  onChangePeriod,
  title = "Select time",
}: TimeWheelPickerProps): React.ReactElement {
  const [draftHour, setDraftHour] = React.useState(hour)
  const [draftMinute, setDraftMinute] = React.useState(minute)
  const [draftPeriod, setDraftPeriod] = React.useState(period)

  // Reset draft state when overlay opens
  React.useEffect(() => {
    if (open) {
      setDraftHour(hour)
      setDraftMinute(minute)
      setDraftPeriod(period)
    }
  }, [open, hour, minute, period])

  const hourIndex = draftHour ? HOURS.indexOf(draftHour) : 0
  const minuteIndex = draftMinute ? MINUTES.indexOf(draftMinute) : 0
  const periodIndex = draftPeriod ? PERIODS.indexOf(draftPeriod) : 1

  function handleConfirm(): void {
    onChangeHour(draftHour)
    onChangeMinute(draftMinute)
    onChangePeriod(draftPeriod)
    onClose()
  }

  return (
    <FieldOverlay open={open} onClose={onClose} onConfirm={handleConfirm} title={title}>
      <div className="flex min-h-[300px] items-center justify-center">
        <WheelColumn
          items={HOURS}
          selectedIndex={hourIndex >= 0 ? hourIndex : 0}
          onSelect={(i) => setDraftHour(HOURS[i])}
          className="w-20"
        />
        <span className="text-xl font-medium text-muted-foreground">:</span>
        <WheelColumn
          items={MINUTES}
          selectedIndex={minuteIndex >= 0 ? minuteIndex : 0}
          onSelect={(i) => setDraftMinute(MINUTES[i])}
          className="w-20"
        />
        <div className="w-2" />
        <WheelColumn
          items={PERIODS}
          selectedIndex={periodIndex >= 0 ? periodIndex : 1}
          onSelect={(i) => setDraftPeriod(PERIODS[i])}
          className="w-16"
        />
      </div>
    </FieldOverlay>
  )
}

export { TimeWheelPicker, HOURS, MINUTES, PERIODS }
