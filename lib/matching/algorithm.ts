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

export const DESTINATION_ID = "__destination__";

export type DistanceLookup = (fromId: string, toId: string) => number;

export interface OptimizationMetrics {
  /** Total haversine distance (meters) before optimization (greedy). */
  greedyDistanceM: number;
  /** Total haversine distance (meters) after optimization. */
  optimizedDistanceM: number;
  /** Number of riders assigned. */
  assignedRiders: number;
  /** Number of riders left unassigned. */
  unassignedRiders: number;
  /** Number of "prefer" constraints satisfied. */
  preferencesSatisfied: number;
  /** Total number of "prefer" constraints. */
  preferencesTotal: number;
  /** Number of optimization iterations performed. */
  iterations: number;
  /** Rider counts per driver: [min, max, mean]. */
  riderSpread: [number, number, number];
}

export interface IterationSnapshot {
  iteration: number;
  type: "greedy" | "move" | "swap";
  assignments: CarpoolAssignment[];
  costM: number;
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
 * Build a haversine-based distance lookup from a map of point coordinates.
 */
export function buildHaversineDistanceLookup(
  points: Map<string, { lat: number; lng: number }>,
): DistanceLookup {
  return (fromId: string, toId: string): number => {
    const from = points.get(fromId);
    const to = points.get(toId);
    if (!from || !to) return Infinity;
    return haversineDistance(from.lat, from.lng, to.lat, to.lng);
  };
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

/**
 * Calculate the route cost for a single driver: driver → riders (nearest-neighbor) → destination.
 * Uses a distance lookup function that can be backed by haversine or real driving distances.
 *
 * Returns both the ordered ID sequence and the total cost.
 */
export function routeCost(
  driverId: string,
  riderIds: string[],
  destinationId: string,
  distanceLookup: DistanceLookup,
): number {
  if (riderIds.length === 0) return 0;

  let total = 0;
  let currentId = driverId;
  const remaining = [...riderIds];

  // Nearest-neighbor chain through riders
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = distanceLookup(currentId, remaining[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    total += bestDist;
    currentId = remaining[bestIdx];
    remaining.splice(bestIdx, 1);
  }

  // Last rider → destination
  total += distanceLookup(currentId, destinationId);

  return total;
}

/**
 * Get the nearest-neighbor route order for a driver's riders.
 * Returns the ordered sequence: [driverId, rider1, rider2, ..., destinationId]
 */
export function routeOrder(
  driverId: string,
  riderIds: string[],
  destinationId: string,
  distanceLookup: DistanceLookup,
): string[] {
  const order = [driverId];
  if (riderIds.length === 0) {
    order.push(destinationId);
    return order;
  }

  let currentId = driverId;
  const remaining = [...riderIds];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = distanceLookup(currentId, remaining[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    currentId = remaining[bestIdx];
    order.push(currentId);
    remaining.splice(bestIdx, 1);
  }

  order.push(destinationId);
  return order;
}

/**
 * Total route cost across all drivers, with a load-balance penalty.
 *
 * cost = totalDistance + λ · Σ(riders_d − mean)²
 *
 * The balance penalty discourages uneven rider distribution.
 * λ is scaled relative to the average leg distance so the penalty
 * is meaningful regardless of absolute distances.
 */
function totalRouteCost(
  assignments: Map<string, string[]>,
  destinationId: string,
  distanceLookup: DistanceLookup,
): number {
  let distanceCost = 0;
  let totalRiders = 0;
  const counts: number[] = [];

  for (const [driverId, riderIds] of assignments) {
    distanceCost += routeCost(driverId, riderIds, destinationId, distanceLookup);
    totalRiders += riderIds.length;
    counts.push(riderIds.length);
  }

  if (counts.length === 0) return 0;

  const mean = totalRiders / counts.length;
  let variance = 0;
  for (const c of counts) {
    variance += (c - mean) ** 2;
  }

  // Scale λ so the penalty is ~20% of average per-driver distance
  const avgDistance = counts.length > 0 ? distanceCost / counts.length : 0;
  const BALANCE_WEIGHT = 0.2;
  const lambda = avgDistance > 0 ? (BALANCE_WEIGHT * avgDistance) : 1000;

  return distanceCost + lambda * variance;
}

/**
 * Pure total distance across all drivers (no balance penalty).
 * Used for metrics display only.
 */
function totalRouteDistance(
  assignments: Map<string, string[]>,
  destinationId: string,
  distanceLookup: DistanceLookup,
): number {
  let cost = 0;
  for (const [driverId, riderIds] of assignments) {
    cost += routeCost(driverId, riderIds, destinationId, distanceLookup);
  }
  return cost;
}

/**
 * Fisher-Yates shuffle (in-place).
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a random initial assignment: shuffle riders and assign round-robin
 * to drivers, respecting seat capacity and avoid constraints.
 */
function randomInitialAssignment(
  drivers: MatchDriver[],
  riders: MatchRider[],
  avoidMap: Map<string, Set<string>>,
): Map<string, string[]> {
  const assignments = new Map<string, string[]>();
  const remainingSeats = new Map<string, number>();
  for (const d of drivers) {
    assignments.set(d.userId, []);
    remainingSeats.set(d.userId, d.availableSeats);
  }

  const shuffledRiders = shuffle([...riders]);
  const shuffledDrivers = shuffle([...drivers]);

  for (const rider of shuffledRiders) {
    // Try each driver in shuffled order
    for (const driver of shuffledDrivers) {
      const seats = remainingSeats.get(driver.userId)!;
      if (seats <= 0) continue;
      const existing = assignments.get(driver.userId)!;
      if (violatesAvoid(rider.userId, driver.userId, existing, avoidMap)) continue;
      existing.push(rider.userId);
      remainingSeats.set(driver.userId, seats - 1);
      break;
    }
  }

  return assignments;
}

/**
 * Run local search (moves + swaps) on a given assignment until no improvement
 * or the deadline is hit. Mutates the assignments map in place.
 * Returns the number of iterations performed and history snapshots.
 */
function localSearch(
  assignments: Map<string, string[]>,
  drivers: MatchDriver[],
  seatCapacity: Map<string, number>,
  avoidMap: Map<string, Set<string>>,
  lookup: DistanceLookup,
  snapshotFn: () => CarpoolAssignment[],
  startIteration: number,
): { iterations: number; history: IterationSnapshot[] } {
  const MAX_ITERATIONS = 50;
  let improved = true;
  let iteration = 0;
  const history: IterationSnapshot[] = [];

  while (improved && iteration < MAX_ITERATIONS) {
    improved = false;
    iteration++;
    const currentCost = totalRouteCost(assignments, DESTINATION_ID, lookup);

    // Try moves: rider from driver A → driver B
    outer_move:
    for (const driverA of drivers) {
      const ridersA = assignments.get(driverA.userId)!;
      for (let i = 0; i < ridersA.length; i++) {
        const riderId = ridersA[i];
        for (const driverB of drivers) {
          if (driverA.userId === driverB.userId) continue;
          const ridersB = assignments.get(driverB.userId)!;
          if (ridersB.length >= seatCapacity.get(driverB.userId)!) continue;
          if (violatesAvoid(riderId, driverB.userId, ridersB, avoidMap)) continue;

          const newRidersA = ridersA.filter((_, idx) => idx !== i);
          const newRidersB = [...ridersB, riderId];
          assignments.set(driverA.userId, newRidersA);
          assignments.set(driverB.userId, newRidersB);

          const newCost = totalRouteCost(assignments, DESTINATION_ID, lookup);
          if (newCost < currentCost - 1) {
            improved = true;
            history.push({ iteration: startIteration + iteration, type: "move", assignments: snapshotFn(), costM: totalRouteDistance(assignments, DESTINATION_ID, lookup) });
            break outer_move;
          }
          assignments.set(driverA.userId, ridersA);
          assignments.set(driverB.userId, ridersB);
        }
      }
    }

    if (improved) continue;

    // Try swaps: exchange a rider between A and B
    outer_swap:
    for (const driverA of drivers) {
      const ridersA = assignments.get(driverA.userId)!;
      for (let i = 0; i < ridersA.length; i++) {
        for (const driverB of drivers) {
          if (driverA.userId >= driverB.userId) continue;
          const ridersB = assignments.get(driverB.userId)!;
          for (let j = 0; j < ridersB.length; j++) {
            const newRidersA = [...ridersA];
            const newRidersB = [...ridersB];
            newRidersA[i] = ridersB[j];
            newRidersB[j] = ridersA[i];

            const othersA = newRidersA.filter((_, idx) => idx !== i);
            const othersB = newRidersB.filter((_, idx) => idx !== j);
            if (violatesAvoid(newRidersA[i], driverA.userId, othersA, avoidMap)) continue;
            if (violatesAvoid(newRidersB[j], driverB.userId, othersB, avoidMap)) continue;

            assignments.set(driverA.userId, newRidersA);
            assignments.set(driverB.userId, newRidersB);

            const newCost = totalRouteCost(assignments, DESTINATION_ID, lookup);
            if (newCost < currentCost - 1) {
              improved = true;
              history.push({ iteration: startIteration + iteration, type: "swap", assignments: snapshotFn(), costM: totalRouteDistance(assignments, DESTINATION_ID, lookup) });
              break outer_swap;
            }
            assignments.set(driverA.userId, ridersA);
            assignments.set(driverB.userId, ridersB);
          }
        }
      }
    }
  }

  return { iterations: iteration, history };
}

/**
 * Multi-start optimized carpool matching.
 *
 * 1. Run greedy + local search as the baseline
 * 2. Run additional random restarts with local search
 * 3. Return the best result found across all restarts
 */
export function optimizedMatchCarpools(
  drivers: MatchDriver[],
  riders: MatchRider[],
  preferences: MatchPreference[],
  destinationLat: number,
  destinationLng: number,
  distanceLookup?: DistanceLookup,
): { assignments: CarpoolAssignment[]; metrics: OptimizationMetrics; history: IterationSnapshot[] } {
  if (drivers.length === 0) {
    return {
      assignments: [],
      metrics: {
        greedyDistanceM: 0,
        optimizedDistanceM: 0,
        assignedRiders: 0,
        unassignedRiders: riders.length,
        preferencesSatisfied: 0,
        preferencesTotal: 0,
        iterations: 0,
        riderSpread: [0, 0, 0],
      },
      history: [],
    };
  }

  const MAX_RESTARTS = 50;

  const avoidMap = new Map<string, Set<string>>();
  for (const pref of preferences) {
    if (pref.type !== "avoid") continue;
    if (!avoidMap.has(pref.userId)) avoidMap.set(pref.userId, new Set());
    avoidMap.get(pref.userId)!.add(pref.targetUserId);
  }

  const seatCapacity = new Map<string, number>();
  for (const driver of drivers) {
    seatCapacity.set(driver.userId, driver.availableSeats);
  }

  // Build distance lookup
  const points = new Map<string, { lat: number; lng: number }>();
  for (const d of drivers) points.set(d.userId, { lat: d.lat, lng: d.lng });
  for (const r of riders) points.set(r.userId, { lat: r.lat, lng: r.lng });
  points.set(DESTINATION_ID, { lat: destinationLat, lng: destinationLng });
  const lookup = distanceLookup ?? buildHaversineDistanceLookup(points);

  const snapshotFrom = (asgn: Map<string, string[]>): CarpoolAssignment[] =>
    drivers.map((d) => ({ driverId: d.userId, riderIds: [...(asgn.get(d.userId) ?? [])] }));

  // ── Run 1: greedy seed ──
  const initial = matchCarpools(drivers, riders, preferences, destinationLat, destinationLng);
  const bestAssignments = new Map<string, string[]>();
  for (const a of initial) {
    bestAssignments.set(a.driverId, [...a.riderIds]);
  }

  const greedyDistanceM = totalRouteDistance(bestAssignments, DESTINATION_ID, lookup);
  const history: IterationSnapshot[] = [
    { iteration: 0, type: "greedy", assignments: snapshotFrom(bestAssignments), costM: greedyDistanceM },
  ];

  const greedyResult = localSearch(
    bestAssignments, drivers, seatCapacity, avoidMap, lookup,
    () => snapshotFrom(bestAssignments), 0,
  );
  history.push(...greedyResult.history);
  let totalIterations = greedyResult.iterations;
  let bestCost = totalRouteCost(bestAssignments, DESTINATION_ID, lookup);
  let bestSnapshot = snapshotFrom(bestAssignments);

  // ── Runs 2+: random restarts ──
  for (let restart = 0; restart < MAX_RESTARTS; restart++) {
    const randomAsgn = randomInitialAssignment(drivers, riders, avoidMap);
    const randomCost = totalRouteCost(randomAsgn, DESTINATION_ID, lookup);

    history.push({
      iteration: totalIterations + 1,
      type: "greedy",
      assignments: snapshotFrom(randomAsgn),
      costM: totalRouteDistance(randomAsgn, DESTINATION_ID, lookup),
    });

    const restartResult = localSearch(
      randomAsgn, drivers, seatCapacity, avoidMap, lookup,
      () => snapshotFrom(randomAsgn), totalIterations,
    );
    history.push(...restartResult.history);
    totalIterations += restartResult.iterations + 1;

    const finalCost = totalRouteCost(randomAsgn, DESTINATION_ID, lookup);
    if (finalCost < bestCost) {
      bestCost = finalCost;
      bestSnapshot = snapshotFrom(randomAsgn);
    }
  }

  // ── Compute final metrics ──
  // Use pure distance (no penalty) for display metrics
  const bestAssignmentsMap = new Map<string, string[]>();
  for (const a of bestSnapshot) {
    bestAssignmentsMap.set(a.driverId, [...a.riderIds]);
  }
  const optimizedDistanceM = totalRouteDistance(bestAssignmentsMap, DESTINATION_ID, lookup);
  const assignedRiders = bestSnapshot.reduce((sum, a) => sum + a.riderIds.length, 0);

  const preferPrefs = preferences.filter((p) => p.type === "prefer");
  let preferencesSatisfied = 0;
  for (const pref of preferPrefs) {
    for (const a of bestSnapshot) {
      const members = [a.driverId, ...a.riderIds];
      if (members.includes(pref.userId) && members.includes(pref.targetUserId)) {
        preferencesSatisfied++;
        break;
      }
    }
  }

  const riderCounts = bestSnapshot.map((a) => a.riderIds.length);
  const riderMin = Math.min(...riderCounts);
  const riderMax = Math.max(...riderCounts);
  const riderMean = riderCounts.length > 0 ? riderCounts.reduce((s, c) => s + c, 0) / riderCounts.length : 0;

  return {
    assignments: bestSnapshot,
    metrics: {
      greedyDistanceM,
      optimizedDistanceM,
      assignedRiders,
      unassignedRiders: riders.length - assignedRiders,
      preferencesSatisfied,
      preferencesTotal: preferPrefs.length,
      iterations: totalIterations,
      riderSpread: [riderMin, riderMax, Math.round(riderMean * 10) / 10],
    },
    history,
  };
}
