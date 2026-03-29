"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Search01Icon,
  Location01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons"
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps/constants"

const DEFAULT_CENTER = { lat: 33.749, lng: -84.388 } // Atlanta
const RECENT_ADDRESSES_KEY = "recent-addresses"
const MAX_RECENT_ADDRESSES = 3

function getRecentAddresses(): AddressResult[] {
  try {
    const stored = localStorage.getItem(RECENT_ADDRESSES_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored) as AddressResult[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_ADDRESSES) : []
  } catch {
    return []
  }
}

function saveRecentAddress(result: AddressResult): void {
  try {
    const existing = getRecentAddresses()
    const filtered = existing.filter((a) => a.address !== result.address)
    const updated = [result, ...filtered].slice(0, MAX_RECENT_ADDRESSES)
    localStorage.setItem(RECENT_ADDRESSES_KEY, JSON.stringify(updated))
  } catch {
    // localStorage unavailable
  }
}

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

  const [recentAddresses, setRecentAddresses] = React.useState<AddressResult[]>([])

  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const rafRef = React.useRef<number>(0)
  const sessionTokenRef = React.useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const geocoderRef = React.useRef<google.maps.Geocoder | null>(null)
  const mapRef = React.useRef<google.maps.Map | null>(null)
  const isDraggingRef = React.useRef(false)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: "weekly",
  })

  // Mount/unmount animation
  React.useEffect(() => {
    if (open) {
      setMounted(true)
      setQuery("")
      setSuggestions([])
      setRecentAddresses(getRecentAddresses())
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
      if (containerRef.current) {
        containerRef.current.style.transform = ""
        containerRef.current.style.top = ""
      }
      const timer = setTimeout(() => setMounted(false), 200)
      return () => clearTimeout(timer)
    }
  }, [open, initialAddress, initialLat, initialLng])

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
          locationBias: new google.maps.Circle({
            center: DEFAULT_CENTER,
            radius: 50000, // 50 km
          }),
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
      const result = { address, lat, lng }
      setSelectedPlace(result)
      setMarkerPos({ lat, lng })
      setQuery(address)
      setSuggestions([])
      saveRecentAddress(result)
      setRecentAddresses(getRecentAddresses())

      // Refresh session token after a selection
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
    } catch {
      // Fallback: can't fetch place details
    }
  }

  function handleMapIdle(): void {
    if (!mapRef.current || !isDraggingRef.current) return
    isDraggingRef.current = false
    const center = mapRef.current.getCenter()
    if (!center) return
    const lat = center.lat()
    const lng = center.lng()
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
      saveRecentAddress(selectedPlace)
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

          {/* Recent addresses */}
          {!query.trim() && !selectedPlace && recentAddresses.length > 0 && (
            <div className="mt-3 -mx-2">
              <p className="px-2 text-xs font-medium text-muted-foreground mb-1">Recent</p>
              {recentAddresses.map((recent) => (
                <button
                  key={recent.address}
                  type="button"
                  onClick={() => {
                    searchInputRef.current?.blur()
                    setSelectedPlace(recent)
                    setMarkerPos({ lat: recent.lat, lng: recent.lng })
                    setQuery(recent.address)
                    setSuggestions([])
                  }}
                  className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <HugeiconsIcon icon={Clock01Icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  <p className="text-sm truncate">{recent.address}</p>
                </button>
              ))}
            </div>
          )}

          {/* Suggestions list */}
          {suggestions.length > 0 && !selectedPlace && (
            <div className="mt-3 max-h-48 overflow-y-auto -mx-2">
              {suggestions.slice(0, 3).map((suggestion) => {
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

          {/* Spacer when empty state and no keyboard - keeps visual balance */}

          {/* Map after selection */}
          {selectedPlace && markerPos && isLoaded && (
            <div className="mt-3">
              <div className="relative overflow-hidden rounded-2xl border border-border">
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "200px" }}
                  center={markerPos}
                  zoom={16}
                  onLoad={(map) => { mapRef.current = map }}
                  onDragStart={() => { isDraggingRef.current = true }}
                  onIdle={handleMapIdle}
                  options={{
                    disableDefaultUI: true,
                    zoomControl: false,
                    gestureHandling: "greedy",
                    styles: [
                      { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
                      { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
                      { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
                      { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
                      { featureType: "poi", stylers: [{ visibility: "off" }] },
                      { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
                      { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
                      { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
                      { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
                      { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
                      { featureType: "transit", stylers: [{ visibility: "off" }] },
                      { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
                      { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
                    ],
                  }}
                />
                {/* Fixed center pin */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 pointer-events-none z-10 flex flex-col items-center" style={{ transform: "translate(-50%, -100%)" }}>
                  <div className="rounded-full bg-foreground p-1.5 shadow-lg ring-2 ring-background">
                    <div className="size-2 rounded-full bg-background" />
                  </div>
                  <div className="h-3 w-0.5 bg-foreground" />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Move the map to adjust location
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
