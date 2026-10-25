// POST /api/complaints/[id]/assign — assign bureau and/or officer

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { notify } from "@/lib/notify";

const Schema = z.object({
  assigned_bureau:  z.string().optional(),
  assigned_officer: z.string().uuid().optional(),
  remarks:          z.string().min(1),
  version:          z.number().int(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = req.headers.get("x-user-role") ?? "";
  if (!["pgrc_triage_officer", "bureau_head", "system_admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { assigned_bureau, assigned_officer, remarks, version } = parsed.data;
  const now = new Date().toISOString();

  const { data: complaint } = await supabase
    .from("complaints")
    .select("id, assigned_bureau, assigned_officer, version")
    .eq("id", id).single();

  if (!complaint) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (complaint.version !== version) return NextResponse.json({ error: "Conflict: reload required." }, { status: 409 });

  const { error } = await supabase.from("complaints").update({
    assigned_bureau:  assigned_bureau  ?? complaint.assigned_bureau,
    assigned_officer: assigned_officer ?? complaint.assigned_officer,
    last_action_at:   now,
    version:          version + 1,
    updated_at:       now,
  }).eq("id", id).eq("version", version);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // event_hash and prev_event_hash are computed by the DB trigger on insert.
  const eventPayload = { assigned_bureau, assigned_officer, remarks };
  const { error: eventError } = await supabase.from("case_events").insert({
    complaint_id: id, event_type: "assignment",
    actor_id: user.id, actor_role: role,
    bureau: req.headers.get("x-user-bureau") ?? null,
    new_state: eventPayload, remarks,
    event_at: now,
  });

  if (eventError) return NextResponse.json({ error: "Assignment saved, but its event could not be recorded." }, { status: 500 });

  if (assigned_officer) void notify({ event_type: "case_assigned", complaint_id: id, ref: String(version + 1), actor_id: user.id });

  if (assigned_bureau && assigned_bureau !== complaint.assigned_bureau)
    fetch(`${req.nextUrl.origin}/api/overlap/detect`,{method:"POST",headers:{cookie:req.headers.get("cookie")??"","x-user-role":role}}).catch(()=>{});

  return NextResponse.json({ success: true });
}
