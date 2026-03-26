/**
 * Carpool matching algorithm.
 *
 * Assigns riders to drivers based on:
 * 1. Hard constraint: "avoid" preferences are never violated
 * 2. Hard constraint: driver seat capacity is never exceeded
 * 3. Soft constraint: "prefer" preferences are honored when possible
 * 4. Optimization: minimize total detour distance (straight-line approximation)
 */

interface MatchDriver {
  userId: string;
  lat: number;
  lng: number;
  availableSeats: number;
}

interface MatchRider {
  userId: string;
  lat: number;
  lng: number;
}

interface MatchPreference {
  userId: string;
  targetUserId: string;
  type: "prefer" | "avoid";
}

export interface CarpoolAssignment {
  driverId: string;
  riderIds: string[];
}

/**
 * Haversine distance between two lat/lng points in meters.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if assigning rider to driver violates any avoid constraint.
 * Checks both directions: rider avoiding driver's existing riders,
 * and existing riders avoiding the new rider.
 */
function violatesAvoid(
  riderId: string,
  driverId: string,
  existingRiderIds: string[],
  avoidMap: Map<string, Set<string>>
): boolean {
  const riderAvoids = avoidMap.get(riderId);
  // Rider avoids the driver
  if (riderAvoids?.has(driverId)) return true;
  // Driver avoids the rider
  if (avoidMap.get(driverId)?.has(riderId)) return true;

  for (const existingRiderId of existingRiderIds) {
    // New rider avoids existing rider
    if (riderAvoids?.has(existingRiderId)) return true;
    // Existing rider avoids new rider
    if (avoidMap.get(existingRiderId)?.has(riderId)) return true;
  }

  return false;
}

/**
 * Calculate a preference bonus for assigning a rider to a carpool.
 * Returns a positive score for "prefer" matches.
 */
function preferenceBonus(
  riderId: string,
  driverId: string,
  existingRiderIds: string[],
  preferMap: Map<string, Set<string>>
): number {
  let bonus = 0;
  const riderPrefers = preferMap.get(riderId);

  if (riderPrefers?.has(driverId)) bonus += 1;
  if (preferMap.get(driverId)?.has(riderId)) bonus += 1;

  for (const existingRiderId of existingRiderIds) {
    if (riderPrefers?.has(existingRiderId)) bonus += 1;
    if (preferMap.get(existingRiderId)?.has(riderId)) bonus += 1;
  }

  return bonus;
}

export function matchCarpools(
  drivers: MatchDriver[],
  riders: MatchRider[],
  preferences: MatchPreference[],
  destinationLat: number,
  destinationLng: number
): CarpoolAssignment[] {
  if (drivers.length === 0) return [];

  // Build preference lookup maps
  const avoidMap = new Map<string, Set<string>>();
  const preferMap = new Map<string, Set<string>>();

  for (const pref of preferences) {
    const map = pref.type === "avoid" ? avoidMap : preferMap;
    if (!map.has(pref.userId)) {
      map.set(pref.userId, new Set());
    }
    map.get(pref.userId)!.add(pref.targetUserId);
  }

  // Initialize assignments
  const assignments: Map<string, string[]> = new Map();
  const remainingSeats: Map<string, number> = new Map();

  for (const driver of drivers) {
    assignments.set(driver.userId, []);
    remainingSeats.set(driver.userId, driver.availableSeats);
  }

  // Sort riders by distance to destination (farthest first — they benefit most from carpooling)
  const sortedRiders = [...riders].sort((a, b) => {
    const distA = haversineDistance(a.lat, a.lng, destinationLat, destinationLng);
    const distB = haversineDistance(b.lat, b.lng, destinationLat, destinationLng);
    return distB - distA;
  });

  // Greedy assignment: for each rider, pick the best driver
  for (const rider of sortedRiders) {
    let bestDriverId: string | null = null;
    let bestScore = -Infinity;

    for (const driver of drivers) {
      const seats = remainingSeats.get(driver.userId)!;
      if (seats <= 0) continue;

      const currentRiders = assignments.get(driver.userId)!;

      // Hard constraint: avoid
      if (violatesAvoid(rider.userId, driver.userId, currentRiders, avoidMap)) {
        continue;
      }

      // Score = preference bonus - normalized distance
      const distance = haversineDistance(
        rider.lat,
        rider.lng,
        driver.lat,
        driver.lng
      );
      const bonus = preferenceBonus(
        rider.userId,
        driver.userId,
        currentRiders,
        preferMap
      );

      // Normalize distance to a 0-1 scale (assuming max reasonable distance ~50km)
      const normalizedDistance = Math.min(distance / 50000, 1);
      const score = bonus * 0.5 - normalizedDistance;

      if (score > bestScore) {
        bestScore = score;
        bestDriverId = driver.userId;
      }
    }

    if (bestDriverId) {
      assignments.get(bestDriverId)!.push(rider.userId);
      remainingSeats.set(
        bestDriverId,
        remainingSeats.get(bestDriverId)! - 1
      );
    }
    // If no driver available (all full or avoid conflicts), rider is unassigned
  }

  return drivers.map((driver) => ({
    driverId: driver.userId,
    riderIds: assignments.get(driver.userId) ?? [],
  }));
}
