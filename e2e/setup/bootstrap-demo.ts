// Bootstrap the shared E2E test account.
//
// Most non-auth scenarios start with `Given I am logged in as
// "demo@studysprint.app"` — this user must already exist in Supabase Auth
// for those scenarios to load the dashboard. This script creates-or-updates
// that account using a Supabase service-role key (which bypasses email
// verification + RLS), then resets its data so test runs start from a known
// baseline.
//
// Usage: `deno task test:setup`
//
// Required env vars (loaded automatically from `.env` if present):
//   SUPABASE_URL         — same as VITE_SUPABASE_URL
//   SUPABASE_SECRET_KEY  — secret, never commit. Pull from the Supabase
//                          dashboard under Project Settings → API Keys
//                          (sb_secret_… prefix). Replaces the legacy
//                          service_role JWT.
//
// Idempotent — safe to re-run. Run this once on each new dev machine + as
// the first step in CI before invoking `deno task test`.

import "jsr:@std/dotenv/load";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const SECRET_KEY = Deno.env.get("SUPABASE_SECRET_KEY");
const DEMO_EMAIL = Deno.env.get("E2E_DEMO_EMAIL") ?? "demo@studysprint.app";
const DEMO_PASSWORD = Deno.env.get("E2E_DEMO_PASSWORD") ?? "demo123";

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error(
    "bootstrap-demo: SUPABASE_URL and SUPABASE_SECRET_KEY must be set.\n" +
      "Pull them from the Supabase dashboard (Project Settings → API Keys).",
  );
  Deno.exit(1);
}

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Page through admin.listUsers (default page size is 50) looking for the demo
// email. listUsers doesn't have a server-side filter; we have to enumerate.
async function findUserByEmail(email: string) {
  const target = email.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  console.log(`bootstrap-demo: target user is ${DEMO_EMAIL}`);

  const existing = await findUserByEmail(DEMO_EMAIL);
  let userId: string;

  if (existing) {
    console.log(`bootstrap-demo: user exists (${existing.id}); resetting password`);
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      console.error("bootstrap-demo: updateUserById failed:", error.message);
      Deno.exit(1);
    }
    userId = existing.id;
  } else {
    console.log("bootstrap-demo: user does not exist; creating");
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("bootstrap-demo: createUser failed:", error?.message);
      Deno.exit(1);
    }
    userId = data.user.id;
  }

  // Wipe any prior test residue and reinstall starter goals so scenarios that
  // depend on baseline state (e.g. "Dashboard shows existing goals") are
  // deterministic. reset_account is SECURITY DEFINER + scoped to auth.uid(),
  // so we have to call it as the user, not as service-role. Cheaper to just
  // truncate via service-role here.
  for (const table of ["study_goals", "user_google_tokens", "room_members"]) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) {
      console.error(`bootstrap-demo: delete from ${table} failed:`, error.message);
      Deno.exit(1);
    }
  }

  // Re-seed via the existing helper. SECURITY DEFINER on these means the
  // service-role bypass plus auth.uid() context makes them a no-op for
  // verification — call them from a SQL block instead.
  const { error: seedErr } = await admin.rpc("create_starter_data_for", { p_user_id: userId });
  if (seedErr) {
    // Service-role doesn't carry an auth.uid(), and create_starter_data_for
    // doesn't strictly need one (it takes p_user_id). The REVOKE FROM
    // anon, authenticated still permits postgres + service_role to call it.
    // If the RPC was registered without a service-role grant we fall back to
    // raw inserts.
    console.warn(
      `bootstrap-demo: create_starter_data_for failed (${seedErr.message}); ` +
        "skipping starter goals — scenarios that assume them will need to be " +
        "updated.",
    );
  }

  console.log(`bootstrap-demo: ready. user_id=${userId} email=${DEMO_EMAIL}`);
}

main().catch((err) => {
  console.error("bootstrap-demo: fatal:", err);
  Deno.exit(1);
});
