"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { GoogleMap, useJsApiLoader, MarkerF } from "@react-google-maps/api"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Search01Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons"

const LIBRARIES: ("places")[] = ["places"]
const DEFAULT_CENTER = { lat: 33.749, lng: -84.388 } // Atlanta

interface AddressResult {
  address: string
  lat: number
  lng: number
}

interface AddressPickerOverlayProps {
  open: boolean
  onClose: () => void
  onConfirm: (result: AddressResult) => void
  mode?: "search"
  initialAddress?: string
  initialLat?: number
  initialLng?: number
  title?: string
}

function AddressPickerOverlay({
  open,
  onClose,
  onConfirm,
  initialAddress = "",
  initialLat,
  initialLng,
  title = "Search address",
}: AddressPickerOverlayProps): React.ReactElement | null {
  const [mounted, setMounted] = React.useState(false)
  const [visible, setVisible] = React.useState(false)

  const [query, setQuery] = React.useState("")
  const [suggestions, setSuggestions] = React.useState<google.maps.places.AutocompleteSuggestion[]>([])
  const [selectedPlace, setSelectedPlace] = React.useState<AddressResult | null>(
    initialLat && initialLng ? { address: initialAddress, lat: initialLat, lng: initialLng } : null
  )
  const [markerPos, setMarkerPos] = React.useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  )

  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const sessionTokenRef = React.useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const geocoderRef = React.useRef<google.maps.Geocoder | null>(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    libraries: LIBRARIES,
    version: "weekly",
  })

  // Mount/unmount animation
  React.useEffect(() => {
    if (open) {
      setMounted(true)
      setQuery("")
      setSuggestions([])
      setSelectedPlace(
        initialLat && initialLng ? { address: initialAddress, lat: initialLat, lng: initialLng } : null
      )
      setMarkerPos(
        initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
      )
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), 200)
      return () => clearTimeout(timer)
    }
  }, [open, initialAddress, initialLat, initialLng])

  // Lock body scroll
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [open])

  // Auto-focus search input
  React.useEffect(() => {
    if (visible && !selectedPlace) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [visible, selectedPlace])

  // Initialize Google services when loaded
  React.useEffect(() => {
    if (isLoaded && typeof google !== "undefined") {
      geocoderRef.current = new google.maps.Geocoder()
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
    }
  }, [isLoaded])

  // Fetch suggestions as user types
  React.useEffect(() => {
    if (!query.trim() || !isLoaded || typeof google === "undefined") {
      setSuggestions([])
      return
    }

    let cancelled = false

    const timer = setTimeout(async () => {
      try {
        const request: google.maps.places.AutocompleteRequest = {
          input: query,
          includedRegionCodes: ["us"],
          language: "en-US",
        }
        if (sessionTokenRef.current) {
          request.sessionToken = sessionTokenRef.current
        }

        const { suggestions: results } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request)

        if (!cancelled) {
          setSuggestions(results)
        }
      } catch {
        if (!cancelled) {
          setSuggestions([])
        }
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, isLoaded])

  async function handleSelectSuggestion(suggestion: google.maps.places.AutocompleteSuggestion): Promise<void> {
    const placePrediction = suggestion.placePrediction
    if (!placePrediction) return

    // Blur the input to dismiss the keyboard
    searchInputRef.current?.blur()

    try {
      const place = placePrediction.toPlace()
      await place.fetchFields({ fields: ["formattedAddress", "location"] })

      const lat = place.location?.lat() ?? 0
      const lng = place.location?.lng() ?? 0
      const address = place.formattedAddress ?? placePrediction.text.toString()
      setSelectedPlace({ address, lat, lng })
      setMarkerPos({ lat, lng })
      setQuery(address)
      setSuggestions([])

      // Refresh session token after a selection
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
    } catch {
      // Fallback: can't fetch place details
    }
  }

  function handleMarkerDragEnd(e: google.maps.MapMouseEvent): void {
    if (!e.latLng) return
    const lat = e.latLng.lat()
    const lng = e.latLng.lng()
    setMarkerPos({ lat, lng })

    geocoderRef.current?.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
        const address = results[0].formatted_address
        setSelectedPlace({ address, lat, lng })
        setQuery(address)
      } else {
        setSelectedPlace({ address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng })
      }
    })
  }

  function handleConfirm(): void {
    if (selectedPlace) {
      onConfirm(selectedPlace)
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
          "absolute inset-x-0 top-[15%] flex justify-center pointer-events-none transition-all duration-100",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <div className="pointer-events-auto w-full max-w-[calc(100%-2rem)] sm:max-w-sm rounded-4xl bg-popover p-6 ring-1 ring-foreground/5">
          {title && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">{title}</p>
          )}

          {/* Search input */}
          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.5}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelectedPlace(null)
                setMarkerPos(null)
              }}
              placeholder="Search address..."
              className="h-9 w-full rounded-4xl border border-input bg-input/30 pl-9 pr-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/50 md:text-sm"
            />
          </div>

          {/* Suggestions list */}
          {suggestions.length > 0 && !selectedPlace && (
            <div className="mt-3 max-h-48 overflow-y-auto -mx-2">
              {suggestions.map((suggestion) => {
                const placePrediction = suggestion.placePrediction
                if (!placePrediction) return null
                return (
                  <button
                    key={placePrediction.placeId}
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <HugeiconsIcon icon={Location01Icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {placePrediction.mainText?.text ?? placePrediction.text.toString()}
                      </p>
                      {placePrediction.secondaryText?.text && (
                        <p className="text-xs text-muted-foreground truncate">
                          {placePrediction.secondaryText.text}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* No results */}
          {!suggestions.length && !selectedPlace && query.trim() && (
            <p className="mt-3 text-center text-sm text-muted-foreground">No results found</p>
          )}

          {/* Map after selection */}
          {selectedPlace && markerPos && isLoaded && (
            <div className="mt-3">
              <div className="overflow-hidden rounded-2xl border border-border">
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "200px" }}
                  center={markerPos}
                  zoom={16}
                  options={{
                    disableDefaultUI: true,
                    zoomControl: true,
                    gestureHandling: "greedy",
                    styles: [
                      { featureType: "poi", stylers: [{ visibility: "off" }] },
                      { featureType: "transit", stylers: [{ visibility: "off" }] },
                    ],
                  }}
                >
                  <MarkerF
                    position={markerPos}
                    draggable
                    onDragEnd={handleMarkerDragEnd}
                  />
                </GoogleMap>
              </div>
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Drag the pin to adjust location
              </p>
            </div>
          )}

          {/* Confirm / Cancel buttons */}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-4xl border border-input bg-input/30 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-input/50"
            >
              Cancel
            </button>
            {selectedPlace && (
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-4xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Confirm
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export { AddressPickerOverlay }
export type { AddressResult }
