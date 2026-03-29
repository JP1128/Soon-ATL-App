/**
 * Cleanup script — removes all test data seeded by seed-test-data.ts
 *
 * Identifies test users by their email pattern: test-*@soon-atl-seed.local
 * Deletes in order: carpool_riders → carpools → preferences → responses → profiles → auth users
 *
 * Usage: npx tsx scripts/cleanup-test-data.ts
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

async function main(): Promise<void> {
  // 1. Find all test auth users by email pattern
  const { data: authData, error: listErr } =
    await supabase.auth.admin.listUsers({ perPage: 1000 });

  if (listErr) {
    console.error("Failed to list users:", listErr.message);
    process.exit(1);
  }

  const testUsers = authData.users.filter((u) =>
    u.email?.endsWith("@soon-atl-seed.local")
  );

  if (testUsers.length === 0) {
    console.log("No test users found. Nothing to clean up.");
    return;
  }

  const testUserIds = testUsers.map((u) => u.id);
  console.log(`Found ${testUsers.length} test users to remove.\n`);

  // 2. Delete carpool_riders where rider_id is a test user
  const { error: crErr, count: crCount } = await supabase
    .from("carpool_riders")
    .delete({ count: "exact" })
    .in("rider_id", testUserIds);

  if (crErr) console.error("  carpool_riders error:", crErr.message);
  else console.log(`  Deleted ${crCount ?? 0} carpool_riders rows`);

  // 3. Delete carpools where driver_id is a test user
  // First delete any carpool_riders referencing those carpools
  const { data: testCarpools } = await supabase
    .from("carpools")
    .select("id")
    .in("driver_id", testUserIds);

  if (testCarpools && testCarpools.length > 0) {
    const carpoolIds = testCarpools.map((c) => c.id);
    const { error: cr2Err, count: cr2Count } = await supabase
      .from("carpool_riders")
      .delete({ count: "exact" })
      .in("carpool_id", carpoolIds);

    if (cr2Err) console.error("  carpool_riders (by carpool) error:", cr2Err.message);
    else console.log(`  Deleted ${cr2Count ?? 0} additional carpool_riders rows (from test driver carpools)`);
  }

  const { error: cpErr, count: cpCount } = await supabase
    .from("carpools")
    .delete({ count: "exact" })
    .in("driver_id", testUserIds);

  if (cpErr) console.error("  carpools error:", cpErr.message);
  else console.log(`  Deleted ${cpCount ?? 0} carpools rows`);

  // 4. Delete preferences where response_id belongs to a test user, or target_user_id is a test user
  const { data: testResponses } = await supabase
    .from("responses")
    .select("id")
    .in("user_id", testUserIds);

  if (testResponses && testResponses.length > 0) {
    const responseIds = testResponses.map((r) => r.id);
    const { error: pErr1, count: pCount1 } = await supabase
      .from("preferences")
      .delete({ count: "exact" })
      .in("response_id", responseIds);

    if (pErr1) console.error("  preferences (by response) error:", pErr1.message);
    else console.log(`  Deleted ${pCount1 ?? 0} preferences rows (by response_id)`);
  }

  const { error: pErr2, count: pCount2 } = await supabase
    .from("preferences")
    .delete({ count: "exact" })
    .in("target_user_id", testUserIds);

  if (pErr2) console.error("  preferences (by target) error:", pErr2.message);
  else console.log(`  Deleted ${pCount2 ?? 0} preferences rows (by target_user_id)`);

  // 5. Delete responses
  const { error: rErr, count: rCount } = await supabase
    .from("responses")
    .delete({ count: "exact" })
    .in("user_id", testUserIds);

  if (rErr) console.error("  responses error:", rErr.message);
  else console.log(`  Deleted ${rCount ?? 0} responses rows`);

  // 6. Delete push_subscriptions
  const { error: psErr, count: psCount } = await supabase
    .from("push_subscriptions")
    .delete({ count: "exact" })
    .in("user_id", testUserIds);

  if (psErr) console.error("  push_subscriptions error:", psErr.message);
  else console.log(`  Deleted ${psCount ?? 0} push_subscriptions rows`);

  // 7. Delete profiles
  const { error: profErr, count: profCount } = await supabase
    .from("profiles")
    .delete({ count: "exact" })
    .in("id", testUserIds);

  if (profErr) console.error("  profiles error:", profErr.message);
  else console.log(`  Deleted ${profCount ?? 0} profiles rows`);

  // 8. Delete auth users
  let authDeleted = 0;
  for (const user of testUsers) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error(`  Failed to delete auth user ${user.email}:`, delErr.message);
    } else {
      authDeleted++;
    }
  }
  console.log(`  Deleted ${authDeleted} auth users`);

  console.log("\nCleanup complete!");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
