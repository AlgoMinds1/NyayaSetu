import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

type Db = ReturnType<typeof createAdminClient>;

/** Removes the faculty member's active assignment and records the internal reason plus a college-visible reassignment event. */
export async function recuseFaculty(db: Db, caseId: string, userId: string, reason: string) {
  const { data: participant } = await db.from("participants").select("id").eq("complaint_id", caseId).eq("user_id", userId).eq("role", "faculty").is("removed_at", null).maybeSingle();
  if (!participant) return false;
  const now = new Date().toISOString();
  const { error } = await db.from("participants").update({ removed_at: now }).eq("id", participant.id);
  if (error) throw new Error(error.message);
  const { error: eventError } = await db.from("case_events").insert([
    { complaint_id: caseId, event_type: "faculty_recusal", actor_id: userId, actor_role: "faculty", remarks: reason, visibility: "internal", event_at: now },
    { complaint_id: caseId, event_type: "reassignment_needed", actor_id: userId, actor_role: "faculty", remarks: "Faculty member recused. Committee reassignment needed.", visibility: "college", event_at: now },
  ]);
  if (eventError) throw new Error(eventError.message);
  void notify({ event_type: "reassignment_needed", complaint_id: caseId, ref: now, actor_id: userId });
  return true;
}
