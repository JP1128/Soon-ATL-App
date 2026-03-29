/**
 * Seed script — inserts 5 drivers + 12 riders around University of Georgia (Athens, GA).
 *
 * Usage: npx tsx scripts/seed-uga-data.ts
 *
 * Requires SUPABASE_SECRET_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
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

// ---- 17 test people (5 drivers + 12 riders) ----
const PEOPLE = [
  // Drivers
  { full_name: "Jake Morrison",     phone: "7065550201" },
  { full_name: "Priya Patel",       phone: "7065550202" },
  { full_name: "Marcus Thompson",   phone: "7065550203" },
  { full_name: "Sarah Blackwell",   phone: "7065550204" },
  { full_name: "David Chen",        phone: "7065550205" },
  // Riders
  { full_name: "Chloe Rivera",      phone: "7065550206" },
  { full_name: "Tyler Nguyen",      phone: "7065550207" },
  { full_name: "Aisha Johnson",     phone: "7065550208" },
  { full_name: "Ryan O'Brien",      phone: "7065550209" },
  { full_name: "Maya Gonzalez",     phone: "7065550210" },
  { full_name: "Elijah Brooks",     phone: "7065550211" },
  { full_name: "Zoe Park",          phone: "7065550212" },
  { full_name: "Nathan Foster",     phone: "7065550213" },
  { full_name: "Lily Chang",        phone: "7065550214" },
  { full_name: "Isaiah Wright",     phone: "7065550215" },
  { full_name: "Hannah Scott",      phone: "7065550216" },
  { full_name: "Caleb Howard",      phone: "7065550217" },
];

const NUM_DRIVERS = 5;

// Locations around University of Georgia campus & Athens, GA area
const UGA_LOCATIONS = [
  // On / near campus
  { addr: "324 S Lumpkin St, Athens, GA 30602",           lat: 33.9519, lng: -83.3742 },
  { addr: "100 Sanford Dr, Athens, GA 30602",             lat: 33.9500, lng: -83.3733 },
  { addr: "1076 Baxter St, Athens, GA 30606",             lat: 33.9582, lng: -83.3880 },
  { addr: "225 Milledge Ave, Athens, GA 30601",           lat: 33.9555, lng: -83.3770 },
  { addr: "460 E Broad St, Athens, GA 30601",             lat: 33.9588, lng: -83.3650 },
  // Five Points / Downtown
  { addr: "199 W Washington St, Athens, GA 30601",        lat: 33.9571, lng: -83.3785 },
  { addr: "120 E Clayton St, Athens, GA 30601",           lat: 33.9590, lng: -83.3737 },
  { addr: "335 N Thomas St, Athens, GA 30601",            lat: 33.9635, lng: -83.3770 },
  // Eastside / neighborhoods
  { addr: "500 Prince Ave, Athens, GA 30601",             lat: 33.9620, lng: -83.3850 },
  { addr: "1820 Barnett Shoals Rd, Athens, GA 30605",     lat: 33.9280, lng: -83.3450 },
  { addr: "3700 Atlanta Hwy, Athens, GA 30606",           lat: 33.9450, lng: -83.4230 },
  { addr: "196 Alps Rd, Athens, GA 30606",                lat: 33.9340, lng: -83.4050 },
  // North / Winterville side
  { addr: "1425 S Milledge Ave, Athens, GA 30605",        lat: 33.9350, lng: -83.3820 },
  { addr: "2500 W Broad St, Athens, GA 30606",            lat: 33.9520, lng: -83.4100 },
  { addr: "690 Timothy Rd, Athens, GA 30606",             lat: 33.9390, lng: -83.4180 },
  { addr: "255 Whitehead Rd, Athens, GA 30605",           lat: 33.9310, lng: -83.3700 },
  { addr: "1050 Gaines School Rd, Athens, GA 30605",      lat: 33.9220, lng: -83.3580 },
];

async function main(): Promise<void> {
  // Find first open event
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
  console.log(`Seeding into event: "${event.title}" (${event.id})\n`);

  // Create fake auth users + profiles
  const userIds: string[] = [];

  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const fakeEmail = `uga-test-${i + 1}@soon-atl-seed.local`;

    const { data: authUser, error: authErr } =
      await supabase.auth.admin.createUser({
        email: fakeEmail,
        password: randomUUID(),
        email_confirm: true,
        user_metadata: {
          full_name: p.full_name,
          avatar_url: null,
        },
      });

    if (authErr || !authUser.user) {
      console.error(`  ✗ Failed: ${p.full_name} — ${authErr?.message}`);
      continue;
    }

    const userId = authUser.user.id;

    await supabase
      .from("profiles")
      .update({ phone_number: p.phone })
      .eq("id", userId);

    userIds.push(userId);
    console.log(`  ✓ ${p.full_name}`);
  }

  // Insert responses
  for (let i = 0; i < userIds.length; i++) {
    const loc = UGA_LOCATIONS[i % UGA_LOCATIONS.length];
    const isDriver = i < NUM_DRIVERS;

    const { error: respErr } = await supabase.from("responses").upsert(
      {
        event_id: event.id,
        user_id: userIds[i],
        role: isDriver ? "driver" : "rider",
        before_role: isDriver ? "driver" : "rider",
        after_role: isDriver ? "driver" : "rider",
        pickup_address: loc.addr,
        pickup_lat: loc.lat,
        pickup_lng: loc.lng,
        available_seats: isDriver ? Math.floor(Math.random() * 2) + 3 : null, // 3-4 seats
      },
      { onConflict: "event_id,user_id" },
    );

    if (respErr) {
      console.error(`  ✗ Response failed for ${PEOPLE[i].full_name}: ${respErr.message}`);
    }
  }

  console.log(
    `\nDone! Seeded ${NUM_DRIVERS} drivers + ${PEOPLE.length - NUM_DRIVERS} riders (${PEOPLE.length} total)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
