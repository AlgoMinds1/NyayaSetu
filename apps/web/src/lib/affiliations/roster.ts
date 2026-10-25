import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;
export type RosterVerdict = "verified" | "needs_review" | "unable_to_verify";

/** Matches one enrollment number against the institution's ACTIVE roster and claims the row for the user. */
/** Alumni are not on the current roster, so a missing match goes to AICTE manual review (plan §3.3 step 5). Current students stay unable_to_verify. */
export async function matchRoster(db: Db, input: { institutionId: string; userId: string; enrollmentNo: string; programme?: string | null; alumnus?: boolean }): Promise<{ verdict: RosterVerdict; rowId: string | null }> {
  const noMatch: RosterVerdict = input.alumnus ? "needs_review" : "unable_to_verify";
  const { data: version } = await db.from("roster_versions").select("id").eq("institution_id", input.institutionId).eq("is_active", true).maybeSingle();
  if (!version) return { verdict: noMatch, rowId: null };
  const { data: row, error } = await db.from("roster_rows").select("id,programme,claimed_by").eq("version_id", version.id).eq("enrollment_no", input.enrollmentNo).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { verdict: noMatch, rowId: null };
  if (input.programme && row.programme && row.programme.trim().toLowerCase() !== input.programme.trim().toLowerCase()) return { verdict: noMatch, rowId: null };
  if (row.claimed_by === input.userId) return { verdict: "verified", rowId: row.id };
  if (row.claimed_by) return { verdict: "needs_review", rowId: row.id };
  const { data: claimed, error: claimError } = await db.from("roster_rows").update({ claimed_by: input.userId, is_claimed: true }).eq("id", row.id).is("claimed_by", null).select("id").maybeSingle();
  if (claimError) throw new Error(claimError.message);
  return { verdict: claimed ? "verified" : "needs_review", rowId: row.id };
}

/** Re-matches current-student affiliations after a new active roster. Never revokes complaints; verified students missing from the roster go to needs_review. */
export async function reverifyAffiliations(db: Db, institutionId: string) {
  const { data: rows, error } = await db.from("affiliations").select("id,user_id,enrollment_no,programme,status")
    .eq("institution_id", institutionId).eq("type", "current_student").not("enrollment_no", "is", null)
    .in("status", ["verified", "needs_review", "unable_to_verify"]);
  if (error) throw new Error(error.message);
  let changed = 0;
  for (const affiliation of rows ?? []) {
    const { verdict } = await matchRoster(db, { institutionId, userId: affiliation.user_id, enrollmentNo: affiliation.enrollment_no!, programme: affiliation.programme });
    const next: RosterVerdict = affiliation.status === "verified" && verdict === "unable_to_verify" ? "needs_review" : verdict;
    if (next === affiliation.status) continue;
    const now = new Date().toISOString();
    const { error: updateError } = await db.from("affiliations").update({ status: next, reviewed_at: now }).eq("id", affiliation.id);
    if (updateError) throw new Error(updateError.message);
    const { error: attemptError } = await db.from("verification_attempts").insert({ affiliation_id: affiliation.id, method: "roster", outcome: next });
    if (attemptError) throw new Error(attemptError.message);
    changed++;
  }
  return { checked: rows?.length ?? 0, changed };
}
