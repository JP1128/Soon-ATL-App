/**
 * Seed script — inserts responses for existing profiles into the first open event.
 * Uses real profiles already in the database (no fake auth users created).
 *
 * Usage: npx tsx scripts/seed-responses.ts
 *
 * Requires SUPABASE_SECRET_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(import.meta.dirname ?? __dirname, "..", ".env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ATL-area addresses for realistic pickup locations
const ATL_LOCATIONS = [
  { addr: "123 Peachtree St NE, Atlanta, GA 30303",       lat: 33.7590, lng: -84.3880 },
  { addr: "456 Ponce de Leon Ave, Atlanta, GA 30308",      lat: 33.7735, lng: -84.3658 },
  { addr: "789 North Ave NW, Atlanta, GA 30332",           lat: 33.7714, lng: -84.3932 },
  { addr: "101 Marietta St NW, Atlanta, GA 30303",         lat: 33.7582, lng: -84.3949 },
  { addr: "222 Piedmont Ave NE, Atlanta, GA 30308",        lat: 33.7757, lng: -84.3812 },
  { addr: "333 Spring St NW, Atlanta, GA 30308",           lat: 33.7751, lng: -84.3895 },
  { addr: "444 West Peachtree St, Atlanta, GA 30308",      lat: 33.7746, lng: -84.3878 },
  { addr: "555 Boulevard NE, Atlanta, GA 30312",           lat: 33.7529, lng: -84.3697 },
  { addr: "666 Moreland Ave SE, Atlanta, GA 30316",        lat: 33.7393, lng: -84.3494 },
  { addr: "777 DeKalb Ave NE, Atlanta, GA 30307",          lat: 33.7636, lng: -84.3460 },
  { addr: "888 Monroe Dr NE, Atlanta, GA 30308",           lat: 33.7844, lng: -84.3625 },
  { addr: "999 Highland Ave NE, Atlanta, GA 30306",        lat: 33.7690, lng: -84.3530 },
  { addr: "110 Edgewood Ave SE, Atlanta, GA 30303",        lat: 33.7545, lng: -84.3790 },
  { addr: "220 Auburn Ave NE, Atlanta, GA 30303",          lat: 33.7561, lng: -84.3779 },
  { addr: "330 Ralph McGill Blvd, Atlanta, GA 30312",      lat: 33.7620, lng: -84.3700 },
  { addr: "440 Juniper St NE, Atlanta, GA 30308",          lat: 33.7770, lng: -84.3820 },
  { addr: "550 Techwood Dr NW, Atlanta, GA 30313",         lat: 33.7760, lng: -84.3920 },
  { addr: "660 Krog St NE, Atlanta, GA 30307",             lat: 33.7588, lng: -84.3630 },
  { addr: "770 Metropolitan Pkwy, Atlanta, GA 30310",      lat: 33.7230, lng: -84.4010 },
  { addr: "880 Memorial Dr SE, Atlanta, GA 30316",         lat: 33.7440, lng: -84.3500 },
];

// Departure times (HH:MM) for drivers
const DEPARTURE_TIMES = [
  "17:00", "17:15", "17:30", "17:45", "18:00", "18:15", "18:30",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main(): Promise<void> {
  // 1. Find closest open event
  const { data: events, error: evErr } = await supabase
    .from("events")
    .select("id, title, status")
    .eq("status", "open")
    .order("event_date", { ascending: false })
    .limit(1);

  if (evErr || !events || events.length === 0) {
    console.error("No open event found. Create one first.");
    process.exit(1);
  }

  const event = events[0];
  console.log(`Target event: "${event.title}" (${event.id})\n`);

  // 2. Fetch all existing profiles
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("created_at", { ascending: true });

  if (profErr || !profiles || profiles.length === 0) {
    console.error("No profiles found in the database.");
    process.exit(1);
  }

  console.log(`Found ${profiles.length} existing profiles.`);

  // 3. Check for existing responses to this event (skip those users)
  const { data: existingResponses } = await supabase
    .from("responses")
    .select("user_id")
    .eq("event_id", event.id);

  const alreadyResponded = new Set(
    (existingResponses ?? []).map((r) => r.user_id)
  );

  const available = profiles.filter((p) => !alreadyResponded.has(p.id));
  if (available.length === 0) {
    console.error("All profiles already have responses for this event.");
    process.exit(1);
  }

  // 4. Pick 10-20 profiles (or all if fewer)
  const count = Math.min(
    available.length,
    Math.floor(Math.random() * 11) + 10 // 10..20
  );
  // Shuffle and slice
  const shuffled = available.sort(() => Math.random() - 0.5).slice(0, count);

  // 5. Assign roles: ~30% drivers, ~60% riders, ~10% attending
  const numDrivers = Math.max(2, Math.round(count * 0.3));
  const numAttending = Math.max(0, Math.round(count * 0.1));
  const numRiders = count - numDrivers - numAttending;

  console.log(
    `Seeding ${numDrivers} drivers, ${numRiders} riders, ${numAttending} attending (${count} total)\n`
  );

  let idx = 0;
  for (const profile of shuffled) {
    const loc = ATL_LOCATIONS[idx % ATL_LOCATIONS.length];
    let role: string;
    let beforeRole: string | null;
    let afterRole: string | null;
    let seats: number | null = null;
    let departureTime: string | null = null;
    let note: string | null = null;

    if (idx < numDrivers) {
      role = "driver";
      beforeRole = "driver";
      afterRole = Math.random() > 0.25 ? "driver" : "rider";
      seats = Math.floor(Math.random() * 3) + 2; // 2-4
      departureTime = pick(DEPARTURE_TIMES);
      if (Math.random() > 0.7) note = "I can leave a bit earlier if needed";
    } else if (idx < numDrivers + numRiders) {
      role = "rider";
      beforeRole = "rider";
      afterRole = "rider";
      if (Math.random() > 0.8) note = "Prefer to be picked up close to departure time";
    } else {
      role = "attending";
      beforeRole = null;
      afterRole = null;
    }

    const { error: respErr } = await supabase.from("responses").upsert(
      {
        event_id: event.id,
        user_id: profile.id,
        role,
        before_role: beforeRole,
        after_role: afterRole,
        pickup_address: role !== "attending" ? loc.addr : null,
        pickup_lat: role !== "attending" ? loc.lat : null,
        pickup_lng: role !== "attending" ? loc.lng : null,
        available_seats: role === "driver" ? seats : null,
        departure_time: departureTime,
        note,
      },
      { onConflict: "event_id,user_id" }
    );

    if (respErr) {
      console.error(
        `  ✗ ${profile.full_name}: ${respErr.message}`
      );
    } else {
      const tag =
        role === "driver"
          ? `driver (${seats} seats, depart ${departureTime})`
          : role;
      console.log(`  ✓ ${profile.full_name} → ${tag}`);
    }

    idx++;
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
