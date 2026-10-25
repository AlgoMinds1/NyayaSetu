// Resets demo data to a clean state, then re-runs the seed. Run with: npm run demo:reset (from the repo root).
// Deletes only complaints with is_demo=true and their dependent rows (events, alerts, links, notifications, ...).
// Real users, institutions, role assignments and audit_events are never deleted: audit_events is the audit trail.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Tables whose complaint_id points at complaints. Deleted before the complaints themselves (FKs are ON DELETE RESTRICT).
const DEPENDENT_TABLES = ["notifications", "case_events", "participants", "deadlines", "evidence", "hearings", "case_feedback", "conflict_declarations"];

const { data: demo, error } = await supabase.from("complaints").select("id").eq("is_demo", true);
if (error) throw new Error(`Listing demo complaints failed: ${error.message}`);
const ids = (demo ?? []).map((c) => c.id);
console.log(`Demo complaints found: ${ids.length}`);

if (ids.length > 0) {
  for (const table of DEPENDENT_TABLES) {
    const { error: e } = await supabase.from(table).delete().in("complaint_id", ids);
    if (e) throw new Error(`Deleting ${table} failed: ${e.message}`);
  }

  // Links and dismissals reference complaints on both sides.
  for (const column of ["complaint_a_id", "complaint_b_id"]) {
    for (const table of ["case_links", "dismissed_pairs"]) {
      const { error: e } = await supabase.from(table).delete().in(column, ids);
      if (e) throw new Error(`Deleting ${table} failed: ${e.message}`);
    }
  }

  const { error: alertError } = await supabase.from("overlap_alerts").delete().overlaps("complaint_ids", ids);
  if (alertError) throw new Error(`Deleting overlap_alerts failed: ${alertError.message}`);

  const { error: complaintError } = await supabase.from("complaints").delete().in("id", ids);
  if (complaintError) throw new Error(`Deleting complaints failed: ${complaintError.message}`);
  console.log("Demo rows deleted.");
}

// Re-seed through the same script `npm run seed` uses, with the same environment.
const seedPath = fileURLToPath(new URL("./seed.mjs", import.meta.url));
execFileSync(process.execPath, [seedPath], { stdio: "inherit", env: process.env });
