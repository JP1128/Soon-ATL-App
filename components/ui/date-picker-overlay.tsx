"use client"

import * as React from "react"
import { Calendar } from "@/components/ui/calendar"
import { FieldOverlay } from "@/components/ui/field-overlay"

interface DatePickerOverlayProps {
  open: boolean
  onClose: () => void
  selected: Date | undefined
  onSelect: (date: Date) => void
  title?: string
  disabled?: Parameters<typeof Calendar>[0]["disabled"]
}

function DatePickerOverlay({
  open,
  onClose,
  selected,
  onSelect,
  title = "Select date",
  disabled,
}: DatePickerOverlayProps): React.ReactElement {
  const [draft, setDraft] = React.useState<Date | undefined>(selected)

  React.useEffect(() => {
    if (open) {
      setDraft(selected)
    }
  }, [open, selected])

  function handleConfirm(): void {
    if (draft) {
      onSelect(draft)
    }
    onClose()
  }

  return (
    <FieldOverlay open={open} onClose={onClose} onConfirm={handleConfirm} title={title}>
      <div className="flex min-h-[300px] items-center justify-center">
        <Calendar
          mode="single"
          selected={draft}
          onSelect={(date) => {
            if (date) {
              setDraft(date)
            }
          }}
          disabled={disabled}
          className="mx-auto"
        />
      </div>
    </FieldOverlay>
  )
}

export { DatePickerOverlay }
