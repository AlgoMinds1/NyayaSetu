// POST /api/complaints/[id]/transition
// Enforces state machine rules + optimistic locking.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidTransition, canRoleTransition, canRoleEscalate, ESCALATE_ACTION, type LifecycleStatus } from "@/lib/state-machine";
import { z } from "zod";
import { notify } from "@/lib/notify";

const Schema = z.object({
  to_status: z.string(),
  remarks:   z.string().min(1),
  version:   z.number().int(),  // optimistic locking
  next_action:    z.string().optional(),
  next_action_at: z.string().optional(),
  expected_disposal_at: z.string().optional(),
  out_of_scope_reason: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = req.headers.get("x-user-role") ?? "";
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { to_status, remarks, version, next_action, next_action_at, expected_disposal_at } = parsed.data;

  // Fetch current complaint
  const { data: complaint, error: fetchError } = await supabase
    .from("complaints")
    .select("id, status, version, case_id, assigned_bureau")
    .eq("id", id)
    .single();

  if (fetchError || !complaint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Optimistic locking check
  if (complaint.version !== version) {
    return NextResponse.json({ error: "Conflict: case was modified. Please reload." }, { status: 409 });
  }

  const fromStatus = complaint.status as LifecycleStatus;

  // Escalation keeps the status: record a case event only.
  if (to_status === ESCALATE_ACTION) {
    if (!canRoleEscalate(fromStatus, role)) {
      return NextResponse.json({ error: `Role '${role}' cannot escalate a case in status ${fromStatus}.` }, { status: 403 });
    }
    const escalatedAt = new Date().toISOString();
    const { error: escalateError } = await supabase.from("case_events").insert({
      complaint_id:    id,
      event_type:      "escalation",
      actor_id:        user.id,
      actor_role:      role,
      bureau:          req.headers.get("x-user-bureau") ?? null,
      old_state:       { status: fromStatus, bureau: complaint.assigned_bureau ?? null },
      new_state:       { status: fromStatus, bureau: complaint.assigned_bureau ?? null },
      remarks,
      event_at:        escalatedAt,
    });
    if (escalateError) return NextResponse.json({ error: "Escalation could not be recorded." }, { status: 500 });
    return NextResponse.json({ success: true, new_status: fromStatus, version });
  }

  const toStatus   = to_status as LifecycleStatus;

  // State machine validation
  if (!isValidTransition(fromStatus, toStatus)) {
    return NextResponse.json({ error: `Invalid transition: ${fromStatus} → ${toStatus}` }, { status: 409 });
  }
  if (!canRoleTransition(fromStatus, toStatus, role)) {
    return NextResponse.json({ error: `Role '${role}' cannot perform this transition.` }, { status: 403 });
  }

  const now = new Date().toISOString();

  // Update complaint + append event atomically (two writes — if event fails, UI will retry)
  const { error: updateError } = await supabase
    .from("complaints")
    .update({
      status:        toStatus,
      last_action_at: now,
      next_action:   next_action ?? null,
      next_action_at: next_action_at ?? null,
      expected_disposal_at: expected_disposal_at ?? undefined,
      version:       version + 1,
      updated_at:    now,
    })
    .eq("id", id)
    .eq("version", version);  // second optimistic lock at DB level

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // event_hash and prev_event_hash are computed by the DB trigger on insert.
  const { error: eventError } = await supabase.from("case_events").insert({
    complaint_id:    id,
    event_type:      "status_transition",
    actor_id:        user.id,
    actor_role:      role,
    bureau:          req.headers.get("x-user-bureau") ?? null,
    old_state:       { status: fromStatus, bureau: complaint.assigned_bureau ?? null },
    new_state:       { status: toStatus },
    remarks,
    event_at:        now,
  });

  if (eventError) return NextResponse.json({ error: "Status changed but its event could not be recorded." }, { status: 500 });

  void notify({ event_type: "status_changed", complaint_id: id, ref: String(version + 1), actor_id: user.id });
  if (toStatus === "referred") void notify({ event_type: "referred_to_college", complaint_id: id, ref: String(version + 1), actor_id: user.id });
  if (toStatus === "decision_recorded") void notify({ event_type: "decision_recorded", complaint_id: id, ref: String(version + 1), actor_id: user.id });

  return NextResponse.json({ success: true, new_status: toStatus, version: version + 1 });
}
