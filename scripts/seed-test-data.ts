/**
 * Seed script — inserts ~25 test profiles + responses into the first open event.
 *
 * Usage: npx tsx scripts/seed-test-data.ts
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

// ---- Test people ----
const PEOPLE = [
  { full_name: "Ethan Park",       phone: "4045550101", avatar: null },
  { full_name: "Olivia Kim",       phone: "4045550102", avatar: null },
  { full_name: "Liam Johnson",     phone: "4705550103", avatar: null },
  { full_name: "Sophia Chen",      phone: "6785550104", avatar: null },
  { full_name: "Noah Williams",    phone: "4045550105", avatar: null },
  { full_name: "Emma Davis",       phone: "4705550106", avatar: null },
  { full_name: "James Lee",        phone: "6785550107", avatar: null },
  { full_name: "Isabella Martinez",phone: "4045550108", avatar: null },
  { full_name: "Benjamin Nguyen",  phone: "4705550109", avatar: null },
  { full_name: "Mia Taylor",       phone: "6785550110", avatar: null },
  { full_name: "Lucas Brown",      phone: "4045550111", avatar: null },
  { full_name: "Charlotte Wilson",  phone: "4705550112", avatar: null },
  { full_name: "Alexander Garcia", phone: "6785550113", avatar: null },
  { full_name: "Amelia Thomas",    phone: "4045550114", avatar: null },
  { full_name: "Daniel Anderson",  phone: "4705550115", avatar: null },
  { full_name: "Harper Jackson",   phone: "6785550116", avatar: null },
  { full_name: "Matthew White",    phone: "4045550117", avatar: null },
  { full_name: "Evelyn Harris",    phone: "4705550118", avatar: null },
  { full_name: "Henry Clark",      phone: "6785550119", avatar: null },
  { full_name: "Abigail Lewis",    phone: "4045550120", avatar: null },
  { full_name: "Sebastian Hall",   phone: "4705550121", avatar: null },
  { full_name: "Emily Young",      phone: "6785550122", avatar: null },
  { full_name: "Jack Robinson",    phone: "4045550123", avatar: null },
  { full_name: "Scarlett Walker",  phone: "4705550124", avatar: null },
  { full_name: "Owen King",        phone: "6785550125", avatar: null },
];

// Roles: first 6 = drivers, next 15 = riders, last 4 = attending
const ROLE_SPLIT = { drivers: 6, riders: 15, attending: 4 };

// ATL-area lat/lng for realistic addresses
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
  { addr: "121 Baker St NW, Atlanta, GA 30313",            lat: 33.7672, lng: -84.3960 },
  { addr: "231 Centennial Olympic Park Dr, Atlanta, GA 30313", lat: 33.7603, lng: -84.3930 },
  { addr: "341 Luckie St NW, Atlanta, GA 30313",           lat: 33.7639, lng: -84.3916 },
  { addr: "451 Glen Iris Dr NE, Atlanta, GA 30308",        lat: 33.7738, lng: -84.3680 },
  { addr: "561 Cascade Rd SW, Atlanta, GA 30311",          lat: 33.7290, lng: -84.4230 },
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
  console.log(`Seeding responses into event: "${event.title}" (${event.id})`);

  // Create fake auth users + profiles
  const userIds: string[] = [];

  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const fakeEmail = `test-${i + 1}@soon-atl-seed.local`;

    // Create user via admin auth API (this triggers the profile creation)
    const { data: authUser, error: authErr } =
      await supabase.auth.admin.createUser({
        email: fakeEmail,
        password: randomUUID(), // random throwaway password
        email_confirm: true,
        user_metadata: {
          full_name: p.full_name,
          avatar_url: p.avatar,
        },
      });

    if (authErr || !authUser.user) {
      console.error(
        `Failed to create auth user for ${p.full_name}:`,
        authErr?.message
      );
      continue;
    }

    const userId = authUser.user.id;

    // Update profile with phone number (trigger only sets name/email/avatar)
    await supabase
      .from("profiles")
      .update({ phone_number: p.phone })
      .eq("id", userId);

    userIds.push(userId);
    console.log(`  ✓ ${p.full_name} (${userId})`);
  }

  // Insert responses
  let idx = 0;
  for (const userId of userIds) {
    const loc = ATL_LOCATIONS[idx % ATL_LOCATIONS.length];
    let role: string;
    let beforeRole: string | null;
    let afterRole: string | null;
    let seats: number | null = null;

    if (idx < ROLE_SPLIT.drivers) {
      // Drivers
      role = "driver";
      beforeRole = "driver";
      afterRole = Math.random() > 0.3 ? "driver" : "rider"; // some drivers don't drive back
      seats = Math.floor(Math.random() * 3) + 2; // 2-4 seats
    } else if (idx < ROLE_SPLIT.drivers + ROLE_SPLIT.riders) {
      // Riders
      role = "rider";
      beforeRole = "rider";
      afterRole = "rider";
    } else {
      // Attending only
      role = "attending";
      beforeRole = null;
      afterRole = null;
    }

    const { error: respErr } = await supabase.from("responses").upsert(
      {
        event_id: event.id,
        user_id: userId,
        role,
        before_role: beforeRole,
        after_role: afterRole,
        pickup_address: role !== "attending" ? loc.addr : null,
        pickup_lat: role !== "attending" ? loc.lat : null,
        pickup_lng: role !== "attending" ? loc.lng : null,
        available_seats: role === "driver" ? seats : null,
      },
      { onConflict: "event_id,user_id" }
    );

    if (respErr) {
      console.error(`Failed to insert response for user ${idx}:`, respErr.message);
    }

    idx++;
  }

  console.log(
    `\nDone! Inserted ${ROLE_SPLIT.drivers} drivers, ${ROLE_SPLIT.riders} riders, ${ROLE_SPLIT.attending} attending (${PEOPLE.length} total)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
