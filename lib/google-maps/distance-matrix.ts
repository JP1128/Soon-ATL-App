/**
 * Server-side Google Maps API utilities for distance calculations.
 */

interface GeocodeResponse {
  status: string;
  results: Array<{
    geometry: {
      location: { lat: number; lng: number };
    };
  }>;
}

interface DistanceMatrixResponse {
  status: string;
  rows: Array<{
    elements: Array<{
      status: string;
      distance: { value: number };
      duration: { value: number };
    }>;
  }>;
}

/**
 * Geocode an address string to lat/lng using the Google Geocoding API.
 */
export async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  const data = (await response.json()) as GeocodeResponse;

  if (data.status !== "OK" || !data.results?.[0]) return null;

  return data.results[0].geometry.location;
}

export interface RouteLegResult {
  distanceM: number;
  durationS: number;
}

/**
 * Fetch driving distance and duration for sequential route legs only.
 * Given an array of routes (each an ordered array of point IDs), fetches
 * only the consecutive pairs (A→B, B→C, …) — NOT the full pairwise matrix.
 *
 * Returns a Map keyed by "fromId→toId" with distance + duration.
 * Deduplicates identical legs across routes and batches API calls.
 */
export async function fetchRouteLegs(
  routes: string[][],
  points: Map<string, { lat: number; lng: number }>,
  apiKey: string,
): Promise<Map<string, RouteLegResult>> {
  const results = new Map<string, RouteLegResult>();

  // Collect unique legs
  const uniqueLegs = new Map<string, { from: string; to: string }>();
  for (const route of routes) {
    for (let i = 0; i < route.length - 1; i++) {
      const key = `${route[i]}→${route[i + 1]}`;
      if (!uniqueLegs.has(key)) {
        uniqueLegs.set(key, { from: route[i], to: route[i + 1] });
      }
    }
  }

  if (uniqueLegs.size === 0) return results;

  const legs = Array.from(uniqueLegs.values());

  // Batch: each DM call can have up to 25 origins × destinations.
  // We batch legs by grouping origins, with each origin having 1 destination.
  // More efficient: batch up to 25 origins with their distinct destinations.
  // Simplest correct approach: batch 25 legs at a time, each as 1 origin × 1 destination.
  const BATCH_SIZE = 25;

  for (let i = 0; i < legs.length; i += BATCH_SIZE) {
    const batch = legs.slice(i, i + BATCH_SIZE);
    const originCoords = batch
      .map((leg) => {
        const p = points.get(leg.from);
        return p ? `${p.lat},${p.lng}` : "";
      })
      .filter(Boolean)
      .join("|");

    const destCoords = batch
      .map((leg) => {
        const p = points.get(leg.to);
        return p ? `${p.lat},${p.lng}` : "";
      })
      .filter(Boolean)
      .join("|");

    if (!originCoords || !destCoords) continue;

    const url = new URL(
      "https://maps.googleapis.com/maps/api/distancematrix/json",
    );
    url.searchParams.set("origins", originCoords);
    url.searchParams.set("destinations", destCoords);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    const data = (await response.json()) as DistanceMatrixResponse;

    if (data.status !== "OK") {
      console.warn(`Distance Matrix API error: ${data.status}`);
      continue;
    }

    // With N origins × N destinations, the diagonal (row i, col i) gives us
    // the leg we want: batch[i].from → batch[i].to
    for (let j = 0; j < batch.length; j++) {
      const element = data.rows[j]?.elements[j];
      if (element?.status === "OK") {
        results.set(`${batch[j].from}→${batch[j].to}`, {
          distanceM: element.distance.value,
          durationS: element.duration.value,
        });
      }
    }
  }

  return results;
}
